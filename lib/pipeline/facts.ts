// Packer corrections and manual measurements. Every changed field becomes a `corrections` row,
// which is what the M1 (AI correction rate) metric is built on.

import { z } from "zod";
import type { Repo } from "@/lib/db/repo";
import type { Correction, StoredFacts } from "@/lib/db/types";

const dim = z.number().positive().max(150);
export const FactChangesSchema = z
  .object({
    lengthCm: dim.optional(),
    widthCm: dim.optional(),
    heightCm: dim.optional(),
    weightG: z.number().positive().max(30_000).optional(),
    fragile: z.boolean().optional(),
    liquid: z.boolean().optional(),
    sensitive: z.boolean().optional(),
  })
  .strict()
  .refine((c) => Object.keys(c).length > 0, "no changes given");
export type FactChanges = z.infer<typeof FactChangesSchema>;

const FIELD_COLUMNS: Record<keyof FactChanges, string> = {
  lengthCm: "length_cm",
  widthCm: "width_cm",
  heightCm: "height_cm",
  weightG: "weight_g",
  fragile: "fragile",
  liquid: "liquid",
  sensitive: "sensitive",
};

export class FactsError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

export async function updateProductFacts(params: {
  repo: Repo;
  productId: string;
  changes: FactChanges;
  runId: string | null;
  nowIso?: () => string;
}): Promise<{ facts: StoredFacts; corrections: Correction[] }> {
  const { repo, productId, changes } = params;
  const nowIso = params.nowIso ?? (() => new Date().toISOString());
  const [product] = await repo.getProducts([productId]);
  if (!product) throw new FactsError(`Product ${productId} not found`, 404);
  const prior = (await repo.getFacts([productId])).get(productId) ?? null;
  // A run whose save failed (monitoring.saved=false) has no row; linking to it would break the foreign key
  // after the facts were already written, so keep the corrections and drop the link instead.
  const runId = params.runId && (await repo.getOrderRun(params.runId)) ? params.runId : null;

  const base: StoredFacts = prior ?? {
    productId,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    weightG: null,
    dimsSource: "unknown",
    weightSource: "unknown",
    fragile: false,
    liquid: false,
    sensitive: false,
    confidence: null,
    evidence: null,
    origin: "manual",
    sourceHash: product.sourceHash,
    model: null,
    promptVersion: null,
    extractedAt: null,
    updatedAt: nowIso(),
  };
  const next: StoredFacts = { ...base, ...changes, updatedAt: nowIso() };

  const dimsChanged = (["lengthCm", "widthCm", "heightCm"] as const).some((k) => k in changes);
  if (dimsChanged) {
    if (!(next.lengthCm && next.widthCm && next.heightCm)) {
      throw new FactsError("Length, width and height are all required", 400);
    }
    // One measured side does not make the other two guesses exact: an inferred source keeps its safety
    // margin and "check it fits" note until all three sides are measured.
    const allMeasured = (["lengthCm", "widthCm", "heightCm"] as const).every((k) => k in changes);
    if (allMeasured || base.dimsSource !== "inferred") next.dimsSource = "manual";
  }
  if ("weightG" in changes) next.weightSource = "manual";
  next.origin = base.origin === "ai" || base.origin === "ai_corrected" ? "ai_corrected" : "manual";
  if (!prior) next.origin = "manual";
  next.sourceHash = product.sourceHash;

  const corrections: Correction[] = [];
  for (const key of Object.keys(changes) as Array<keyof FactChanges>) {
    const oldValue = prior ? prior[key] : null;
    const newValue = changes[key];
    if (oldValue === newValue) continue;
    corrections.push({
      runId,
      productId,
      field: FIELD_COLUMNS[key],
      oldValue: oldValue === null || oldValue === undefined ? null : String(oldValue),
      newValue: newValue === undefined ? null : String(newValue),
      priorOrigin: prior ? prior.origin : "none",
    });
  }

  await repo.upsertFacts(next);
  await repo.insertCorrections(corrections);
  return { facts: next, corrections };
}

export const RunActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("edit"), productId: z.string().min(1), changes: FactChangesSchema }),
]);
export type RunAction = z.infer<typeof RunActionSchema>;

export async function applyRunAction(repo: Repo, runId: string, action: RunAction) {
  const run = await repo.getOrderRun(runId);
  if (!run) throw new FactsError(`Run ${runId} not found`, 404);
  if (action.action === "confirm") {
    await repo.setOrderRunAction(runId, "confirmed");
    return { action: "confirmed" as const, corrections: [] as Correction[] };
  }
  const { corrections } = await updateProductFacts({ repo, productId: action.productId, changes: action.changes, runId });
  await repo.setOrderRunAction(runId, "edited");
  return { action: "edited" as const, corrections, repackHint: true };
}
