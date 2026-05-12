import { db } from '../../db/index.js';
import { agents } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface AgentVersion {
  id: string;
  agentId: string;
  version: number;
  config: string; // JSON stringified config
  createdAt: Date;
  createdBy: string;
  changeNote?: string;
}

export interface VersionDiff {
  added: string[];
  removed: string[];
  modified: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
}

export class AgentVersionManager {
  private versions: Map<string, AgentVersion[]> = new Map();

  // Save a new version of an agent
  async saveVersion(
    agentId: string,
    config: string,
    createdBy: string,
    changeNote?: string
  ): Promise<AgentVersion> {
    // Get current latest version number
    const versions = await this.getVersions(agentId);
    const latestVersion = versions.length > 0 ? versions[0].version : 0;

    const newVersion: AgentVersion = {
      id: nanoid(),
      agentId,
      version: latestVersion + 1,
      config,
      createdAt: new Date(),
      createdBy,
      changeNote,
    };

    // In production, store in a versions table
    // For now, use in-memory cache
    if (!this.versions.has(agentId)) {
      this.versions.set(agentId, []);
    }
    this.versions.get(agentId)!.unshift(newVersion);

    return newVersion;
  }

  // Get all versions of an agent
  async getVersions(agentId: string): Promise<AgentVersion[]> {
    return this.versions.get(agentId) || [];
  }

  // Get specific version
  async getVersion(agentId: string, version: number): Promise<AgentVersion | null> {
    const versions = await this.getVersions(agentId);
    return versions.find(v => v.version === version) || null;
  }

  // Rollback to a specific version
  async rollback(agentId: string, version: number): Promise<boolean> {
    const targetVersion = await this.getVersion(agentId, version);
    if (!targetVersion) return false;

    // Parse the config and update the agent
    const config = JSON.parse(targetVersion.config);

    await db.update(agents).set({
      name: config.name,
      description: config.description,
      persona: config.persona,
      tools: config.tools,
      defaultModelId: config.defaultModelId,
      fallbackModelId: config.fallbackModelId,
      memoryConfig: config.memoryConfig,
      rateLimit: config.rateLimit,
      tags: config.tags,
      updatedAt: new Date(),
    }).where(eq(agents.id, agentId)).run();

    return true;
  }

  // Compare two versions
  async compareVersions(agentId: string, v1: number, v2: number): Promise<VersionDiff> {
    const version1 = await this.getVersion(agentId, v1);
    const version2 = await this.getVersion(agentId, v2);

    if (!version1 || !version2) {
      throw new Error('Version not found');
    }

    const config1 = JSON.parse(version1.config);
    const config2 = JSON.parse(version2.config);

    const diff: VersionDiff = {
      added: [],
      removed: [],
      modified: [],
    };

    // Compare persona
    if (config1.persona.systemPrompt !== config2.persona.systemPrompt) {
      diff.modified.push({
        field: 'persona.systemPrompt',
        oldValue: config1.persona.systemPrompt,
        newValue: config2.persona.systemPrompt,
      });
    }

    if (config1.persona.temperature !== config2.persona.temperature) {
      diff.modified.push({
        field: 'persona.temperature',
        oldValue: config1.persona.temperature,
        newValue: config2.persona.temperature,
      });
    }

    // Compare tools
    const tools1 = config1.tools?.map((t: { id: string }) => t.id) || [];
    const tools2 = config2.tools?.map((t: { id: string }) => t.id) || [];

    diff.added = tools2.filter((t: string) => !tools1.includes(t));
    diff.removed = tools1.filter((t: string) => !tools2.includes(t));

    // Compare model
    if (config1.defaultModelId !== config2.defaultModelId) {
      diff.modified.push({
        field: 'defaultModelId',
        oldValue: config1.defaultModelId,
        newValue: config2.defaultModelId,
      });
    }

    // Compare memory config
    if (JSON.stringify(config1.memoryConfig) !== JSON.stringify(config2.memoryConfig)) {
      diff.modified.push({
        field: 'memoryConfig',
        oldValue: config1.memoryConfig,
        newValue: config2.memoryConfig,
      });
    }

    return diff;
  }

  // Auto-save version before updates (call from agent manager)
  async autoSave(agentId: string, config: Record<string, unknown>, userId: string): Promise<void> {
    await this.saveVersion(agentId, JSON.stringify(config), userId, 'Auto-saved before update');
  }

  // Get version history summary
  async getHistorySummary(agentId: string): Promise<Array<{
    version: number;
    createdAt: string;
    createdBy: string;
    changeNote?: string;
  }>> {
    const versions = await this.getVersions(agentId);
    return versions.map(v => ({
      version: v.version,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy,
      changeNote: v.changeNote,
    }));
  }
}

// Singleton
let versionManager: AgentVersionManager | null = null;

export function getVersionManager(): AgentVersionManager {
  if (!versionManager) {
    versionManager = new AgentVersionManager();
  }
  return versionManager;
}