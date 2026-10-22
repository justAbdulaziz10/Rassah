import { describe, expect, it, vi } from "vitest";
import type { ExtractDeps, GenerateFn } from "@/lib/ai/extractor";
import { applyRunAction, NOT_CONFIRMABLE_MESSAGE, STALE_RUN_MESSAGE, updateProductFacts } from "@/lib/pipeline/facts";
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
    // Every carton smaller than the chosen one says why it was not used.
    expect(r.carton?.id).toBe("L");
    expect(r.smaller.map((c) => c.id)).toEqual(["S"]);
    expect(r.smaller[0].reason.kind).not.toBe("pricier");
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

  it("needs_measurement keeps what is already known, so measuring does not reset the flags", async () => {
    const { repo, deps } = setup({ ...RESPONSES.noInfo, fragile: true, weightSource: "page", weightG: 400 });
    const r = await runPack(req(repo, deps));
    expect(r.status).toBe("needs_measurement");
    expect(r.productsToMeasure[0].known).toEqual({ lengthCm: null, widthCm: null, heightCm: null, weightG: 400, fragile: true, liquid: false, sensitive: false });
    // The form sends only what changed: the three sides. The stored flag and weight survive.
    await updateProductFacts({ repo, productId: "p-01", changes: { lengthCm: 10, widthCm: 8, heightCm: 5 }, runId: "run-1" });
    expect(repo.facts.get("p-01")).toMatchObject({ fragile: true, weightG: 400, dimsSource: "manual" });
    expect(repo.corrections.map((c) => c.field)).toEqual(["length_cm", "width_cm", "height_cm"]);
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

  it("with defer, the alert check waits until after the answer", async () => {
    const { repo, deps } = setup();
    const deferred: Array<() => Promise<void>> = [];
    for (let i = 0; i < 3; i++) {
      const r = await runPack({ ...req(repo, { ...deps, simulateOutage: true }, "1001", `fail-${i}`), defer: (t) => deferred.push(t) });
      expect(r.status).toBe("needs_measurement");
    }
    expect(repo.alerts).toHaveLength(0);
    await Promise.all(deferred.map((t) => t()));
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

  it("confirm is refused unless the run chose a carton or a split", async () => {
    const { repo, deps } = setup(RESPONSES.noInfo);
    await runPack(req(repo, deps));
    expect(repo.orderRuns[0].status).toBe("needs_measurement");
    await expect(applyRunAction(repo, "run-1", { action: "confirm" })).rejects.toMatchObject({
      httpStatus: 409,
      message: NOT_CONFIRMABLE_MESSAGE,
    });
    expect(repo.orderRuns[0].employeeAction).toBe("pending");
    // A no_box run with a split plan is a carton choice and can be confirmed.
    Object.assign(repo.orderRuns[0], { status: "no_box", strategy: "split_2" });
    await applyRunAction(repo, "run-1", { action: "confirm" });
    expect(repo.orderRuns[0].employeeAction).toBe("confirmed");
    // A plain no_box cannot.
    Object.assign(repo.orderRuns[0], { status: "no_box", strategy: null, employeeAction: "pending" });
    await expect(applyRunAction(repo, "run-1", { action: "confirm" })).rejects.toMatchObject({ httpStatus: 409 });
  });

  it("confirm is refused for a run that is no longer the order's latest", async () => {
    const { repo, deps } = setup();
    await runPack(req(repo, deps, "1001", "run-1"));
    await runPack(req(repo, deps, "1001", "run-2"));
    await expect(applyRunAction(repo, "run-1", { action: "confirm" })).rejects.toMatchObject({
      httpStatus: 409,
      message: STALE_RUN_MESSAGE,
    });
    expect(repo.orderRuns[0].employeeAction).toBe("pending");
    await applyRunAction(repo, "run-2", { action: "confirm" });
    expect(repo.orderRuns[1].employeeAction).toBe("confirmed");
  });

  it("evaluation runs of the same order do not make a packing run stale", async () => {
    const { repo, deps } = setup();
    await runPack(req(repo, deps, "1001", "run-1"));
    repo.orderRuns.push({ ...repo.orderRuns[0], id: "eval-1", trigger: "eval", createdAt: "2099-01-01T00:00:00Z" });
    expect(await repo.latestOrderRunId("1001")).toBe("run-1");
    await applyRunAction(repo, "run-1", { action: "confirm" });
    expect(repo.orderRuns[0].employeeAction).toBe("confirmed");
  });

  it("confirming twice succeeds and keeps the first confirmation time", async () => {
    const { repo, deps } = setup();
    await runPack(req(repo, deps));
    await applyRunAction(repo, "run-1", { action: "confirm" });
    const first = repo.orderRuns[0].actionAt;
    expect(first).not.toBeNull();
    await expect(applyRunAction(repo, "run-1", { action: "confirm" })).resolves.toMatchObject({ action: "confirmed" });
    expect(repo.orderRuns[0]).toMatchObject({ employeeAction: "confirmed", actionAt: first });
  });

  it("an edit after confirming keeps the run confirmed and still links the corrections", async () => {
    const { repo, deps } = setup();
    await runPack(req(repo, deps));
    await applyRunAction(repo, "run-1", { action: "confirm" });
    const confirmedAt = repo.orderRuns[0].actionAt;
    const res = await applyRunAction(repo, "run-1", { action: "edit", productId: "p-01", changes: { heightCm: 18 } });
    expect(res.action).toBe("edited");
    expect(repo.orderRuns[0]).toMatchObject({ employeeAction: "confirmed", actionAt: confirmedAt });
    expect(repo.corrections.at(-1)).toMatchObject({ runId: "run-1", field: "height_cm" });
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

  it("edit on a run that was never saved still keeps the correction, unlinked", async () => {
    const { repo, deps } = setup();
    await runPack(req(repo, deps));
    const res = await applyRunAction(repo, "lost-run", { action: "edit", productId: "p-01", changes: { heightCm: 18 } });
    expect(res.action).toBe("edited");
    expect(repo.facts.get("p-01")).toMatchObject({ heightCm: 18 });
    expect(repo.corrections.at(-1)).toMatchObject({ runId: null, field: "height_cm" });
    await expect(applyRunAction(repo, "lost-run", { action: "confirm" })).rejects.toThrow(/not found/);
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
