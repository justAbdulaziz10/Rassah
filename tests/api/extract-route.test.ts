// Route-level test for POST /api/products/[id]/extract (demo control): a failed read must answer
// with an error status and its events, and a lost monitoring or cache write must be reported.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateError, type ExtractDeps, type GenerateFn } from "@/lib/ai/extractor";
import { MemoryRepo } from "@/lib/db/memory";
import { RESPONSES } from "../fixtures/gemini/responses";

vi.mock("next/server", () => ({ connection: async () => {} }));

let repo: MemoryRepo;
vi.mock("@/lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http")>();
  return { ...actual, repoOrError: () => repo, log: () => {} };
});

// null = the real server deps (no key configured here, so every read is a config_error).
let deps: ExtractDeps | null;
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, serverExtractDeps: () => deps ?? actual.serverExtractDeps() };
});

const { POST } = await import("@/app/api/products/[id]/extract/route");
const { extractLimiter } = await import("@/lib/rate-limit");

const answer: GenerateFn = async () => ({ text: JSON.stringify(RESPONSES.explicitPerfume), inputTokens: 100, outputTokens: 50, thinkingTokens: 0, blocked: false });
const fakeDeps = (generate: GenerateFn): ExtractDeps => ({ generate, model: "m", promptVersion: "v1", priceInputPerM: 0, priceOutputPerM: 0, maxAttempts: 1, sleep: async () => {} });

function call(productId = "p-01") {
  const request = new Request(`http://localhost/api/products/${productId}/extract`, { method: "POST", headers: { "x-forwarded-for": "203.0.113.7" } });
  return POST(request, { params: Promise.resolve({ id: productId }) } as RouteContext<"/api/products/[id]/extract">);
}

beforeEach(() => {
  repo = new MemoryRepo();
  repo.products.set("p-01", { id: "p-01", name: "p-01", description: "desc", url: null, category: null, sourceHash: "hash-p-01" });
  extractLimiter.reset();
  deps = null;
  vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("GEMINI_API_KEY", "");
});

describe("POST /api/products/[id]/extract", () => {
  it("is not available when DEMO_MODE is off", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    expect((await call()).status).toBe(404);
  });

  it("answers 404 for an unknown product", async () => {
    deps = fakeDeps(answer);
    expect((await call("p-99")).status).toBe(404);
  });

  it("returns the facts and the monitoring state after a successful read", async () => {
    deps = fakeDeps(answer);
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.facts).toMatchObject({ productId: "p-01", origin: "ai" });
    expect(body.events.map((e: { status: string }) => e.status)).toEqual(["ok"]);
    expect(body.monitoring).toEqual({ saved: true, degraded: false });
    expect(repo.extractionEvents).toHaveLength(1);
  });

  it("answers 503 with the events when the model is not configured", async () => {
    const res = await call();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toEqual(expect.any(String));
    expect(body.events.map((e: { status: string }) => e.status)).toEqual(["config_error"]);
    expect(body.monitoring).toEqual({ saved: true, degraded: false });
    expect(repo.facts.has("p-01")).toBe(false);
  });

  it("answers 502 when the read fails for another reason", async () => {
    deps = fakeDeps(async () => {
      throw new GenerateError("upstream 500", "api_error", "http_500", false);
    });
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).events.map((e: { status: string }) => e.status)).toEqual(["api_error"]);
  });

  it("reports a monitoring write that failed instead of hiding it", async () => {
    deps = fakeDeps(answer);
    vi.spyOn(repo, "insertExtractionEvents").mockRejectedValue(new Error("connection reset"));
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).monitoring).toEqual({ saved: false, degraded: false });
  });

  it("reports facts that were read but could not be saved", async () => {
    deps = fakeDeps(answer);
    vi.spyOn(repo, "saveExtractedFacts").mockRejectedValue(new Error("connection reset"));
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).monitoring).toEqual({ saved: true, degraded: true });
  });
});
