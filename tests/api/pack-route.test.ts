// Route-level tests for POST /api/orders/[id]/pack: the DEMO_MODE gate on simulated outages (P6.30)
// and the per-IP rate limit (P10.11). Real pipeline + real serverExtractDeps; only the request
// scope (`connection`) and the repo lookup are stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "../fakes/memory-repo";

vi.mock("next/server", () => ({ connection: async () => {} }));

let repo: MemoryRepo;
vi.mock("@/lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http")>();
  return { ...actual, repoOrError: () => repo, log: () => {} };
});

const { POST } = await import("@/app/api/orders/[id]/pack/route");
const { packLimiter } = await import("@/lib/rate-limit");

function seedRepo() {
  const r = new MemoryRepo();
  r.cartons = [{ id: "L", name: "L", inner: [40, 30, 25], maxWeightG: 15000, tareG: 450, costSar: 2.6 }];
  r.products.set("p-01", { id: "p-01", name: "منتج", description: "وصف", url: null, category: null, sourceHash: "h-p-01" });
  r.orders.set("1001", { id: "1001", demo: null, expect: null, lines: [{ productId: "p-01", qty: 1 }] });
  return r;
}

function call(body: unknown, ip = "203.0.113.7", orderId = "1001") {
  const request = new Request(`http://localhost/api/orders/${orderId}/pack`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id: orderId }) } as RouteContext<"/api/orders/[id]/pack">);
}

beforeEach(() => {
  repo = seedRepo();
  packLimiter.reset();
  vi.stubEnv("GEMINI_API_KEY", ""); // no network: a real extraction attempt fails with config_error
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/orders/[id]/pack — simulated outage (P6.30)", () => {
  it("DEMO_MODE=true + simulateOutage:true → outage events, products need measurement", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const res = await call({ simulateOutage: true });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("needs_measurement");
    expect(repo.extractionEvents.length).toBeGreaterThan(0);
    expect(repo.extractionEvents.every((e) => e.status === "simulated_outage")).toBe(true);
  });

  it("DEMO_MODE unset → simulateOutage is ignored (no simulated_outage events)", async () => {
    vi.stubEnv("DEMO_MODE", "");
    const res = await call({ simulateOutage: true });
    expect(res.status).toBe(200);
    expect(repo.extractionEvents.length).toBeGreaterThan(0);
    expect(repo.extractionEvents.some((e) => e.status === "simulated_outage")).toBe(false);
  });

  it("rejects unknown body keys", async () => {
    const res = await call({ simulateOutage: true, extra: 1 });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/orders/[id]/pack — rate limit (P10.11)", () => {
  it("returns 429 with Retry-After once one IP exceeds the window, other IPs unaffected", async () => {
    for (let i = 0; i < 30; i++) expect((await call({})).status).not.toBe(429);
    const blocked = await call({});
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await call({}, "198.51.100.2")).status).toBe(200);
  });
});
