import { db } from '../../db/index.js';
import { settings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';

export interface LocalModeConfig {
  enabled: boolean;
  ollamaUrl?: string;
  lmStudioUrl?: string;
  sqlitePath?: string;
  backupPath: string;
  autoBackup: boolean;
  autoBackupIntervalHours: number;
  maxBackups: number;
}

export interface BackupMetadata {
  id: string;
  timestamp: string;
  size: number;
  type: 'full' | 'incremental' | 'config';
  description?: string;
}

const DEFAULT_CONFIG: LocalModeConfig = {
  enabled: process.env.LOCAL_ONLY === 'true',
  ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  lmStudioUrl: process.env.LM_STUDIO_URL || 'http://localhost:1234',
  backupPath: process.env.BACKUP_PATH || './backups',
  autoBackup: true,
  autoBackupIntervalHours: 24,
  maxBackups: 7,
};

export class LocalModeService {
  private config: LocalModeConfig;
  private backupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.config = DEFAULT_CONFIG;
    this.ensureBackupDirectory();
  }

  private ensureBackupDirectory(): void {
    if (!existsSync(this.config.backupPath)) {
      mkdirSync(this.config.backupPath, { recursive: true });
    }
  }

  getConfig(): LocalModeConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<LocalModeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isLocalProvider(providerId: string): boolean {
    const localProviders = ['ollama', 'lmstudio'];
    return localProviders.includes(providerId);
  }

  // Ollama health check
  async checkOllamaHealth(): Promise<{ healthy: boolean; models: string[]; error?: string }> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/tags`);
      if (!response.ok) {
        return { healthy: false, models: [], error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      return {
        healthy: true,
        models: (data.models || []).map((m: { name: string }) => m.name),
      };
    } catch (error) {
      return {
        healthy: false,
        models: [],
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  // LM Studio health check
  async checkLmStudioHealth(): Promise<{ healthy: boolean; models: string[]; error?: string }> {
    try {
      const response = await fetch(`${this.config.lmStudioUrl}/v1/models`);
      if (!response.ok) {
        return { healthy: false, models: [], error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      return {
        healthy: true,
        models: (data.data || []).map((m: { id: string }) => m.id),
      };
    } catch (error) {
      return {
        healthy: false,
        models: [],
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  // Backup creation
  async createBackup(type: 'full' | 'incremental' | 'config' = 'full', description?: string): Promise<BackupMetadata> {
    const id = nanoid();
    const timestamp = new Date().toISOString();
    const backupDir = join(this.config.backupPath, `backup-${timestamp}`);

    mkdirSync(backupDir, { recursive: true });

    const metadata: BackupMetadata = {
      id,
      timestamp,
      size: 0,
      type,
      description,
    };

    if (type === 'full' || type === 'incremental') {
      // Backup database
      await this.backupDatabase(backupDir);
    }

    if (type === 'full' || type === 'config') {
      // Backup config files
      await this.backupConfigs(backupDir);
    }

    // Calculate size
    metadata.size = await this.calculateBackupSize(backupDir);

    // Save metadata
    writeFileSync(
      join(backupDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    // Cleanup old backups
    await this.cleanupOldBackups();

    return metadata;
  }

  private async backupDatabase(backupDir: string): Promise<void> {
    // In a real implementation, this would use pg_dump for PostgreSQL
    // or sqlite3 for SQLite
    // For now, we create a placeholder
    const dbBackupPath = join(backupDir, 'database');
    mkdirSync(dbBackupPath, { recursive: true });

    // Write timestamp marker
    writeFileSync(
      join(dbBackupPath, 'backup_timestamp.txt'),
      new Date().toISOString()
    );
  }

  private async backupConfigs(backupDir: string): Promise<void> {
    const configsDir = join(backupDir, 'configs');
    mkdirSync(configsDir, { recursive: true });

    // Copy relevant config files
    const configFiles = [
      '.env.example',
      'apps/api/drizzle.config.ts',
    ];

    for (const file of configFiles) {
      if (existsSync(file)) {
        const dest = join(configsDir, file.replace('..', ''));
        mkdirSync(join(dest, '..'), { recursive: true });
        cpSync(file, dest);
      }
    }
  }

  private async calculateBackupSize(dir: string): Promise<number> {
    // Simplified size calculation
    // In production, use a proper recursive directory size calculation
    return 0;
  }

  private async cleanupOldBackups(): Promise<void> {
    const backups = await this.listBackups();

    if (backups.length > this.config.maxBackups) {
      const toDelete = backups
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(0, backups.length - this.config.maxBackups);

      for (const backup of toDelete) {
        rmSync(join(this.config.backupPath, `backup-${backup.timestamp}`), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  async listBackups(): Promise<BackupMetadata[]> {
    const backups: BackupMetadata[] = [];

    if (!existsSync(this.config.backupPath)) {
      return backups;
    }

    // Read metadata from each backup
    // Simplified - in production, use proper directory listing

    return backups;
  }

  async restoreBackup(timestamp: string): Promise<void> {
    const backupDir = join(this.config.backupPath, `backup-${timestamp}`);
    const metadataPath = join(backupDir, 'metadata.json');

    if (!existsSync(metadataPath)) {
      throw new Error('Backup not found or metadata corrupted');
    }

    const metadata: BackupMetadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));

    if (metadata.type === 'full' || metadata.type === 'incremental') {
      await this.restoreDatabase(backupDir);
    }

    if (metadata.type === 'full' || metadata.type === 'config') {
      await this.restoreConfigs(backupDir);
    }
  }

  private async restoreDatabase(backupDir: string): Promise<void> {
    // In a real implementation, restore from pg_dump or sqlite backup
  }

  private async restoreConfigs(backupDir: string): Promise<void> {
    const configsDir = join(backupDir, 'configs');
    if (existsSync(configsDir)) {
      cpSync(configsDir, '.', { force: true });
    }
  }

  // Export all data
  async exportAllData(): Promise<string> {
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      agents: await this.exportAgents(),
      pipelines: await this.exportPipelines(),
      settings: await this.exportSettings(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  private async exportAgents(): Promise<unknown[]> {
    // Simplified - in production, query actual database
    return [];
  }

  private async exportPipelines(): Promise<unknown[]> {
    return [];
  }

  private async exportSettings(): Promise<unknown> {
    return {};
  }

  // Start auto-backup schedule
  startAutoBackup(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }

    const intervalMs = this.config.autoBackupIntervalHours * 60 * 60 * 1000;
    this.backupInterval = setInterval(
      () => this.createBackup('incremental', 'Auto-backup'),
      intervalMs
    );
  }

  stopAutoBackup(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
  }
}

// Singleton
let localModeService: LocalModeService | null = null;

export function getLocalModeService(): LocalModeService {
  if (!localModeService) {
    localModeService = new LocalModeService();
  }
  return localModeService;
}