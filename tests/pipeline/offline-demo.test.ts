// Offline demo (DATA_BACKEND=memory, no Gemini key, no network): the demo orders
// must pack from seeded ground-truth facts, and the seeded facts must never be presented as AI output.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrExtractFacts } from "@/lib/ai/catalog";
import type { ExtractDeps, GenerateFn } from "@/lib/ai/extractor";
import { serverExtractDeps } from "@/lib/ai";
import { loadGroundTruth, loadOrders } from "@/lib/data/load";
import { buildLocalRepo } from "@/lib/db/local";
import { seededFactsFromGroundTruth, shouldSeedFacts } from "@/lib/db/seed-facts";
import { updateProductFacts } from "@/lib/pipeline/facts";
import { runPack } from "@/lib/pipeline/pack";

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const pack = (repo: ReturnType<typeof buildLocalRepo>, orderId: string) =>
  runPack({ repo, orderId, runId: `run-${orderId}`, deps: serverExtractDeps(), engineVersion: "engine-0.1", promptVersion: "v1" });

describe("shouldSeedFacts", () => {
  it("auto (default) seeds only without a Gemini key", () => {
    expect(shouldSeedFacts({})).toBe(true);
    expect(shouldSeedFacts({ GEMINI_API_KEY: "  " })).toBe(true);
    expect(shouldSeedFacts({ GEMINI_API_KEY: "k" })).toBe(false);
    expect(shouldSeedFacts({ MEMORY_SEED_FACTS: "auto", GEMINI_API_KEY: "k" })).toBe(false);
  });
  it("can be forced on or off", () => {
    expect(shouldSeedFacts({ MEMORY_SEED_FACTS: "false" })).toBe(false);
    expect(shouldSeedFacts({ MEMORY_SEED_FACTS: "true", GEMINI_API_KEY: "k" })).toBe(true);
    expect(shouldSeedFacts({ MEMORY_SEED_FACTS: "TRUE" })).toBe(true);
  });
});

describe("seededFactsFromGroundTruth", () => {
  const repo = buildLocalRepo({ seedFacts: false });
  const seeded = seededFactsFromGroundTruth(loadGroundTruth(), [...repo.products.values()], "2026-10-21T00:00:00Z");

  it("seeds groups A and B, skips group C (no dimensions)", () => {
    const ids = seeded.map((f) => f.productId);
    expect(ids).toHaveLength(27);
    expect(ids).not.toContain("p-28");
    expect(ids).not.toContain("p-29");
    expect(ids).not.toContain("p-30");
  });

  it("marks every row as seeded with no AI provenance", () => {
    for (const f of seeded) {
      expect(f).toMatchObject({ origin: "seeded", model: null, promptVersion: null, evidence: null, confidence: null, extractedAt: null });
      expect(["page", "inferred"]).toContain(f.dimsSource);
      expect(f.sourceHash).toBe(repo.products.get(f.productId)!.sourceHash);
    }
    expect(seeded.find((f) => f.productId === "p-02")).toMatchObject({ lengthCm: 21, widthCm: 14, heightCm: 2, weightG: 350, dimsSource: "page" });
    expect(seeded.find((f) => f.productId === "p-16")).toMatchObject({ dimsSource: "inferred", fragile: true, liquid: true });
  });
});

describe("offline demo pack (memory backend, no Gemini key)", () => {
  it("without seeding, every order needs measurement (the old behavior)", async () => {
    const r = await pack(buildLocalRepo({ seedFacts: false }), "1001");
    expect(r.status).toBe("needs_measurement");
    expect(r.productsToMeasure[0]).toMatchObject({ productId: "p-02", failedExtraction: true });
  });

  it("demo orders: 1001 and 1002 get a carton, 1020 is no_box (overweight)", async () => {
    const repo = buildLocalRepo({ seedFacts: true });
    const r1001 = await pack(repo, "1001");
    expect(r1001.status).toBe("box_found");
    expect(r1001.carton?.id).toBe("FLAT");
    expect(r1001.cache).toEqual({ hits: 1, misses: 0 });

    const r1002 = await pack(repo, "1002");
    expect(r1002.status).toBe("box_found");
    expect(r1002.carton).not.toBeNull();
    expect(r1002.items.find((i) => i.productId === "p-16")).toMatchObject({ marginApplied: true, facts: { origin: "seeded", dimsSource: "inferred" } });
    expect(r1002.lines.every((l) => l.origin === "seeded")).toBe(true);

    // Too heavy for any one carton: still no_box, with a split suggestion that covers every unit once.
    const r1020 = await pack(repo, "1020");
    expect(r1020.status).toBe("no_box");
    expect(r1020.split).not.toBeNull();
    const units = r1020.split!.boxes.flatMap((b) => b.items.map((i) => i.unitId));
    expect(new Set(units).size).toBe(units.length);
    expect(units.length).toBe(r1020.lines.reduce((s, l) => s + l.qty, 0));
    expect(r1020.split!.boxes.every((b) => b.instructions.length > 0 && b.cost.totalSar > 0)).toBe(true);
    expect(repo.orderRuns.at(-1)!.strategy).toBe(`split_${r1020.split!.boxes.length}`);

    // Nothing was attributed to the AI and Gemini was never called.
    expect(repo.orderRuns.every((run) => run.aiProducts.length === 0 && run.tokensTotal === 0)).toBe(true);
    expect(repo.extractionEvents).toHaveLength(0);
  });

  it("every order packs as expected: group C orders still need measurement", async () => {
    const repo = buildLocalRepo({ seedFacts: true });
    const outcomes: Record<string, string> = {};
    for (const o of loadOrders()) outcomes[o.id] = (await pack(repo, o.id)).status;
    const expected: Record<string, string> = Object.fromEntries(loadOrders().map((o) => [o.id, "box_found"]));
    expected["1006"] = "needs_measurement";
    expected["1017"] = "needs_measurement";
    expected["1020"] = "no_box";
    expect(outcomes).toEqual(expected);
  });

  it("correcting a seeded product is recorded but not counted as an AI correction", async () => {
    const repo = buildLocalRepo({ seedFacts: true });
    const { facts, corrections } = await updateProductFacts({ repo, productId: "p-16", changes: { heightCm: 13 }, runId: null });
    expect(facts.origin).toBe("manual");
    expect(corrections).toEqual([expect.objectContaining({ field: "height_cm", priorOrigin: "seeded" })]);
  });
});

describe("getOrExtractFacts with seeded facts", () => {
  function deps() {
    const generate = vi.fn<GenerateFn>(async () => ({ text: "{}", inputTokens: 0, outputTokens: 0, thinkingTokens: 0, blocked: false }));
    const d: ExtractDeps = { generate, model: "m", promptVersion: "v1", priceInputPerM: 0, priceOutputPerM: 0, sleep: async () => {}, maxAttempts: 1 };
    return { generate, d };
  }

  it("uses seeded facts as a cache hit on orders", async () => {
    const repo = buildLocalRepo({ seedFacts: true });
    const { generate, d } = deps();
    const r = await getOrExtractFacts({ repo, productIds: ["p-02"], deps: d, trigger: "order", runId: null });
    expect(r.cacheHits).toBe(1);
    expect(generate).not.toHaveBeenCalled();
  });

  it("an admin re-extract (force) may replace seeded facts, unlike manual ones", async () => {
    const repo = buildLocalRepo({ seedFacts: true });
    const { generate, d } = deps();
    await getOrExtractFacts({ repo, productIds: ["p-02"], deps: d, trigger: "admin", runId: null, force: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
