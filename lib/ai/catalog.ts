// Catalog cache: return stored facts when fresh, extract the rest with Gemini (bounded concurrency).
// Manual or corrected facts are never overwritten by extraction.

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

function isFresh(cached: StoredFacts, product: Product): boolean {
  if (cached.origin !== "ai") return true; // manual and corrected facts are authoritative
  return cached.sourceHash === product.sourceHash; // page text unchanged since extraction
}

export async function getOrExtractFacts(req: CatalogRequest): Promise<CatalogResult> {
  const nowIso = req.nowIso ?? (() => new Date().toISOString());
  const [products, cached] = await Promise.all([req.repo.getProducts(req.productIds), req.repo.getFacts(req.productIds)]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const missingProducts = req.productIds.filter((id) => !byId.has(id));

  const facts = new Map<string, StoredFacts>();
  const toExtract: Product[] = [];
  let cacheHits = 0;
  for (const id of req.productIds) {
    const product = byId.get(id);
    if (!product) continue;
    const c = cached.get(id);
    if (c && (c.origin !== "ai" || (!req.force && isFresh(c, product)))) {
      facts.set(id, c);
      cacheHits++;
    } else {
      toExtract.push(product);
    }
  }

  const outcomes = await mapLimit(toExtract, req.concurrency ?? 2, (p) => extractFacts(p, req.deps));
  const events: ExtractionEvent[] = [];
  let degraded = false;
  for (let i = 0; i < toExtract.length; i++) {
    const product = toExtract[i];
    const { facts: extracted, event } = outcomes[i];
    events.push({ ...event, runId: req.runId, trigger: req.trigger });
    if (!extracted) continue; // failed: the product stays unknown for this request
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
