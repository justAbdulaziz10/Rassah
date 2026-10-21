import { useSyncExternalStore } from "react";

/** The order queue as /api/orders/queue returns it (the fields the console reads). */
export interface QueueSummary {
  counts: { new: number; ready: number; attention: number; done: number; remaining: number; total: number };
  alertsOpen: number;
  remainingOrderIds: string[];
  done: Array<{ id: string; at: string | null }>;
}

// ConsoleNav polls the queue and publishes it here, so other screens read the same answer instead of fetching again.
let latest: QueueSummary | null = null;
const listeners = new Set<() => void>();

export function publishQueue(summary: QueueSummary) {
  latest = summary;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useQueue(): QueueSummary | null {
  return useSyncExternalStore(
    subscribe,
    () => latest,
    () => null,
  );
}
