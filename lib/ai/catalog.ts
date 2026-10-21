import "server-only";
// Catalog cache: return stored facts when fresh, extract the rest with Gemini (bounded concurrency).
// Manual or corrected facts are never overwritten by extraction. Offline-seeded facts (memory
// backend only) count as a cache hit, but an admin re-extract (force) may replace them.

import type { Repo } from "@/lib/db/repo";
import type { ExtractionEvent, Product, StoredFacts, Trigger } from "@/lib/db/types";
import { extractFacts, type ExtractDeps } from "./extractor";

export interface CatalogRequest {
  repo: Repo;
  productIds: string[];
  deps: ExtractDeps;
  trigger: Trigger;
  runId: string | null;
  concurrency?: number;
  /** Re-extract even if cached (admin). Still never overwrites manual/corrected facts. */
  force?: boolean;
  nowIso?: () => string;
}

export interface CatalogResult {
  facts: Map<string, StoredFacts>;
  events: ExtractionEvent[];
  cacheHits: number;
  cacheMisses: number;
  /** true if a cache write failed (facts are still returned for this request). */
  degraded: boolean;
  missingProducts: string[];
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Manual and corrected facts are authoritative: extraction never overwrites them. */
function isAuthoritative(cached: StoredFacts): boolean {
  return cached.origin === "manual" || cached.origin === "ai_corrected";
}

function isFresh(cached: StoredFacts, product: Product): boolean {
  if (cached.origin !== "ai") return true; // manual, corrected and offline-seeded facts don't go stale
  return cached.sourceHash === product.sourceHash; // page text unchanged since extraction
}

export async function getOrExtractFacts(req: CatalogRequest): Promise<CatalogResult> {
  const nowIso = req.nowIso ?? (() => new Date().toISOString());
  const productIds = [...new Set(req.productIds)]; // a repeated id must not call the model twice
  const [products, cached] = await Promise.all([req.repo.getProducts(productIds), req.repo.getFacts(productIds)]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const missingProducts = productIds.filter((id) => !byId.has(id));

  const facts = new Map<string, StoredFacts>();
  const toExtract: Product[] = [];
  let cacheHits = 0;
  for (const id of productIds) {
    const product = byId.get(id);
    if (!product) continue;
    const c = cached.get(id);
    if (c && (isAuthoritative(c) || (!req.force && isFresh(c, product)))) {
      facts.set(id, c);
      cacheHits++;
    } else {
      toExtract.push(product);
    }
  }

  const outcomes = await mapLimit(toExtract, req.concurrency ?? 2, (p) => extractFacts(p, req.deps));
  const events: ExtractionEvent[] = [];
  let degraded = false;
  // A packer may have saved a measurement while the model was reading (up to ~20 s). Check again so
  // the AI result never replaces it.
  let latest = new Map<string, StoredFacts>();
  const extractedIds = toExtract.filter((_, i) => outcomes[i].facts).map((p) => p.id);
  if (extractedIds.length > 0) {
    try {
      latest = await req.repo.getFacts(extractedIds);
    } catch {
      // Could not re-check: fall back to the first read (the write below still reports its own failure).
    }
  }
  for (let i = 0; i < toExtract.length; i++) {
    const product = toExtract[i];
    const { facts: extracted, event } = outcomes[i];
    events.push({ ...event, runId: req.runId, trigger: req.trigger });
    if (!extracted) continue; // failed: the product stays unknown for this request
    const now = latest.get(product.id);
    if (now && isAuthoritative(now)) {
      facts.set(product.id, now);
      continue;
    }
    const stored: StoredFacts = {
      ...extracted,
      origin: "ai",
      sourceHash: product.sourceHash,
      model: req.deps.model,
      promptVersion: req.deps.promptVersion,
      extractedAt: nowIso(),
      updatedAt: nowIso(),
    };
    facts.set(product.id, stored);
    try {
      await req.repo.upsertFacts(stored);
    } catch {
      degraded = true;
    }
  }

  return { facts, events, cacheHits, cacheMisses: toExtract.length, degraded, missingProducts };
}
