import { describe, expect, it, vi } from "vitest";
import { getOrExtractFacts, mapLimit } from "@/lib/ai/catalog";
import type { ExtractDeps, GenerateFn } from "@/lib/ai/extractor";
import type { StoredFacts } from "@/lib/db/types";
import { MemoryRepo } from "../fakes/memory-repo";
import { RESPONSES } from "../fixtures/gemini/responses";

function setup() {
  const repo = new MemoryRepo();
  for (const id of ["p-01", "p-02"]) {
    repo.products.set(id, { id, name: id, description: `desc ${id}`, url: null, category: null, sourceHash: `hash-${id}` });
  }
  const generate = vi.fn<GenerateFn>(async () => ({
    text: JSON.stringify(RESPONSES.explicitPerfume),
    inputTokens: 100,
    outputTokens: 50,
    thinkingTokens: 0,
    blocked: false,
  }));
  const deps: ExtractDeps = { generate, model: "m", promptVersion: "v1", priceInputPerM: 0, priceOutputPerM: 0, sleep: async () => {} };
  return { repo, generate, deps };
}

const stored = (productId: string, over: Partial<StoredFacts> = {}): StoredFacts => ({
  productId, lengthCm: 1, widthCm: 1, heightCm: 1, weightG: 1, dimsSource: "page", weightSource: "page",
  fragile: false, liquid: false, sensitive: false, confidence: "high", evidence: null, origin: "ai",
  sourceHash: `hash-${productId}`, model: "m", promptVersion: "v1", extractedAt: null, updatedAt: "2026-10-20T00:00:00Z", ...over,
});

describe("getOrExtractFacts", () => {
  it("uses fresh cached facts and extracts only the misses", async () => {
    const { repo, generate, deps } = setup();
    repo.facts.set("p-01", stored("p-01"));
    const r = await getOrExtractFacts({ repo, productIds: ["p-01", "p-02"], deps, trigger: "order", runId: "run-1" });
    expect(r.cacheHits).toBe(1);
    expect(r.cacheMisses).toBe(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ productId: "p-02", runId: "run-1", trigger: "order", status: "ok" });
    expect(repo.facts.get("p-02")).toMatchObject({ origin: "ai", sourceHash: "hash-p-02", heightCm: 16 });
  });

  it("re-extracts when the page text changed (stale source hash)", async () => {
    const { repo, generate, deps } = setup();
    repo.facts.set("p-01", stored("p-01", { sourceHash: "old-hash" }));
    const r = await getOrExtractFacts({ repo, productIds: ["p-01"], deps, trigger: "order", runId: null });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(r.cacheMisses).toBe(1);
  });

  it("never overwrites manual or corrected facts, even when forced", async () => {
    const { repo, generate, deps } = setup();
    repo.facts.set("p-01", stored("p-01", { origin: "manual", heightCm: 99, sourceHash: "anything" }));
    repo.facts.set("p-02", stored("p-02", { origin: "ai_corrected", heightCm: 77 }));
    const r = await getOrExtractFacts({ repo, productIds: ["p-01", "p-02"], deps, trigger: "admin", runId: null, force: true });
    expect(generate).not.toHaveBeenCalled();
    expect(r.facts.get("p-01")!.heightCm).toBe(99);
    expect(repo.facts.get("p-02")!.heightCm).toBe(77);
  });

  it("writes nothing to the cache when extraction fails, but still records the event", async () => {
    const { repo, deps } = setup();
    const r = await getOrExtractFacts({ repo, productIds: ["p-01"], deps: { ...deps, simulateOutage: true }, trigger: "order", runId: "r" });
    expect(repo.facts.has("p-01")).toBe(false);
    expect(r.facts.has("p-01")).toBe(false);
    expect(r.events[0].status).toBe("simulated_outage");
  });

  it("reports degraded when the cache write fails but still returns the facts", async () => {
    const { repo, deps } = setup();
    repo.failWrites = true;
    const r = await getOrExtractFacts({ repo, productIds: ["p-01"], deps, trigger: "order", runId: null });
    expect(r.degraded).toBe(true);
    expect(r.facts.get("p-01")).toBeDefined();
  });

  it("reports unknown product ids", async () => {
    const { repo, deps } = setup();
    const r = await getOrExtractFacts({ repo, productIds: ["p-01", "p-99"], deps, trigger: "order", runId: null });
    expect(r.missingProducts).toEqual(["p-99"]);
  });
});

describe("mapLimit", () => {
  it("never runs more than `limit` tasks at once and keeps order", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});
