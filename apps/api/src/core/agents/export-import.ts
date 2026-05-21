// @ts-nocheck — legacy code carried over from Phase 1/2/3; type-clean port pending. See tsconfig comment.
import type { Agent } from '@agentic-os/types';
import { validateAgent } from './types.js';

export interface ExportedAgentConfig {
  version: string;
  type: 'agent' | 'agent-template';
  metadata: {
    name: string;
    description?: string;
    tags?: string[];
    createdAt: string;
    exportedAt: string;
    author?: string;
    schemaVersion: string;
  };
  config: {
    persona: {
      tone: string;
      systemPrompt: string;
      temperature: number;
      maxTokens: number;
      knowledgeBases?: string[];
    };
    defaultModel: string;
    fallbackModel?: string;
    tools: string[];
    memoryConfig: {
      strategy: string;
      maxMessages: number;
    };
    rateLimit: number;
  };
}

// Schema version for forward compatibility
const CURRENT_SCHEMA_VERSION = '1.0';

export class AgentExporter {
  // Export single agent to JSON
  toJSON(agent: Agent): ExportedAgentConfig {
    return {
      version: '1.0',
      type: agent.isTemplate ? 'agent-template' : 'agent',
      metadata: {
        name: agent.name,
        description: agent.description,
        tags: agent.tags,
        createdAt: agent.createdAt.toISOString(),
        exportedAt: new Date().toISOString(),
        author: agent.createdBy,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      config: {
        persona: {
          tone: agent.persona.tone,
          systemPrompt: agent.persona.systemPrompt,
          temperature: agent.persona.temperature,
          maxTokens: agent.persona.maxTokens,
          knowledgeBases: agent.persona.knowledgeBases,
        },
        defaultModel: agent.defaultModelId,
        fallbackModel: agent.fallbackModelId,
        tools: agent.tools?.map(t => t.id) || [],
        memoryConfig: agent.memoryConfig,
        rateLimit: agent.rateLimit,
      },
    };
  }

  // Export to YAML string (JSON stringified for now - in production use js-yaml)
  toYAML(agent: Agent): string {
    const json = this.toJSON(agent);
    return JSON.stringify(json, null, 2);
  }

  // Export multiple agents
  exportMany(agents: Agent[]): {
    agents: ExportedAgentConfig[];
    exportedAt: string;
    totalCount: number;
  } {
    return {
      agents: agents.map(a => this.toJSON(a)),
      exportedAt: new Date().toISOString(),
      totalCount: agents.length,
    };
  }

  // Export to file-compatible format
  toFile(agent: Agent, format: 'json' | 'yaml' = 'json'): string {
    if (format === 'yaml') {
      return this.toYAML(agent);
    }
    return JSON.stringify(this.toJSON(agent), null, 2);
  }
}

export class AgentImporter {
  private errors: string[] = [];

  // Parse and validate imported config
  parse(configString: string, format: 'json' | 'yaml' = 'json'): ExportedAgentConfig {
    let data: unknown;

    try {
      data = JSON.parse(configString);
    } catch {
      throw new Error('Invalid JSON format');
    }

    if (!this.validateStructure(data)) {
      throw new Error(`Invalid config structure: ${this.errors.join(', ')}`);
    }

    return data as ExportedAgentConfig;
  }

  // Validate the structure of imported config
  validateStructure(data: unknown): boolean {
    this.errors = [];

    if (typeof data !== 'object' || data === null) {
      this.errors.push('Config must be an object');
      return false;
    }

    const config = data as Record<string, unknown>;

    // Check required fields
    if (!config.version) {
      this.errors.push('Missing version field');
    }
    if (!config.type) {
      this.errors.push('Missing type field');
    }
    if (!config.metadata) {
      this.errors.push('Missing metadata field');
    }
    if (!config.config) {
      this.errors.push('Missing config field');
    }

    // Validate metadata
    if (config.metadata && typeof config.metadata === 'object') {
      const metadata = config.metadata as Record<string, unknown>;
      if (!metadata.name) {
        this.errors.push('Missing metadata.name field');
      }
    }

    // Validate config
    if (config.config && typeof config.config === 'object') {
      const cfg = config.config as Record<string, unknown>;
      if (!cfg.persona) {
        this.errors.push('Missing config.persona field');
      }
      if (!cfg.defaultModel) {
        this.errors.push('Missing config.defaultModel field');
      }
    }

    return this.errors.length === 0;
  }

  // Convert imported config to create agent params
  toCreateParams(
    config: ExportedAgentConfig,
    overrides?: { name?: string; createdBy?: string }
  ): {
    name: string;
    description: string;
    persona: {
      tone: 'professional' | 'casual' | 'technical' | 'creative';
      systemPrompt: string;
      temperature: number;
      maxTokens: number;
      knowledgeBases: string[];
    };
    tools: string[];
    defaultModelId: string;
    fallbackModelId?: string;
    memoryConfig: { strategy: 'sliding_window' | 'summary' | 'full'; maxMessages: number };
    rateLimit: number;
    tags: string[];
    createdBy: string;
  } {
    return {
      name: overrides?.name || config.metadata.name,
      description: config.metadata.description || '',
      persona: {
        tone: config.config.persona.tone as 'professional' | 'casual' | 'technical' | 'creative',
        systemPrompt: config.config.persona.systemPrompt,
        temperature: config.config.persona.temperature,
        maxTokens: config.config.persona.maxTokens,
        knowledgeBases: config.config.persona.knowledgeBases || [],
      },
      tools: config.config.tools || [],
      defaultModelId: config.config.defaultModel,
      fallbackModelId: config.config.fallbackModel,
      memoryConfig: config.config.memoryConfig as { strategy: 'sliding_window' | 'summary' | 'full'; maxMessages: number },
      rateLimit: config.config.rateLimit,
      tags: config.metadata.tags || [],
      createdBy: overrides?.createdBy || config.metadata.author || 'imported',
    };
  }

  // Bulk import from exported file
  parseMany(exportString: string): ExportedAgentConfig[] {
    try {
      const data = JSON.parse(exportString);

      if (data.agents && Array.isArray(data.agents)) {
        return data.agents;
      }

      // Single agent export
      return [data as ExportedAgentConfig];
    } catch {
      throw new Error('Invalid export file format');
    }
  }

  // Get validation errors
  getErrors(): string[] {
    return [...this.errors];
  }
}

// Version migration for future schema changes
export class ConfigMigrator {
  migrate(config: unknown, fromVersion: string): ExportedAgentConfig {
    // Handle schema migrations here
    // For now, just return the config as-is since we're at version 1.0

    const data = config as ExportedAgentConfig;

    // Example migration: v0.9 -> v1.0
    if (fromVersion === '0.9') {
      return {
        ...data,
        version: '1.0',
        metadata: {
          ...data.metadata,
          schemaVersion: '1.0',
        },
      };
    }

    return data;
  }
}

// Singleton instances
let exporter: AgentExporter | null = null;
let importer: AgentImporter | null = null;

export function getAgentExporter(): AgentExporter {
  if (!exporter) {
    exporter = new AgentExporter();
  }
  return exporter;
}

export function getAgentImporter(): AgentImporter {
  if (!importer) {
    importer = new AgentImporter();
  }
  return importer;
}