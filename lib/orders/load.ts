import "server-only";
import type { Repo } from "@/lib/db/repo";
import type { Alert, Product } from "@/lib/db/types";
import { buildQueue, countQueue, sortQueue, type QueueCounts, type QueueEntry } from "./queue";

export interface QueueSnapshot {
  entries: QueueEntry[];
  counts: QueueCounts;
  products: Map<string, Product>;
  /** Handling flags per product from the saved facts, for the order cards. */
  flags: Map<string, { fragile: boolean; liquid: boolean; sensitive: boolean }>;
  alerts: Alert[];
}

/** Everything the orders page, the header badges and the notifications page need, in one round of reads. */
export async function loadQueue(repo: Repo): Promise<QueueSnapshot> {
  const [orders, runs, facts, products, alerts] = await Promise.all([
    repo.listOrders(),
    repo.listOrderRuns(null),
    repo.listFacts(),
    repo.listProducts(),
    repo.listOpenAlerts(),
  ]);
  const factsById = new Map(facts.map((f) => [f.productId, f]));
  const entries = sortQueue(buildQueue(orders, runs, factsById));
  return {
    entries,
    counts: countQueue(entries),
    products: new Map(products.map((p) => [p.id, p])),
    flags: new Map(facts.map((f) => [f.productId, { fragile: f.fragile, liquid: f.liquid, sensitive: f.sensitive }])),
    alerts,
  };
}
