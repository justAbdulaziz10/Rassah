import "server-only";

// Per-IP sliding-window rate limit for routes that can trigger Gemini extraction (pack, admin extract).
// State lives in this server instance's memory: on Vercel each serverless instance counts on its own,
// and a cold start resets the counters. That is an accepted limit for the demo (docs/decisions.md).
// The hard spend bound is the shared daily read cap in lib/ai/catalog.ts.

type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSec: number };

export type RateLimiter = {
  check(key: string, now?: number): RateLimitResult;
  reset(): void;
};

/** Allows at most `limit` hits per key in any rolling `windowMs` period. */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key, now = Date.now()) {
      const since = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > since);
      hits.delete(key); // re-insert so Map order tracks recency
      hits.set(key, recent);
      if (recent.length >= limit) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
      }
      recent.push(now);
      // Bound memory: drop the least recently used keys.
      while (hits.size > maxKeys) hits.delete(hits.keys().next().value as string);
      return { ok: true, remaining: limit - recent.length };
    },
    reset() {
      hits.clear();
    },
  };
}

/** Client IP from the proxy headers Vercel sets. Falls back to one shared bucket. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export function rateLimitOrNull(limiter: RateLimiter, request: Request): Response | null {
  const result = limiter.check(clientIp(request));
  if (result.ok) return null;
  return Response.json(
    { error: "Too many requests. Try again shortly." },
    { status: 429, headers: { "retry-after": String(result.retryAfterSec) } },
  );
}

// Shared limiters (one per route family). Generous enough for a live demo, tight enough to stop
// a loop from burning the Gemini quota.
export const packLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
export const extractLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
/** Store checkout writes an order to the database: enough for a live demo, not for a flood. */
export const storeLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
