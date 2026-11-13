import type { FastifyReply, FastifyRequest } from 'fastify';

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimiterOptions = {
  max: number;
  windowMs: number;
  trustedProxies: Set<string>;
};

export function resolveClientIp(request: FastifyRequest, trustedProxies: Set<string>): string {
  const remoteAddress = request.socket.remoteAddress ?? 'unknown';
  if (!trustedProxies.has(remoteAddress)) {
    return remoteAddress;
  }

  const forwarded = request.headers['x-forwarded-for'];
  if (!forwarded) {
    return remoteAddress;
  }

  const raw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  const hops = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  // Walk backwards from right to left to find the rightmost untrusted hop
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    const hop = hops[i];
    if (hop && !trustedProxies.has(hop)) {
      return hop;
    }
  }

  return hops[0] ?? remoteAddress;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly options: RateLimiterOptions) {
    this.cleanupTimer = setInterval(
      () => {
        this.prune();
      },
      Math.max(10_000, options.windowMs),
    );
    this.cleanupTimer.unref();
  }

  public check(request: FastifyRequest): { allowed: boolean; retryAfterSeconds: number } {
    const key = resolveClientIp(request, this.options.trustedProxies);
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + this.options.windowMs,
      });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count >= this.options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public prune(now = Date.now()): number {
    let removed = 0;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  public size(): number {
    return this.buckets.size;
  }

  public dispose(): void {
    clearInterval(this.cleanupTimer);
    this.buckets.clear();
  }
}

export function makeRateLimitHook(limiter: RateLimiter) {
  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (request.url === '/api/health') {
      return;
    }
    const result = limiter.check(request);
    if (!result.allowed) {
      void reply.header('Retry-After', String(result.retryAfterSeconds));
      return reply.code(429).send({
        code: 'ERR_RATE_LIMITED',
        params: { retryAfterSeconds: result.retryAfterSeconds },
      });
    }
  };
}
