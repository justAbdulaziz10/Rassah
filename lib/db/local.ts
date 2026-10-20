import "server-only";
import { computeSourceHash } from "@/lib/data/hash";
import { loadCartons, loadOrders, loadProducts } from "@/lib/data/load";
import { MemoryRepo } from "./memory";

// Local / offline backend (DATA_BACKEND=memory): the mock store from data/*.json in process memory.
// One instance per server process (kept on globalThis so dev hot-reloads keep the data).
// Never use this on Vercel: serverless instances don't share memory.

const KEY = Symbol.for("rassah.localRepo");
type WithRepo = typeof globalThis & { [KEY]?: MemoryRepo };

export function getLocalRepo(): MemoryRepo {
  const g = globalThis as WithRepo;
  if (!g[KEY]) {
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
    repo.useRealClock = true;
    g[KEY] = repo;
  }
  return g[KEY];
}
