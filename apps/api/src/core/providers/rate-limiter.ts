import type { RateLimiter } from './types.js';

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

export class TokenBucketRateLimiter implements RateLimiter {
  private buckets: Map<string, RateLimitState> = new Map();
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxTokens = 100, refillRate = 10) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
  }

  private getBucket(providerId: string): RateLimitState {
    if (!this.buckets.has(providerId)) {
      this.buckets.set(providerId, {
        tokens: this.maxTokens,
        lastRefill: Date.now(),
      });
    }
    return this.buckets.get(providerId)!;
  }

  private refill(providerId: string): void {
    const bucket = this.getBucket(providerId);
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;

    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  async acquire(providerId: string): Promise<boolean> {
    this.refill(providerId);
    const bucket = this.getBucket(providerId);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  release(providerId: string): void {
    // No-op for token bucket (release not needed)
  }

  getWaitTime(providerId: string): number {
    const bucket = this.getBucket(providerId);
    if (bucket.tokens >= 1) return 0;

    const tokensNeeded = 1 - bucket.tokens;
    return Math.ceil(tokensNeeded / this.refillRate * 1000); // ms
  }
}

// Per-provider rate limits based on provider API limits
export const PROVIDER_RATE_LIMITS: Record<string, { requestsPerMinute: number; tokensPerMinute: number }> = {
  anthropic: { requestsPerMinute: 50, tokensPerMinute: 100000 },
  openai: { requestsPerMinute: 500, tokensPerMinute: 150000 },
  azure: { requestsPerMinute: 1000, tokensPerMinute: 250000 },
  vertex: { requestsPerMinute: 60, tokensPerMinute: 100000 },
  bedrock: { requestsPerMinute: 100, tokensPerMinute: 200000 },
  ollama: { requestsPerMinute: 99999, tokensPerMinute: 999999999 },
  lmstudio: { requestsPerMinute: 99999, tokensPerMinute: 999999999 },
  groq: { requestsPerMinute: 30, tokensPerMinute: 15000 },
  perplexity: { requestsPerMinute: 60, tokensPerMinute: 100000 },
  mistral: { requestsPerMinute: 60, tokensPerMinute: 100000 },
};

export class MultiProviderRateLimiter {
  private limiters: Map<string, TokenBucketRateLimiter> = new Map();

  getLimiter(providerId: string): TokenBucketRateLimiter {
    if (!this.limiters.has(providerId)) {
      const limits = PROVIDER_RATE_LIMITS[providerId] || { requestsPerMinute: 100, tokensPerMinute: 100000 };
      // Convert to tokens (1 request = 1 token)
      const tokens = limits.requestsPerMinute;
      const refillRate = tokens / 60; // per second
      this.limiters.set(providerId, new TokenBucketRateLimiter(tokens, refillRate));
    }
    return this.limiters.get(providerId)!;
  }

  async acquire(providerId: string): Promise<boolean> {
    return this.getLimiter(providerId).acquire(providerId);
  }

  async waitForToken(providerId: string): Promise<void> {
    const limiter = this.getLimiter(providerId);

    while (!(await limiter.acquire(providerId))) {
      const waitTime = limiter.getWaitTime(providerId);
      await new Promise(resolve => setTimeout(resolve, waitTime + 10));
    }
  }

  getWaitTime(providerId: string): number {
    return this.getLimiter(providerId).getWaitTime(providerId);
  }
}

// Singleton
let rateLimiter: MultiProviderRateLimiter | null = null;

export function getRateLimiter(): MultiProviderRateLimiter {
  if (!rateLimiter) {
    rateLimiter = new MultiProviderRateLimiter();
  }
  return rateLimiter;
}