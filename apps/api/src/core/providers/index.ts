import type { LLMProvider, ProviderConfig } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider, AzureProvider } from './openai.js';
import { OllamaProvider, LMStudioProvider } from './ollama.js';
import { GroqProvider, PerplexityProvider, MistralProvider } from './groq.js';
import { VertexProvider, BedrockProvider } from './vertex.js';

// Provider registry with lazy initialization
type ProviderConstructor = new () => LLMProvider;

const PROVIDERS: Record<string, ProviderConstructor> = {
  anthropic: AnthropicProvider,
  openai: OpenAIProvider,
  azure: AzureProvider,
  ollama: OllamaProvider,
  lmstudio: LMStudioProvider,
  groq: GroqProvider,
  perplexity: PerplexityProvider,
  mistral: MistralProvider,
  vertex: VertexProvider,
  bedrock: BedrockProvider,
};

export class ProviderManager {
  private providers: Map<string, LLMProvider> = new Map();
  private config: Map<string, ProviderConfig> = new Map();

  constructor() {
    // Initialize with default configs
    for (const [id, ProviderClass] of Object.entries(PROVIDERS)) {
      this.config.set(id, {});
    }
  }

  // Configure a specific provider
  configure(providerId: string, config: ProviderConfig): void {
    this.config.set(providerId, config);
    // Reset provider instance to use new config
    this.providers.delete(providerId);
  }

  // Get or create a provider instance
  getProvider(providerId: string): LLMProvider | null {
    if (!PROVIDERS[providerId]) {
      return null;
    }

    if (!this.providers.has(providerId)) {
      const ProviderClass = PROVIDERS[providerId];
      this.providers.set(providerId, new ProviderClass());
    }

    return this.providers.get(providerId)!;
  }

  // Get all available provider IDs
  getAvailableProviders(): string[] {
    return Object.keys(PROVIDERS);
  }

  // Check if a provider is configured (has valid API key or is local)
  isConfigured(providerId: string): boolean {
    const provider = this.getProvider(providerId);
    if (!provider) return false;

    const info = provider.getInfo();
    if (info.isLocal) return true; // Local providers are always available

    const config = this.config.get(providerId) || {};
    return !!config.apiKey || !!process.env[`${providerId.toUpperCase()}_API_KEY`];
  }

  // Ping all providers
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id] of Object.entries(PROVIDERS)) {
      if (!this.isConfigured(id)) {
        results[id] = false;
        continue;
      }

      const provider = this.getProvider(id);
      if (provider) {
        results[id] = await provider.ping().catch(() => false);
      } else {
        results[id] = false;
      }
    }

    return results;
  }

  // Get provider info for all providers
  getAllProviderInfo(): Array<{ id: string; name: string; configured: boolean; status: string }> {
    return Object.entries(PROVIDERS).map(([id, ProviderClass]) => {
      const provider = new ProviderClass();
      const info = provider.getInfo();
      const configured = this.isConfigured(id);

      return {
        id,
        name: info.name,
        configured,
        status: configured ? (info.isLocal ? 'available' : 'ready') : 'not_configured',
      };
    });
  }

  // Clear provider cache (useful for config changes)
  clearCache(): void {
    this.providers.clear();
  }
}

// Singleton instance
let providerManager: ProviderManager | null = null;

export function getProviderManager(): ProviderManager {
  if (!providerManager) {
    providerManager = new ProviderManager();
  }
  return providerManager;
}

// Helper to get provider by model ID
export function getProviderForModel(modelId: string): LLMProvider | null {
  const manager = getProviderManager();

  // Map model prefixes to providers
  const modelToProvider: Record<string, string> = {
    'claude': 'anthropic',
    'gpt': 'openai',
    'gemini': 'vertex',
    'llama': 'ollama',
    'mistral': 'mistral',
    'phi': 'ollama',
    'codellama': 'ollama',
  };

  for (const [prefix, providerId] of Object.entries(modelToProvider)) {
    if (modelId.toLowerCase().includes(prefix)) {
      return manager.getProvider(providerId);
    }
  }

  // Check model database to find provider
  // This would integrate with the database in Step 4
  return manager.getProvider('anthropic'); // Default
}

// Export all provider classes for direct use
export {
  AnthropicProvider,
  OpenAIProvider,
  AzureProvider,
  OllamaProvider,
  LMStudioProvider,
  GroqProvider,
  PerplexityProvider,
  MistralProvider,
  VertexProvider,
  BedrockProvider,
};