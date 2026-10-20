// Scoring for the extraction eval (docs/stack/07 §2). Pure, so it is unit-tested.

import type { ExtractedFacts } from "@/lib/ai/extractor";
import type { GroundTruthItem } from "@/lib/data/schemas";

const sortDesc = (d: number[]) => [...d].sort((a, b) => b - a);
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const ratio = (num: number, den: number) => (den ? round(num / den) : null);

export interface CaseResult {
  productId: string;
  group: "A" | "B" | "C";
  holdout: boolean;
  status: string;
  facts: ExtractedFacts | null;
  truth: GroundTruthItem;
  latencyMs: number;
  tokens: number;
  costUsd: number;
}

export function score(cases: CaseResult[]) {
  const a = cases.filter((c) => c.group === "A");
  const b = cases.filter((c) => c.group === "B");
  const c = cases.filter((x) => x.group === "C");

  // Group A: each of the 3 dims within ±1 cm (after sorting), weight within ±10%.
  let dimsOk = 0;
  let dimsTotal = 0;
  let weightOk = 0;
  for (const x of a) {
    const t = sortDesc([x.truth.lengthCm!, x.truth.widthCm!, x.truth.heightCm!]);
    const f = x.facts;
    const got = f && f.lengthCm !== null ? sortDesc([f.lengthCm, f.widthCm!, f.heightCm!]) : null;
    for (let i = 0; i < 3; i++) {
      dimsTotal++;
      if (got && Math.abs(got[i] - t[i]) <= 1) dimsOk++;
    }
    if (f?.weightG && Math.abs(f.weightG - x.truth.weightG!) <= 0.1 * x.truth.weightG!) weightOk++;
  }

  // Group B: mean absolute % error of inferred dims and weight (only where the model gave a value).
  const dimErrs: number[] = [];
  const weightErrs: number[] = [];
  let bAnswered = 0;
  for (const x of b) {
    const f = x.facts;
    if (!f || f.lengthCm === null) continue;
    bAnswered++;
    const t = sortDesc([x.truth.lengthCm!, x.truth.widthCm!, x.truth.heightCm!]);
    const got = sortDesc([f.lengthCm, f.widthCm!, f.heightCm!]);
    for (let i = 0; i < 3; i++) dimErrs.push(Math.abs(got[i] - t[i]) / t[i]);
    if (f.weightG) weightErrs.push(Math.abs(f.weightG - x.truth.weightG!) / x.truth.weightG!);
  }
  const mean = (v: number[]) => (v.length ? round(v.reduce((s, x) => s + x, 0) / v.length) : null);

  // Source correctness and honesty.
  const sourceOk = cases.filter((x) => x.facts && x.facts.dimsSource === x.truth.expectedDimsSource).length;
  const honest = c.filter((x) => x.facts && x.facts.dimsSource === "unknown" && x.facts.weightSource === "unknown").length;

  // Handling flags.
  const fragileTruth = cases.filter((x) => x.truth.fragile);
  const fragileFlagged = cases.filter((x) => x.facts?.fragile);
  const fragileTP = cases.filter((x) => x.truth.fragile && x.facts?.fragile).length;
  const answered = cases.filter((x) => x.facts);
  const flagAcc = (k: "liquid" | "sensitive") => ratio(answered.filter((x) => x.facts![k] === x.truth[k]).length, answered.length);

  return {
    products: cases.length,
    parseSuccess: ratio(cases.filter((x) => x.status === "ok").length, cases.length),
    dimAccuracy1cm: ratio(dimsOk, dimsTotal),
    weightAccuracy10pct: ratio(weightOk, a.length),
    inferredDimMape: mean(dimErrs),
    inferredWeightMape: mean(weightErrs),
    inferredAnswered: `${bAnswered}/${b.length}`,
    sourceCorrectness: ratio(sourceOk, cases.length),
    honestyRate: ratio(honest, c.length),
    fragileRecall: ratio(fragileTP, fragileTruth.length),
    fragilePrecision: ratio(fragileTP, fragileFlagged.length),
    liquidAccuracy: flagAcc("liquid"),
    sensitiveAccuracy: flagAcc("sensitive"),
    avgLatencyMs: Math.round(cases.reduce((s, x) => s + x.latencyMs, 0) / Math.max(1, cases.length)),
    avgTokens: Math.round(cases.reduce((s, x) => s + x.tokens, 0) / Math.max(1, cases.length)),
    costPerProductUsd: round(cases.reduce((s, x) => s + x.costUsd, 0) / Math.max(1, cases.length), 6),
  };
}

