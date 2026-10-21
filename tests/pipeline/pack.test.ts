import { describe, expect, it, vi } from "vitest";
import type { ExtractDeps, GenerateFn } from "@/lib/ai/extractor";
import { applyRunAction, updateProductFacts } from "@/lib/pipeline/facts";
import { runPack } from "@/lib/pipeline/pack";
import { MemoryRepo } from "@/lib/db/memory";
import { RESPONSES } from "../fixtures/gemini/responses";

const CARTONS = [
  { id: "S", name: "S", inner: [20, 15, 10] as [number, number, number], maxWeightG: 3000, tareG: 120, costSar: 0.9 },
  { id: "L", name: "L", inner: [40, 30, 25] as [number, number, number], maxWeightG: 15000, tareG: 450, costSar: 2.6 },
];

function setup(response: unknown = RESPONSES.explicitPerfume) {
  const repo = new MemoryRepo();
  repo.cartons = CARTONS;
  for (const id of ["p-01", "p-02"]) {
    repo.products.set(id, { id, name: `منتج ${id}`, description: `وصف ${id}`, url: null, category: null, sourceHash: `h-${id}` });
  }
  repo.orders.set("1001", { id: "1001", demo: null, expect: null, lines: [{ productId: "p-01", qty: 1 }, { productId: "p-02", qty: 1 }] });
  const generate = vi.fn<GenerateFn>(async () => ({
    text: JSON.stringify(response),
    inputTokens: 500,
    outputTokens: 100,
    thinkingTokens: 0,
    blocked: false,
  }));
  const deps: ExtractDeps = { generate, model: "m", promptVersion: "v1", priceInputPerM: 1, priceOutputPerM: 4, sleep: async () => {} };
  return { repo, generate, deps };
}

const req = (repo: MemoryRepo, deps: ExtractDeps, orderId = "1001", runId = "run-1") => ({
  repo,
  deps,
  orderId,
  runId,
  engineVersion: "engine-0.1",
  promptVersion: "v1",
});

describe("runPack", () => {
  it("cache-miss path: extracts, packs, writes facts + events + one order run", async () => {
    const { repo, generate, deps } = setup();
    const r = await runPack(req(repo, deps));
    expect(r.status).toBe("box_found");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(r.cache).toEqual({ hits: 0, misses: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.instructions.length).toBeGreaterThan(2);
    expect(repo.facts.size).toBe(2);
    expect(repo.extractionEvents.map((e) => e.runId)).toEqual(["run-1", "run-1"]);
    expect(repo.orderRuns).toHaveLength(1);
    expect(repo.orderRuns[0]).toMatchObject({ id: "run-1", status: "box_found", cacheMisses: 2, aiProducts: ["p-01", "p-02"] });
    expect(repo.orderRuns[0].costUsd).toBeGreaterThan(0);
    expect(r.monitoring.saved).toBe(true);
  });

  it("happy path when everything is cached: no Gemini calls", async () => {
    const { repo, generate, deps } = setup();
    await runPack(req(repo, deps, "1001", "run-1"));
    generate.mockClear();
    const r = await runPack(req(repo, deps, "1001", "run-2"));
    expect(generate).not.toHaveBeenCalled();
    expect(r.cache).toEqual({ hits: 2, misses: 0 });
    expect(repo.orderRuns[1]).toMatchObject({ cacheMisses: 0, tokensTotal: 0 });
  });

  it("needs_measurement when the AI found no basis for a value", async () => {
    const { repo, deps } = setup(RESPONSES.noInfo);
    const r = await runPack(req(repo, deps));
    expect(r.status).toBe("needs_measurement");
    expect(r.productsToMeasure.map((p) => p.productId)).toEqual(["p-01", "p-02"]);
    expect(repo.orderRuns[0].unitSources.unknown).toBe(2);
  });

  it("no_box when nothing fits", async () => {
    const { repo, deps } = setup({ ...RESPONSES.explicitPerfume, lengthCm: 100, widthCm: 60, heightCm: 50 });
    const r = await runPack(req(repo, deps));
    expect(r.status).toBe("no_box");
    expect(r.reason).toMatch(/search budget/);
    expect(r.attempts.length).toBe(2);
    expect(r.split).toBeNull(); // the single item fits no carton, so no split either
  });

  it("unknown order → not_found, still logged as an error run", async () => {
    const { repo, deps } = setup();
    const r = await runPack(req(repo, deps, "9999"));
    expect(r.status).toBe("not_found");
    expect(repo.orderRuns[0]).toMatchObject({ status: "error", errorCode: "order_not_found" });
  });

  it("simulated outage: products stay unknown, failure events recorded", async () => {
    const { repo, deps } = setup();
    const r = await runPack(req(repo, { ...deps, simulateOutage: true }));
    expect(r.status).toBe("needs_measurement");
    expect(r.productsToMeasure.every((p) => p.failedExtraction)).toBe(true);
    expect(repo.extractionEvents.every((e) => e.status === "simulated_outage")).toBe(true);
  });

  it("returns the result even when monitoring writes fail", async () => {
    const { repo, deps } = setup();
    await runPack(req(repo, deps, "1001", "warm")); // warm the cache
    repo.failWrites = true;
    const r = await runPack(req(repo, deps, "1001", "run-2"));
    expect(r.status).toBe("box_found");
    expect(r.monitoring.saved).toBe(false);
  });

  it("evaluates alerts after the run", async () => {
    const { repo, deps } = setup();
    // 5 failed extractions in a row trip the Gemini failure-rate rule.
    for (let i = 0; i < 3; i++) await runPack(req(repo, { ...deps, simulateOutage: true }, "1001", `fail-${i}`));
    expect(repo.alerts.map((a) => a.rule)).toContain("M6_gemini_failure_rate");
  });
});

describe("corrections and actions", () => {
  it("confirm marks the run", async () => {
    const { repo, deps } = setup();
    await runPack(req(repo, deps));
    await applyRunAction(repo, "run-1", { action: "confirm" });
    expect(repo.orderRuns[0].employeeAction).toBe("confirmed");
  });

  it("edit writes corrections, marks facts ai_corrected and sources manual", async () => {
    const { repo, deps } = setup();
    await runPack(req(repo, deps));
    const res = await applyRunAction(repo, "run-1", { action: "edit", productId: "p-01", changes: { heightCm: 18, fragile: false } });
    expect(res.corrections.map((c) => [c.field, c.oldValue, c.newValue, c.priorOrigin])).toEqual([
      ["height_cm", "16", "18", "ai"],
      ["fragile", "true", "false", "ai"],
    ]);
    expect(repo.facts.get("p-01")).toMatchObject({ heightCm: 18, origin: "ai_corrected", dimsSource: "manual", weightSource: "page" });
    expect(repo.orderRuns[0].employeeAction).toBe("edited");
  });

  it("manual measurement of an unknown product creates manual facts", async () => {
    const { repo } = setup();
    const { facts, corrections } = await updateProductFacts({
      repo,
      productId: "p-02",
      changes: { lengthCm: 10, widthCm: 8, heightCm: 5, weightG: 200 },
      runId: null,
    });
    expect(facts).toMatchObject({ origin: "manual", dimsSource: "manual", weightSource: "manual" });
    expect(corrections.every((c) => c.priorOrigin === "none")).toBe(true);
  });

  it("measuring one side of a guessed size keeps the other two marked as guesses", async () => {
    const { repo } = setup();
    repo.facts.set("p-02", {
      productId: "p-02", lengthCm: 20, widthCm: 10, heightCm: 10, weightG: 300, dimsSource: "inferred", weightSource: "inferred",
      fragile: false, liquid: false, sensitive: false, confidence: "low", evidence: null, origin: "ai", sourceHash: "h-p-02",
      model: "m", promptVersion: "v1", extractedAt: null, updatedAt: "2026-10-21T00:00:00Z",
    });
    const one = await updateProductFacts({ repo, productId: "p-02", changes: { lengthCm: 25 }, runId: null });
    expect(one.facts).toMatchObject({ lengthCm: 25, dimsSource: "inferred" });
    const all = await updateProductFacts({ repo, productId: "p-02", changes: { lengthCm: 25, widthCm: 11, heightCm: 9 }, runId: null });
    expect(all.facts.dimsSource).toBe("manual");
  });

  it("keeps the corrections, without the run link, when the run itself was never saved", async () => {
    const { repo } = setup();
    const { corrections } = await updateProductFacts({
      repo,
      productId: "p-02",
      changes: { lengthCm: 10, widthCm: 8, heightCm: 5, weightG: 200 },
      runId: "00000000-0000-4000-8000-000000000000",
    });
    expect(corrections.length).toBeGreaterThan(0);
    expect(repo.corrections.map((c) => c.runId)).toEqual(corrections.map(() => null));
  });

  it("rejects a partial dimension measurement for an unknown product", async () => {
    const { repo } = setup();
    await expect(updateProductFacts({ repo, productId: "p-02", changes: { lengthCm: 10 }, runId: null })).rejects.toThrow(/all required/);
  });
});
