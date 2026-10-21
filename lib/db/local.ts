import "server-only";
import { computeSourceHash } from "@/lib/data/hash";
import { loadCartons, loadGroundTruth, loadOrders, loadProducts } from "@/lib/data/load";
import { buildMockData, MOCK_ORDER_TAG } from "@/lib/demo/mock-data";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import { ENGINE_VERSION } from "@/lib/engine/config";
import { MemoryRepo } from "./memory";
import { seededFactsFromGroundTruth, shouldSeedFacts } from "./seed-facts";

// Local / offline backend (DATA_BACKEND=memory): the mock store from data/*.json in process memory.
// One instance per server process (kept on globalThis so dev hot-reloads keep the data).
// Never use this on Vercel: serverless instances don't share memory.

const KEY = Symbol.for("rassah.localRepo");
type WithRepo = typeof globalThis & { [KEY]?: MemoryRepo };

/**
 * Builds a fresh local repo from data/*.json. `seedFacts` pre-loads ground-truth facts (origin "seeded");
 * `mockData` adds the demo history from lib/demo/mock-data.ts (orders 9001+ and their events).
 */
export function buildLocalRepo(opts: { seedFacts: boolean; mockData?: boolean }): MemoryRepo {
  const repo = new MemoryRepo();
  for (const p of loadProducts()) {
    repo.products.set(p.id, {
      id: p.id,
      name: p.name,
      description: p.description,
      url: p.url,
      category: p.category,
      sourceHash: computeSourceHash(p.name, p.description),
    });
  }
  const { cartons, shipping } = loadCartons();
  repo.cartons = cartons;
  repo.rates = shipping;
  for (const o of loadOrders()) repo.orders.set(o.id, { id: o.id, demo: o.demo ?? null, expect: o.expect, lines: o.items });
  if (opts.seedFacts) {
    const nowIso = new Date().toISOString();
    for (const f of seededFactsFromGroundTruth(loadGroundTruth(), [...repo.products.values()], nowIso)) {
      repo.facts.set(f.productId, f);
    }
  }
  if (opts.mockData) {
    const mock = buildMockData(Date.now(), { promptVersion: PROMPT_VERSION, engineVersion: ENGINE_VERSION });
    for (const o of mock.orders) repo.orders.set(o.id, { id: o.id, demo: MOCK_ORDER_TAG, expect: o.expect, createdAt: o.createdAt, lines: o.lines });
    repo.orderRuns.push(...mock.runs);
    repo.extractionEvents.push(...mock.extractions);
    repo.corrections.push(...mock.corrections);
  }
  repo.useRealClock = true;
  return repo;
}

export function getLocalRepo(): MemoryRepo {
  const g = globalThis as WithRepo;
  if (!g[KEY]) {
    g[KEY] = buildLocalRepo({
      seedFacts: shouldSeedFacts({ MEMORY_SEED_FACTS: process.env.MEMORY_SEED_FACTS, GEMINI_API_KEY: process.env.GEMINI_API_KEY }),
      mockData: process.env.MEMORY_MOCK_DATA?.trim() === "true",
    });
  }
  return g[KEY];
}

/** Number of products whose facts were pre-loaded for the offline demo (0 when seeding is off). */
export function seededFactsCount(): number {
  return [...getLocalRepo().facts.values()].filter((f) => f.origin === "seeded").length;
}
