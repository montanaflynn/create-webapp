// In-memory token bucket per API key. Capacity is the burst size; refill
// happens continuously at `refillPerSecond`. State dies on process restart —
// fine for friction protection, not a security boundary. Swap the singleton
// for a postgres- or redis-backed implementation when scale demands it.

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; retryAfter: number };

export interface RateLimiter {
  consume(key: string, cost?: number): Promise<RateLimitDecision>;
  reset(): void;
}

type Bucket = { tokens: number; updatedAt: number };

export class InMemoryTokenBucket implements RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private capacity: number,
    private refillPerSecond: number,
    private now: () => number = Date.now,
  ) {}

  async consume(key: string, cost = 1): Promise<RateLimitDecision> {
    const now = this.now();
    const prev = this.buckets.get(key) ?? {
      tokens: this.capacity,
      updatedAt: now,
    };
    const elapsedSeconds = (now - prev.updatedAt) / 1000;
    const refilled = Math.min(
      this.capacity,
      prev.tokens + elapsedSeconds * this.refillPerSecond,
    );

    if (refilled < cost) {
      this.buckets.set(key, { tokens: refilled, updatedAt: now });
      const deficit = cost - refilled;
      const retryAfter = Math.max(1, Math.ceil(deficit / this.refillPerSecond));
      return { ok: false, retryAfter };
    }

    this.buckets.set(key, { tokens: refilled - cost, updatedAt: now });
    return { ok: true };
  }

  reset(): void {
    this.buckets.clear();
  }
}

const CAPACITY = parseInt(process.env.CWA_RATE_LIMIT_BURST ?? "60", 10) || 60;
const REFILL =
  parseInt(process.env.CWA_RATE_LIMIT_PER_SECOND ?? "10", 10) || 10;

export const rateLimiter: RateLimiter = new InMemoryTokenBucket(
  CAPACITY,
  REFILL,
);

// Per-IP bucket for OAuth dynamic client registration. Registration is
// rare and unauthenticated — separate from the per-credential bucket so
// abusing /api/oauth/register can't drain a real user's budget. Tight
// limits: 10 burst, 1 per minute sustained.
export const dcrRateLimiter: RateLimiter = new InMemoryTokenBucket(
  10,
  1 / 60,
);

/**
 * Best-effort client IP extraction. Behind a real proxy, `x-forwarded-for`
 * is the first hop the proxy added. In dev (no proxy) it's missing and we
 * fall back to a constant — fine, since dev isn't worth gaming.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
