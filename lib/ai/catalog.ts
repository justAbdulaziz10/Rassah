import "server-only";
// Catalog cache: return stored facts when fresh, extract the rest with Gemini (bounded concurrency,
// one shared time budget). Manual or corrected facts are never overwritten by extraction. Offline-seeded facts (memory
// backend only) count as a cache hit, but an admin re-extract (force) may replace them.

import type { Repo } from "@/lib/db/repo";
import type { ExtractionEvent, Product, StoredFacts, Trigger } from "@/lib/db/types";
import { extractFacts, GenerateError, type ExtractDeps } from "./extractor";

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
  /** Total time for every model call in this request (default 40 s, inside the routes' 60 s limit). */
  budgetMs?: number;
  /** Rows the caller already read for these ids, to skip a second round trip. */
  preloaded?: { products: Product[]; facts: Map<string, StoredFacts> };
}

const DEFAULT_BUDGET_MS = 40_000;

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

const DAY_MS = 24 * 60 * 60 * 1000;
/** Statuses recorded without a model call. */
const NO_CALL_STATUSES = new Set<ExtractionEvent["status"]>(["config_error", "simulated_outage"]);

/**
 * Model reads left in the rolling 24 h window. Fails closed: if the count cannot be read, nothing is
 * left, so a database outage can never turn into unmetered Gemini spend.
 */
async function remainingDailyReads(repo: Repo, cap: number, nowIso: string): Promise<number> {
  try {
    const since = new Date(Date.parse(nowIso) - DAY_MS).toISOString();
    const used = (await repo.listExtractionEvents(since)).filter((e) => !NO_CALL_STATUSES.has(e.status)).length;
    return Math.max(0, cap - used);
  } catch {
    return 0;
  }
}

/** Over the daily cap the product stays unknown and the skipped read is recorded as config_error. */
function capReachedDeps(deps: ExtractDeps): ExtractDeps {
  return {
    ...deps,
    maxAttempts: 1,
    generate: async () => {
      throw new GenerateError("Daily Gemini read cap reached", "config_error", "daily_cap", false);
    },
  };
}

export async function getOrExtractFacts(req: CatalogRequest): Promise<CatalogResult> {
  const nowIso = req.nowIso ?? (() => new Date().toISOString());
  const productIds = [...new Set(req.productIds)]; // a repeated id must not call the model twice
  const [products, cached] = req.preloaded
    ? [req.preloaded.products, req.preloaded.facts]
    : await Promise.all([req.repo.getProducts(productIds), req.repo.getFacts(productIds)]);
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

  const now = req.deps.now ?? (() => performance.now());
  const deps = { ...req.deps, deadlineAt: now() + (req.budgetMs ?? DEFAULT_BUDGET_MS) };
  const cap = req.deps.dailyReadCap;
  const allowed = cap === undefined || toExtract.length === 0 ? toExtract.length : await remainingDailyReads(req.repo, cap, nowIso());
  const blockedDeps = capReachedDeps(deps);
  let degraded = false;
  // Each product is saved as soon as it is read, so a slow neighbour cannot lose it.
  const events = await mapLimit(toExtract, req.concurrency ?? 2, async (product): Promise<ExtractionEvent> => {
    const { facts: extracted, event } = await extractFacts(product, toExtract.indexOf(product) < allowed ? deps : blockedDeps);
    if (extracted) {
      const stored: StoredFacts = {
        ...extracted,
        origin: "ai",
        sourceHash: product.sourceHash,
        model: req.deps.model,
        promptVersion: req.deps.promptVersion,
        extractedAt: nowIso(),
        updatedAt: nowIso(),
      };
      try {
        // A packer may have measured it while the model was reading; then the measurement stays.
        facts.set(product.id, await req.repo.saveExtractedFacts(stored));
      } catch {
        facts.set(product.id, stored);
        degraded = true;
      }
    }
    // Failed: the product stays unknown for this request.
    return { ...event, runId: req.runId, trigger: req.trigger };
  });

  // Request order, not finish order, so stored runs list products the same way every time.
  const ordered = new Map(productIds.filter((id) => facts.has(id)).map((id) => [id, facts.get(id)!]));
  return { facts: ordered, events, cacheHits, cacheMisses: toExtract.length, degraded, missingProducts };
}
