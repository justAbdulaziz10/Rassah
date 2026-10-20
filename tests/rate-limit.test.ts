import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter (sliding window)", () => {
  it("allows `limit` hits per window, then blocks until the oldest hit expires", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(rl.check("a", 0)).toEqual({ ok: true, remaining: 2 });
    rl.check("a", 100);
    rl.check("a", 200);
    expect(rl.check("a", 300)).toEqual({ ok: false, retryAfterSec: 1 });
    expect(rl.check("a", 999).ok).toBe(false);
    // The hit at t=0 leaves the window at t=1000.
    expect(rl.check("a", 1000).ok).toBe(true);
    expect(rl.check("a", 1001).ok).toBe(false);
  });

  it("counts keys independently and bounds memory", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("b", 0).ok).toBe(true);
    expect(rl.check("a", 1).ok).toBe(false);
    rl.check("c", 2); // evicts the least recently used key ("b")
    expect(rl.check("b", 3).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry, then x-real-ip, then a shared bucket", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": " 1.2.3.4 , 10.0.0.1" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
