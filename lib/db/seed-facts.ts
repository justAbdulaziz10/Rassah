// Offline-demo facts for the in-memory backend (DATA_BACKEND=memory only).
// Built from the synthetic ground truth in data/ground_truth.json and stored with origin "seeded",
// so nothing downstream can mistake them for AI output (no model, no prompt version, no evidence,
// no confidence, not counted as AI products or AI corrections). Products whose ground truth has no
// dimensions (group C) are left out and still go to "needs measurement".
// Real (Supabase) mode never calls this; the Gemini path never reads ground truth.
import "server-only";

import type { GroundTruthItem } from "@/lib/data/schemas";
import type { Product, StoredFacts } from "@/lib/db/types";

type SeedFactsSetting = "auto" | "true" | "false";

/**
 * MEMORY_SEED_FACTS: "true" always seeds, "false" never seeds, "auto" (default) seeds only when
 * no Gemini key is configured, so a local run with a key still exercises the real AI path.
 */
export function shouldSeedFacts(env: { MEMORY_SEED_FACTS?: string; GEMINI_API_KEY?: string }): boolean {
  const raw = env.MEMORY_SEED_FACTS?.trim().toLowerCase();
  const setting: SeedFactsSetting = raw === "true" || raw === "false" ? raw : "auto";
  if (setting === "true") return true;
  if (setting === "false") return false;
  return !env.GEMINI_API_KEY?.trim();
}

export function seededFactsFromGroundTruth(items: GroundTruthItem[], products: Product[], nowIso: string): StoredFacts[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: StoredFacts[] = [];
  for (const g of items) {
    const product = byId.get(g.productId);
    if (!product) continue;
    if (g.lengthCm === null || g.widthCm === null || g.heightCm === null || g.weightG === null) continue;
    if (g.expectedDimsSource === "unknown") continue;
    out.push({
      productId: g.productId,
      lengthCm: g.lengthCm,
      widthCm: g.widthCm,
      heightCm: g.heightCm,
      weightG: g.weightG,
      // Same classification the extractor is expected to give, so the engine applies the same
      // safety margin to estimated (group B) sizes as it would in real mode.
      dimsSource: g.expectedDimsSource,
      weightSource: g.expectedDimsSource,
      fragile: g.fragile,
      liquid: g.liquid,
      sensitive: g.sensitive,
      confidence: null,
      evidence: null,
      origin: "seeded",
      sourceHash: product.sourceHash,
      model: null,
      promptVersion: null,
      extractedAt: null,
      updatedAt: nowIso,
    });
  }
  return out;
}
