import "server-only";
// Everything the /monitoring page needs, computed server-side: metrics for the selected window,
// the latency series, recent runs, and alerts (re-evaluated on every load).

import type { Repo } from "@/lib/db/repo";
import type { Alert, Correction, OrderRun, RunStatus } from "@/lib/db/types";
import { alertsSince, refreshAlerts } from "@/lib/pipeline/pack";
import { THRESHOLDS } from "./alerts";
import { computeMetrics, latencySeries, windowSince, type LatencyPoint, type Metrics, type MetricWindow } from "./metrics";

export interface DashboardData {
  window: MetricWindow;
  generatedAt: string;
  metrics: Metrics;
  latency: LatencyPoint[];
  /** Orders the packer reviewed, oldest first: how many AI-read products each had and how many were corrected (M1). */
  reviews: ReviewPoint[];
  recentRuns: OrderRun[];
  alerts: Alert[];
  totals: { runs: number; extractions: number; corrections: number };
  alertsError: boolean;
  /** Runs per result in the window, so the page can say what happened, not only rates. */
  outcomes: Record<RunStatus, number>;
  /** Order numbers whose latest run in the window was not packable, newest first (for direct links). */
  problemOrders: Array<{ orderId: string; status: RunStatus; at: string | null }>;
  /** The alert limits, shown next to each number so "is this good?" has an answer on screen. */
  targets: {
    correctionRate: number;
    failureRate: number;
    cachedP95Ms: number;
    uncachedP95Ms: number;
    noBoxRate: number;
    unknownShare: number;
  };
}

export interface ReviewPoint {
  at: string;
  orderId: string;
  /** Products in the order whose facts Rassah had read (origin "ai") when it was packed. */
  reviewed: number;
  /** Of those, how many the packer corrected in this order. */
  corrected: number;
  /** Fields corrected in this order (database column names, e.g. height_cm). */
  fields: string[];
}

/** One point per reviewed order that had AI-read products, oldest first. */
export function reviewSeries(runs: OrderRun[], corrections: Correction[]): ReviewPoint[] {
  const byRun = new Map<string, Correction[]>();
  for (const c of corrections) {
    if (c.priorOrigin !== "ai" || !c.runId) continue;
    const list = byRun.get(c.runId);
    if (list) list.push(c);
    else byRun.set(c.runId, [c]);
  }
  return runs
    .filter((r) => r.trigger !== "eval" && r.createdAt && r.employeeAction !== "pending" && r.aiProducts.length > 0)
    .map((r) => {
      const own = (byRun.get(r.id) ?? []).filter((c) => r.aiProducts.includes(c.productId));
      return {
        at: r.createdAt!,
        orderId: r.orderId,
        reviewed: r.aiProducts.length,
        corrected: new Set(own.map((c) => c.productId)).size,
        fields: [...new Set(own.map((c) => c.field))],
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

const NOT_PACKABLE: RunStatus[] = ["no_box", "needs_measurement", "error"];

function latestProblems(runs: OrderRun[]): DashboardData["problemOrders"] {
  const seen = new Set<string>();
  const out: DashboardData["problemOrders"] = [];
  for (const r of runs) {
    if (seen.has(r.orderId)) continue;
    seen.add(r.orderId);
    if (NOT_PACKABLE.includes(r.status)) out.push({ orderId: r.orderId, status: r.status, at: r.createdAt ?? null });
  }
  return out.slice(0, 12);
}

const from = <T extends { createdAt?: string }>(rows: T[], sinceIso: string | null): T[] => {
  if (sinceIso === null) return rows;
  const min = Date.parse(sinceIso);
  return rows.filter((r) => Date.parse(r.createdAt ?? "") >= min);
};

export async function loadDashboard(repo: Repo, window: MetricWindow, nowMs: number, webhookUrl?: string): Promise<DashboardData> {
  const since = windowSince(window, nowMs);
  const alertSince = alertsSince(nowMs);
  // One read covers both the selected window and the alert rules' 7 days, whichever reaches further back.
  const readSince = since === null || Date.parse(since) < Date.parse(alertSince) ? since : alertSince;
  const [allExtractions, allRuns, allCorrections] = await Promise.all([
    repo.listExtractionEvents(readSince),
    repo.listOrderRuns(readSince),
    repo.listCorrections(readSince),
  ]);
  const extractions = from(allExtractions, since);
  const runs = from(allRuns, since);
  const corrections = from(allCorrections, since);
  let alerts: Alert[] = [];
  let alertsError = false;
  try {
    alerts = await refreshAlerts(repo, nowMs, webhookUrl, {
      extractions: from(allExtractions, alertSince),
      runs: from(allRuns, alertSince),
      corrections: from(allCorrections, alertSince),
    });
  } catch {
    alertsError = true;
  }
  const live = runs.filter((r) => r.trigger !== "eval");
  const newest = [...live].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const outcomes: Record<RunStatus, number> = { box_found: 0, no_box: 0, needs_measurement: 0, error: 0 };
  for (const r of live) outcomes[r.status]++;
  return {
    window,
    generatedAt: new Date(nowMs).toISOString(),
    metrics: computeMetrics({ extractions, runs, corrections }),
    latency: latencySeries(runs).slice(-200),
    reviews: reviewSeries(runs, corrections).slice(-200),
    recentRuns: newest.slice(0, 25),
    alerts,
    totals: { runs: live.length, extractions: extractions.filter((e) => e.trigger !== "eval").length, corrections: corrections.length },
    alertsError,
    outcomes,
    problemOrders: latestProblems(newest),
    targets: {
      correctionRate: THRESHOLDS.m1CorrectionRate,
      failureRate: THRESHOLDS.m6FailureRate,
      cachedP95Ms: THRESHOLDS.m5CachedP95Ms,
      uncachedP95Ms: THRESHOLDS.m5UncachedP95Ms,
      noBoxRate: THRESHOLDS.m4NoBoxRate,
      unknownShare: THRESHOLDS.m2UnknownShare,
    },
  };
}
