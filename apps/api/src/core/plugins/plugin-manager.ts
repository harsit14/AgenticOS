import { nanoid } from 'nanoid';

export interface PluginContext {
  db: unknown; // Database instance
  llm: unknown; // LLM Provider
  config: Record<string, unknown>;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (params: unknown, context: PluginContext) => Promise<unknown>;
  requiresApproval?: boolean;
  rateLimit?: number;
}

export interface DashboardPage {
  id: string;
  title: string;
  path: string;
  icon?: string;
}

export interface DashboardWidget {
  id: string;
  name: string;
  size: 'small' | 'medium' | 'large';
  render: () => unknown;
}

export interface PluginSettings {
  [key: string]: unknown;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: string[];
  tools?: Tool[];
  dashboard?: {
    pages?: DashboardPage[];
    widgets?: DashboardWidget[];
  };
  settingsSchema?: Record<string, unknown>;
}

export interface InstalledPlugin {
  id: string;
  manifest: PluginManifest;
  enabled: boolean;
  settings: PluginSettings;
  installedAt: number;
  updatedAt: number;
}

export class PluginSandbox {
  private allowedApis: Set<string> = new Set([
    'db.query',
    'llm.chat',
    'config.get',
    'config.set',
    'event.emit',
    'event.on',
  ]);

  // Check if plugin has permission for an API
  hasPermission(pluginId: string, api: string, manifest: PluginManifest): boolean {
    if (manifest.permissions.includes('*')) return true;
    return manifest.permissions.includes(api);
  }

  // Validate plugin manifest
  validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest || typeof manifest !== 'object') {
      errors.push('Manifest must be an object');
      return { valid: false, errors };
    }

    const m = manifest as Record<string, unknown>;

    if (!m.id || typeof m.id !== 'string') {
      errors.push('Missing or invalid id field');
    }
    if (!m.name || typeof m.name !== 'string') {
      errors.push('Missing or invalid name field');
    }
    if (!m.version || typeof m.version !== 'string') {
      errors.push('Missing or invalid version field');
    }

    // Validate permissions
    if (m.permissions && Array.isArray(m.permissions)) {
      const validPermissions = ['*', 'db.query', 'llm.chat', 'config.get', 'config.set', 'event.emit', 'event.on'];
      for (const perm of m.permissions as string[]) {
        if (!validPermissions.includes(perm)) {
          errors.push(`Invalid permission: ${perm}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

export class PluginManager {
  private plugins: Map<string, InstalledPlugin> = new Map();
  private sandbox: PluginSandbox = new PluginSandbox();
  private lifecycleHooks: Map<string, Array<(ctx: PluginContext) => Promise<void>>> = new Map();

  // Install plugin from manifest
  async install(manifest: PluginManifest): Promise<InstalledPlugin> {
    const validation = this.sandbox.validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Invalid plugin manifest: ${validation.errors.join(', ')}`);
    }

    // Check if already installed
    if (this.plugins.has(manifest.id)) {
      throw new Error('Plugin already installed');
    }

    const plugin: InstalledPlugin = {
      id: manifest.id,
      manifest,
      enabled: true,
      settings: {},
      installedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.plugins.set(manifest.id, plugin);

    // Run onInstall hook
    await this.runLifecycleHook('onInstall', plugin.id);

    return plugin;
  }

  // Uninstall plugin
  async uninstall(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    // Run onUninstall hook
    await this.runLifecycleHook('onUninstall', pluginId);

    this.plugins.delete(pluginId);
  }

  // Enable plugin
  async enable(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    plugin.enabled = true;
    plugin.updatedAt = Date.now();
  }

  // Disable plugin
  async disable(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    plugin.enabled = false;
    plugin.updatedAt = Date.now();
  }

  // Update plugin settings
  async updateSettings(pluginId: string, settings: PluginSettings): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    plugin.settings = { ...plugin.settings, ...settings };
    plugin.updatedAt = Date.now();
  }

  // Get plugin by ID
  getPlugin(pluginId: string): InstalledPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  // Get all installed plugins
  getAllPlugins(): InstalledPlugin[] {
    return Array.from(this.plugins.values());
  }

  // Get enabled plugins
  getEnabledPlugins(): InstalledPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.enabled);
  }

  // Get all tools from enabled plugins
  getPluginTools(): Tool[] {
    const tools: Tool[] = [];
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.manifest.tools) {
        tools.push(...plugin.manifest.tools);
      }
    }
    return tools;
  }

  // Get all dashboard pages from enabled plugins
  getPluginPages(): DashboardPage[] {
    const pages: DashboardPage[] = [];
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.manifest.dashboard?.pages) {
        pages.push(...plugin.manifest.dashboard.pages);
      }
    }
    return pages;
  }

  // Get all widgets from enabled plugins
  getPluginWidgets(): DashboardWidget[] {
    const widgets: DashboardWidget[] = [];
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.manifest.dashboard?.widgets) {
        widgets.push(...plugin.manifest.dashboard.widgets);
      }
    }
    return widgets;
  }

  // Register lifecycle hook
  onLifecycleEvent(event: string, callback: (ctx: PluginContext) => Promise<void>): void {
    if (!this.lifecycleHooks.has(event)) {
      this.lifecycleHooks.set(event, []);
    }
    this.lifecycleHooks.get(event)!.push(callback);
  }

  // Run lifecycle hook for all enabled plugins
  private async runLifecycleHook(event: string, pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    const context: PluginContext = {
      db: {}, // Would be actual DB instance in production
      llm: {}, // Would be actual LLM instance in production
      config: plugin.settings,
    };

    const hooks = this.lifecycleHooks.get(event) || [];

    switch (event) {
      case 'onInstall':
        if (typeof plugin.manifest.onInstall === 'function') {
          await plugin.manifest.onInstall(context);
        }
        break;
      case 'onUninstall':
        if (typeof plugin.manifest.onUninstall === 'function') {
          await plugin.manifest.onUninstall();
        }
        break;
    }

    for (const hook of hooks) {
      try {
        await hook(context);
      } catch (error) {
        console.error(`Error in lifecycle hook ${event} for plugin ${pluginId}:`, error);
      }
    }
  }

  // Execute tool from plugin
  async executeTool(
    toolId: string,
    params: unknown,
    context: PluginContext
  ): Promise<unknown> {
    const tools = this.getPluginTools();
    const tool = tools.find(t => t.id === toolId);

    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    // Check rate limit
    if (tool.rateLimit) {
      // In production, implement actual rate limiting
    }

    // Execute tool
    return await tool.handler(params, context);
  }

  // Execute agentCreate lifecycle hook
  async onAgentCreate(agent: unknown): Promise<unknown> {
    let modifiedAgent = agent;

    for (const plugin of this.getEnabledPlugins()) {
      if (typeof plugin.manifest.onAgentCreate === 'function') {
        modifiedAgent = await plugin.manifest.onAgentCreate(modifiedAgent);
      }
    }

    return modifiedAgent;
  }

  // Export plugin registry
  exportRegistry(): { plugins: InstalledPlugin[]; exportedAt: string } {
    return {
      plugins: this.getAllPlugins(),
      exportedAt: new Date().toISOString(),
    };
  }

  // Import plugin registry
  importRegistry(data: { plugins: InstalledPlugin[] }): number {
    let imported = 0;
    for (const plugin of data.plugins) {
      if (!this.plugins.has(plugin.id)) {
        this.plugins.set(plugin.id, plugin);
        imported++;
      }
    }
    return imported;
  }
}

// Official plugins
export const OFFICIAL_PLUGINS: PluginManifest[] = [
  {
    id: 'github',
    name: 'GitHub Integration',
    version: '1.0.0',
    description: 'Connect to GitHub for repository management and code analysis',
    author: 'AgenticOS',
    permissions: ['db.query', 'llm.chat'],
    tools: [
      {
        id: 'github-search',
        name: 'Search Repositories',
        description: 'Search GitHub repositories',
        parameters: { query: { type: 'string' }, limit: { type: 'number' } },
        handler: async (params) => ({ results: [] }),
      },
      {
        id: 'github-create-issue',
        name: 'Create Issue',
        description: 'Create a GitHub issue',
        parameters: { repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } },
        handler: async (params) => ({ issueUrl: '' }),
      },
    ],
  },
  {
    id: 'slack',
    name: 'Slack Integration',
    version: '1.0.0',
    description: 'Send notifications and messages to Slack',
    author: 'AgenticOS',
    permissions: ['db.query'],
    tools: [
      {
        id: 'slack-send-message',
        name: 'Send Message',
        description: 'Send a message to a Slack channel',
        parameters: { channel: { type: 'string' }, text: { type: 'string' } },
        handler: async (params) => ({ success: true }),
      },
    ],
  },
  {
    id: 'jira',
    name: 'Jira Integration',
    version: '1.0.0',
    description: 'Create and manage Jira tickets',
    author: 'AgenticOS',
    permissions: ['db.query', 'llm.chat'],
    tools: [
      {
        id: 'jira-create-ticket',
        name: 'Create Ticket',
        description: 'Create a Jira ticket',
        parameters: { project: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' } },
        handler: async (params) => ({ ticketId: '' }),
      },
    ],
  },
  {
    id: 'notion',
    name: 'Notion Integration',
    version: '1.0.0',
    description: 'Sync data with Notion databases',
    author: 'AgenticOS',
    permissions: ['db.query'],
    tools: [
      {
        id: 'notion-query',
        name: 'Query Database',
        description: 'Query a Notion database',
        parameters: { databaseId: { type: 'string' }, filter: { type: 'object' } },
        handler: async (params) => ({ results: [] }),
      },
    ],
  },
  {
    id: 'database',
    name: 'Database Connector',
    version: '1.0.0',
    description: 'Query external databases for context enrichment',
    author: 'AgenticOS',
    permissions: ['db.query'],
    tools: [
      {
        id: 'db-query',
        name: 'Run Query',
        description: 'Execute a SQL query',
        parameters: { connectionId: { type: 'string' }, query: { type: 'string' } },
        handler: async (params) => ({ rows: [] }),
        requiresApproval: true,
      },
    ],
  },
];

// Singleton
let pluginManager: PluginManager | null = null;

export function getPluginManager(): PluginManager {
  if (!pluginManager) {
    pluginManager = new PluginManager();
  }
  return pluginManager;
}