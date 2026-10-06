export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Process-local sliding window. This is the production interface for login,
 * invitation, and upload routes. A single instance is enough for the demo and
 * for one Node server. Multi-instance deployments should replace this class
 * with a shared store that implements the same consume() contract.
 */
export class MemoryRateLimiter {
  private hits = new Map<string, number[]>();

  consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitDecision {
    const threshold = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((stamp) => stamp > threshold);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
  }

  reset(): void {
    this.hits.clear();
  }
}

export const serverRateLimiter = new MemoryRateLimiter();
