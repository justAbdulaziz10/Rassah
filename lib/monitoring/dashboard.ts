// Everything the /monitoring page needs, computed server-side: metrics for the selected window,
// the latency series, recent runs, and alerts (re-evaluated on every load).

import type { Repo } from "@/lib/db/repo";
import type { Alert, OrderRun } from "@/lib/db/types";
import { refreshAlerts } from "@/lib/pipeline/pack";
import { computeMetrics, latencySeries, windowSince, type LatencyPoint, type Metrics, type MetricWindow } from "./metrics";

export interface DashboardData {
  window: MetricWindow;
  generatedAt: string;
  metrics: Metrics;
  latency: LatencyPoint[];
  recentRuns: OrderRun[];
  alerts: Alert[];
  totals: { runs: number; extractions: number; corrections: number };
  alertsError: boolean;
}

export async function loadDashboard(repo: Repo, window: MetricWindow, nowMs: number, webhookUrl?: string): Promise<DashboardData> {
  const since = windowSince(window, nowMs);
  const [extractions, runs, corrections] = await Promise.all([
    repo.listExtractionEvents(since),
    repo.listOrderRuns(since),
    repo.listCorrections(since),
  ]);
  let alerts: Alert[] = [];
  let alertsError = false;
  try {
    alerts = await refreshAlerts(repo, nowMs, webhookUrl);
  } catch {
    alertsError = true;
  }
  const live = runs.filter((r) => r.trigger !== "eval");
  return {
    window,
    generatedAt: new Date(nowMs).toISOString(),
    metrics: computeMetrics({ extractions, runs, corrections }),
    latency: latencySeries(runs).slice(-200),
    recentRuns: [...live].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 25),
    alerts,
    totals: { runs: live.length, extractions: extractions.filter((e) => e.trigger !== "eval").length, corrections: corrections.length },
    alertsError,
  };
}
