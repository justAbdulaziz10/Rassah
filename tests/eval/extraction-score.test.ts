import { describe, expect, it } from "vitest";
import type { ExtractedFacts } from "@/lib/ai/extractor";
import { loadGroundTruth, loadProducts } from "@/lib/data/load";
import { score, type CaseResult } from "@/lib/eval/extraction-score";

const products = loadProducts();
const truth = new Map(loadGroundTruth().map((t) => [t.productId, t]));

function perfectCase(id: string): CaseResult {
  const p = products.find((x) => x.id === id)!;
  const t = truth.get(id)!;
  const src = t.expectedDimsSource;
  const facts: ExtractedFacts = {
    productId: id,
    lengthCm: t.lengthCm,
    widthCm: t.widthCm,
    heightCm: t.heightCm,
    weightG: t.weightG,
    dimsSource: src,
    weightSource: src,
    fragile: t.fragile,
    liquid: t.liquid,
    sensitive: t.sensitive,
    confidence: src === "page" ? "high" : "medium",
    evidence: "test",
  };
  return { productId: id, group: p.group, holdout: t.holdout, status: "ok", facts, truth: t, latencyMs: 1000, tokens: 500, costUsd: 0.0002 };
}

describe("extraction scoring", () => {
  it("scores perfect answers as 100% everywhere", () => {
    const s = score(products.map((p) => perfectCase(p.id)));
    expect(s).toMatchObject({
      products: 30,
      parseSuccess: 1,
      dimAccuracy1cm: 1,
      weightAccuracy10pct: 1,
      inferredDimMape: 0,
      inferredWeightMape: 0,
      sourceCorrectness: 1,
      honestyRate: 1,
      fragileRecall: 1,
      fragilePrecision: 1,
      liquidAccuracy: 1,
      sensitiveAccuracy: 1,
      inferredAnswered: "12/12",
    });
  });

  it("dimension order doesn't matter (sorted before comparing), but tolerance does", () => {
    const c = perfectCase("p-01"); // 7 x 7 x 16
    c.facts = { ...c.facts!, lengthCm: 16, widthCm: 7, heightCm: 8.5 }; // rotated, one side off by 1.5 cm
    expect(score([c]).dimAccuracy1cm).toBeCloseTo(2 / 3);
  });

  it("measures inferred error as mean absolute percentage", () => {
    const c = perfectCase("p-16"); // inferred 6 x 5 x 12, 250 g
    c.facts = { ...c.facts!, lengthCm: 6.6, widthCm: 5.5, heightCm: 13.2, weightG: 300 }; // +10% dims, +20% weight
    const s = score([c]);
    expect(s.inferredDimMape).toBeCloseTo(0.1);
    expect(s.inferredWeightMape).toBeCloseTo(0.2);
  });

  it("an invented number on a no-info product fails honesty", () => {
    const c = perfectCase("p-28");
    c.facts = { ...c.facts!, lengthCm: 10, widthCm: 10, heightCm: 10, weightG: 500, dimsSource: "inferred", weightSource: "inferred" };
    expect(score([c, perfectCase("p-29")]).honestyRate).toBe(0.5);
  });

  it("missing a fragile item lowers recall; a false flag lowers precision", () => {
    const missed = perfectCase("p-01");
    missed.facts = { ...missed.facts!, fragile: false };
    const falseFlag = perfectCase("p-02");
    falseFlag.facts = { ...falseFlag.facts!, fragile: true };
    const s = score([missed, perfectCase("p-03"), falseFlag]);
    expect(s.fragileRecall).toBe(0.5); // found 1 of 2 truly fragile
    expect(s.fragilePrecision).toBe(0.5); // 1 of 2 flags correct
  });

  it("failed calls count against parse success and leave values unanswered", () => {
    const failed = { ...perfectCase("p-16"), status: "rate_limited", facts: null };
    const s = score([failed, perfectCase("p-01")]);
    expect(s.parseSuccess).toBe(0.5);
    expect(s.inferredAnswered).toBe("0/1");
  });
});
