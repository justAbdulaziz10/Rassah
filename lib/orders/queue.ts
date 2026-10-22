// Where each order stands for the packing employee, derived from what is already stored:
// the order runs (each time Rassah prepared an order) and the saved product facts.
// Pure, so it is unit-tested and shared by the orders page, the header badges and the notifications page.

import type { OrderSummary, QueueRun, RunStatus, StoredFacts } from "@/lib/db/types";

/**
 * new: nobody has prepared it yet, or its products were measured after the last attempt stopped for that.
 * ready: Rassah chose a carton; the employee has not confirmed packing.
 * attention: the last attempt stopped (a product needs measuring, no carton fits, or an error),
 *   or a product in it is already known to need measuring.
 * done: the employee confirmed the packing.
 */
export type QueueState = "new" | "ready" | "attention" | "done";

export type AttentionReason = "needs_measurement" | "no_box" | "split" | "error";

export interface QueueEntry {
  order: OrderSummary;
  state: QueueState;
  reason: AttentionReason | null;
  /** Products in this order whose saved facts already say they must be measured. */
  unmeasured: string[];
  lastPreparedAt: string | null;
  confirmedAt: string | null;
}

export type QueueCounts = Record<QueueState, number> & { remaining: number; total: number };

/** Saved facts that will stop packing until someone measures the product (same rule as the engine's prepare step). */
export function needsMeasuring(f: StoredFacts | undefined): boolean {
  if (!f) return false; // not read yet: Rassah will try to read the product page first
  return (
    f.dimsSource === "unknown" ||
    f.weightSource === "unknown" ||
    !(f.lengthCm! > 0 && f.widthCm! > 0 && f.heightCm! > 0 && f.weightG! > 0)
  );
}

const ATTENTION: Partial<Record<RunStatus, AttentionReason>> = {
  needs_measurement: "needs_measurement",
  no_box: "no_box",
  error: "error",
};

function time(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) || 0 : 0;
}

export function buildQueue(orders: OrderSummary[], runs: QueueRun[], facts: Map<string, StoredFacts>): QueueEntry[] {
  const byOrder = new Map<string, QueueRun[]>();
  for (const r of runs) {
    if (r.trigger !== "order") continue; // evaluation runs are not real packing work
    const list = byOrder.get(r.orderId);
    if (list) list.push(r);
    else byOrder.set(r.orderId, [r]);
  }

  return orders.map((order) => {
    // A store order's number may have been typed into Rassah before the order existed (an error run is
    // saved for unknown numbers). Only runs from after the order was placed belong to it.
    const placedAt = order.customerName !== null ? time(order.createdAt) : 0;
    const orderRuns = (byOrder.get(order.id) ?? []).filter((r) => time(r.createdAt) >= placedAt).sort((a, b) => time(b.createdAt) - time(a.createdAt));
    const latest = orderRuns[0];
    const confirmedRun = orderRuns.find((r) => r.employeeAction === "confirmed");
    const unmeasured = order.productIds.filter((id) => needsMeasuring(facts.get(id)));
    const base = { order, unmeasured, lastPreparedAt: latest?.createdAt ?? null, confirmedAt: null };

    if (confirmedRun) {
      return { ...base, state: "done", reason: null, confirmedAt: confirmedRun.actionAt ?? confirmedRun.createdAt ?? null };
    }
    // No single carton fits, but Rassah found a split into several cartons (pack pipeline sets strategy split_N).
    const split = latest?.status === "no_box" && latest.strategy?.startsWith("split_");
    // The last attempt stopped for measuring, and every product has usable saved facts since then.
    const measuredSince =
      latest?.status === "needs_measurement" && order.productIds.every((id) => facts.has(id) && !needsMeasuring(facts.get(id)));
    const runReason = latest && !measuredSince ? (split ? "split" : (ATTENTION[latest.status] ?? null)) : null;
    // Facts saved after the last attempt can settle it either way, so a fresh "needs measuring" wins over an old success.
    const reason = runReason ?? (unmeasured.length > 0 ? "needs_measurement" : null);
    if (reason) return { ...base, state: "attention", reason };
    // Measured since the last attempt: no carton has been chosen yet, so it is new work again, not waiting for confirmation.
    return { ...base, state: latest && !measuredSince ? "ready" : "new", reason: null };
  });
}

const ORDER: Record<QueueState, number> = { attention: 0, new: 1, ready: 2, done: 3 };

/** Work order for the employee: problems first, then new, then waiting for confirmation, then finished. */
export function sortQueue(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || Number(a.order.id) - Number(b.order.id) || a.order.id.localeCompare(b.order.id),
  );
}

export function countQueue(entries: QueueEntry[]): QueueCounts {
  const c: QueueCounts = { new: 0, ready: 0, attention: 0, done: 0, remaining: 0, total: entries.length };
  for (const e of entries) c[e.state]++;
  c.remaining = c.total - c.done;
  return c;
}
