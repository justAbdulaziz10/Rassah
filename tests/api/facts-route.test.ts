// Route-level test for DELETE /api/products/[id]/facts (demo control): it is public while DEMO_MODE
// is on, so it shares the extract limiter (each clear causes a Gemini call on the next order).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "../fakes/memory-repo";

vi.mock("next/server", () => ({ connection: async () => {} }));

let repo: MemoryRepo;
vi.mock("@/lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http")>();
  return { ...actual, repoOrError: () => repo, log: () => {} };
});

const { DELETE } = await import("@/app/api/products/[id]/facts/route");
const { extractLimiter } = await import("@/lib/rate-limit");

function call(ip = "203.0.113.7", productId = "p-01") {
  const request = new Request(`http://localhost/api/products/${productId}/facts`, {
    method: "DELETE",
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
  });
  return DELETE(request, { params: Promise.resolve({ id: productId }) } as RouteContext<"/api/products/[id]/facts">);
}

beforeEach(() => {
  repo = new MemoryRepo();
  extractLimiter.reset();
  vi.stubEnv("DEMO_MODE", "true");
});

describe("DELETE /api/products/[id]/facts", () => {
  it("is not available when DEMO_MODE is off", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    expect((await call()).status).toBe(404);
  });

  it("returns 429 once one IP exceeds the extract window, other IPs unaffected", async () => {
    for (let i = 0; i < 10; i++) expect((await call()).status).toBe(200);
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await call("198.51.100.2")).status).toBe(200);
  });
});
