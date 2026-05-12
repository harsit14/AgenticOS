import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import { agents } from '../../db/schema.js';
import { eq, desc, gte, and } from 'drizzle-orm';

export type PatternType = 'prompt_optimization' | 'tool_sequence' | 'context_strategy';

export interface LearnedPattern {
  id: string;
  type: PatternType;
  agentIds: string[];
  pattern: {
    trigger: string;
    action: string;
    success: number;
    failure: number;
    avgImprovement?: number;
  };
  confidence: number;
  autoApply: boolean;
  approved: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PatternSuggestion {
  pattern: LearnedPattern;
  targetAgents: string[];
  confidenceScore: number;
  reasoning: string;
}

export interface PatternDetectionResult {
  detected: boolean;
  patterns: LearnedPattern[];
  suggestions: PatternSuggestion[];
}

export class HiveMind {
  private patterns: Map<string, LearnedPattern> = new Map();
  private feedbackHistory: Map<string, { success: boolean; improvement?: number }[]> = new Map();

  // Analyze successful agent executions and detect patterns
  async analyzeExecution(
    agentId: string,
    executionData: {
      input: unknown;
      output: unknown;
      success: boolean;
      tokensUsed?: number;
      latencyMs?: number;
    }
  ): Promise<PatternDetectionResult> {
    const patterns: LearnedPattern[] = [];
    const suggestions: PatternSuggestion[] = [];

    // Store feedback for future analysis
    this.recordFeedback(agentId, executionData);

    // Detect prompt patterns
    const promptPatterns = await this.detectPromptPatterns(agentId, executionData);
    patterns.push(...promptPatterns);

    // Detect tool sequences
    const toolPatterns = await this.detectToolSequencePatterns(agentId, executionData);
    patterns.push(...toolPatterns);

    // Generate suggestions for similar agents
    const similarAgents = await this.findSimilarAgents(agentId);
    for (const pattern of patterns) {
      if (pattern.confidence >= 0.7) {
        suggestions.push({
          pattern,
          targetAgents: similarAgents.map(a => a.id),
          confidenceScore: pattern.confidence,
          reasoning: this.generateReasoning(pattern),
        });
      }
    }

    return { detected: patterns.length > 0, patterns, suggestions };
  }

  // Record execution feedback
  private recordFeedback(
    agentId: string,
    data: { success: boolean; improvement?: number }
  ): void {
    if (!this.feedbackHistory.has(agentId)) {
      this.feedbackHistory.set(agentId, []);
    }
    this.feedbackHistory.get(agentId)!.push(data);

    // Keep only last 100 feedback items per agent
    const history = this.feedbackHistory.get(agentId)!;
    if (history.length > 100) {
      history.shift();
    }
  }

  // Detect prompt optimization patterns
  private async detectPromptPatterns(
    agentId: string,
    executionData: { input: unknown; output: unknown; success: boolean }
  ): Promise<LearnedPattern[]> {
    const patterns: LearnedPattern[] = [];

    // Example pattern detection: if agent succeeds with specific prompt structures
    if (executionData.success) {
      const existingPatterns = Array.from(this.patterns.values()).filter(
        p => p.type === 'prompt_optimization' && p.agentIds.includes(agentId)
      );

      // Create a new pattern if no similar one exists
      const inputStr = JSON.stringify(executionData.input);
      const similarPattern = existingPatterns.find(p =>
        p.pattern.trigger.length > 0 &&
        inputStr.includes(p.pattern.trigger)
      );

      if (!similarPattern) {
        const pattern: LearnedPattern = {
          id: nanoid(),
          type: 'prompt_optimization',
          agentIds: [agentId],
          pattern: {
            trigger: inputStr.substring(0, 100),
            action: JSON.stringify(executionData.output).substring(0, 100),
            success: 1,
            failure: 0,
          },
          confidence: 0.5,
          autoApply: false,
          approved: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        this.patterns.set(pattern.id, pattern);
        patterns.push(pattern);
      } else {
        // Update existing pattern
        similarPattern.pattern.success++;
        similarPattern.confidence = Math.min(0.95, similarPattern.pattern.success / (similarPattern.pattern.success + similarPattern.pattern.failure));
        similarPattern.updatedAt = Date.now();
        patterns.push(similarPattern);
      }
    }

    return patterns;
  }

  // Detect effective tool sequences
  private async detectToolSequencePatterns(
    agentId: string,
    executionData: { input: unknown; output: unknown; success: boolean }
  ): Promise<LearnedPattern[]> {
    const patterns: LearnedPattern[] = [];

    // In production, this would analyze actual tool call sequences
    // For now, return empty array

    return patterns;
  }

  // Find agents similar to the given agent (for pattern sharing)
  async findSimilarAgents(agentId: string, limit = 5): Promise<Array<{ id: string; similarity: number }>> {
    const agent = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);

    if (!agent.length) return [];

    const allAgents = await db.select().from(agents).where(eq(agents.isTemplate, false));

    // Calculate similarity based on persona, tools, memory config
    const similarities = allAgents
      .filter(a => a.id !== agentId)
      .map(a => {
        let score = 0;

        // Check shared tools
        const agentTools = JSON.parse(a.tools as string) as Array<{ id: string }>;
        score += agentTools.length * 0.1;

        // Check similar memory strategy
        const agentMemory = JSON.parse(a.memoryConfig as string) as { strategy: string };
        const targetMemory = JSON.parse(agent[0].memoryConfig as string) as { strategy: string };
        if (agentMemory.strategy === targetMemory.strategy) {
          score += 0.3;
        }

        return { id: a.id, similarity: score };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return similarities;
  }

  // Get patterns for an agent
  getPatternsForAgent(agentId: string): LearnedPattern[] {
    return Array.from(this.patterns.values()).filter(p =>
      p.agentIds.includes(agentId) || p.autoApply
    );
  }

  // Get pending pattern approvals
  getPendingApprovals(): LearnedPattern[] {
    return Array.from(this.patterns.values()).filter(p => !p.approved);
  }

  // Approve a pattern
  async approvePattern(patternId: string, autoApply: boolean = false): Promise<LearnedPattern | null> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return null;

    pattern.approved = true;
    pattern.autoApply = autoApply;
    pattern.updatedAt = Date.now();

    return pattern;
  }

  // Reject a pattern
  deletePattern(patternId: string): boolean {
    return this.patterns.delete(patternId);
  }

  // Apply pattern to agent
  async applyPatternToAgent(
    patternId: string,
    agentId: string
  ): Promise<{ success: boolean; changes: Record<string, unknown> }> {
    const pattern = this.patterns.get(patternId);
    if (!pattern || !pattern.approved) {
      return { success: false, changes: {} };
    }

    const changes: Record<string, unknown> = {};

    switch (pattern.type) {
      case 'prompt_optimization':
        // In production, update agent persona with optimized prompt
        changes.promptUpdated = true;
        break;
      case 'tool_sequence':
        changes.toolSequenceUpdated = true;
        break;
      case 'context_strategy':
        changes.contextStrategyUpdated = true;
        break;
    }

    if (!pattern.agentIds.includes(agentId)) {
      pattern.agentIds.push(agentId);
    }

    return { success: true, changes };
  }

  // Track pattern effectiveness
  async trackPatternEffectiveness(
    patternId: string,
    agentId: string,
    result: { improved: boolean; metricChange?: number }
  ): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    // Update success rate based on actual results
    if (result.improved) {
      pattern.pattern.avgImprovement = result.metricChange;
    }

    // Recalculate confidence
    const total = pattern.pattern.success + pattern.pattern.failure;
    pattern.confidence = total > 0 ? pattern.pattern.success / total : 0;

    pattern.updatedAt = Date.now();

    // Auto-disable low confidence patterns
    if (pattern.confidence < 0.3) {
      pattern.autoApply = false;
    }
  }

  // Generate reasoning for why a pattern was detected
  private generateReasoning(pattern: LearnedPattern): string {
    switch (pattern.type) {
      case 'prompt_optimization':
        return `Detected successful prompt pattern with ${pattern.pattern.success} successes. Confidence: ${(pattern.confidence * 100).toFixed(0)}%`;
      case 'tool_sequence':
        return `Identified effective tool combination used in ${pattern.pattern.success} executions`;
      case 'context_strategy':
        return `Found memory optimization strategy with ${(pattern.confidence * 100).toFixed(0)}% success rate`;
      default:
        return 'Pattern detected based on execution analysis';
    }
  }

  // Export patterns for sharing
  exportPatterns(): LearnedPattern[] {
    return Array.from(this.patterns.values()).filter(p => p.approved);
  }

  // Import patterns from external source
  importPatterns(patterns: LearnedPattern[]): number {
    let imported = 0;
    for (const pattern of patterns) {
      if (!this.patterns.has(pattern.id)) {
        this.patterns.set(pattern.id, { ...pattern, approved: false });
        imported++;
      }
    }
    return imported;
  }

  // Get all patterns
  getAllPatterns(): LearnedPattern[] {
    return Array.from(this.patterns.values());
  }

  // Get patterns by type
  getPatternsByType(type: PatternType): LearnedPattern[] {
    return Array.from(this.patterns.values()).filter(p => p.type === type);
  }

  // Get top patterns by confidence
  getTopPatterns(limit = 10): LearnedPattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.approved)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }
}

// Singleton
let hiveMind: HiveMind | null = null;

export function getHiveMind(): HiveMind {
  if (!hiveMind) {
    hiveMind = new HiveMind();
  }
  return hiveMind;
}