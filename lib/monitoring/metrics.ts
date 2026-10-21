import "server-only";
// The seven dashboard metrics (docs/stack/06 §2). Pure functions over event arrays, so every
// formula is unit-tested. Evaluation traffic (trigger = "eval") is always excluded.

import type { Correction, ExtractionEvent, OrderRun } from "@/lib/db/types";
import type { DataSource, ViolationCode } from "@/lib/engine/types";

export type MetricWindow = "1h" | "24h" | "7d" | "all";
export const WINDOWS: MetricWindow[] = ["1h", "24h", "7d", "all"];

export function windowSince(window: MetricWindow, nowMs: number): string | null {
  const hours = { "1h": 1, "24h": 24, "7d": 24 * 7, all: null }[window];
  return hours === null ? null : new Date(nowMs - hours * 3600_000).toISOString();
}

interface Metric<T = number | null> {
  value: T;
  n: number;
  minN: number;
  sufficient: boolean;
}

function metric<T>(value: T, n: number, minN: number): Metric<T> {
  return { value, n, minN, sufficient: n >= minN };
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank method: the smallest value with at least p% of samples at or below it.
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export interface MetricInput {
  extractions: ExtractionEvent[];
  runs: OrderRun[];
  corrections: Correction[];
}

export interface Metrics {
  m1CorrectionRate: Metric & { corrected: number; reviewed: number; byField: Record<string, number> };
  m2SourceMix: Metric<Record<DataSource, number>> & { unknownShare: number | null };
  m3ValidatorRejections: Metric<number> & { byCode: Partial<Record<ViolationCode, number>> };
  m4NoBoxRate: Metric & { skipReasons: Record<string, number> };
  m5Latency: {
    cached: Metric<{ p50: number | null; p95: number | null }>;
    uncached: Metric<{ p50: number | null; p95: number | null }>;
  };
  m6GeminiFailureRate: Metric & { byStatus: Record<string, number> };
  m7Cost: Metric & { totalUsd: number; cacheHitRate: number | null; hits: number; misses: number };
}

export function computeMetrics(input: MetricInput): Metrics {
  const extractions = input.extractions.filter((e) => e.trigger !== "eval");
  const runs = input.runs.filter((r) => r.trigger !== "eval");

  // M1: of the AI-extracted products a packer reviewed (confirmed or edited runs), how many needed a correction?
  const reviewed = new Set<string>();
  for (const r of runs) if (r.employeeAction !== "pending") for (const p of r.aiProducts) reviewed.add(p);
  const aiCorrections = input.corrections.filter((c) => c.priorOrigin === "ai" && reviewed.has(c.productId));
  const corrected = new Set(aiCorrections.map((c) => c.productId));
  const byField: Record<string, number> = {};
  for (const c of aiCorrections) byField[c.field] = (byField[c.field] ?? 0) + 1;
  const m1 = {
    ...metric(reviewed.size ? corrected.size / reviewed.size : null, reviewed.size, 10),
    corrected: corrected.size,
    reviewed: reviewed.size,
    byField,
  };

  // M2: data-source mix of all units in runs.
  const mix: Record<DataSource, number> = { page: 0, inferred: 0, manual: 0, unknown: 0 };
  for (const r of runs) for (const k of Object.keys(mix) as DataSource[]) mix[k] += r.unitSources[k] ?? 0;
  const units = Object.values(mix).reduce((s, v) => s + v, 0);
  const m2 = { ...metric(mix, units, 10), unknownShare: units ? mix.unknown / units : null };

  // M3: validator rejections of the engine's own layouts (should always be 0).
  const byCode: Partial<Record<ViolationCode, number>> = {};
  for (const r of runs) for (const v of r.violations) byCode[v.code] = (byCode[v.code] ?? 0) + 1;
  const m3 = { ...metric(runs.reduce((s, r) => s + r.validatorRejections, 0), runs.length, 1), byCode };

  // M4: share of runs that reached packing but found no carton, with per-carton skip reasons.
  const packed = runs.filter((r) => r.status === "box_found" || r.status === "no_box");
  const noBox = packed.filter((r) => r.status === "no_box");
  const skipReasons: Record<string, number> = {};
  for (const r of noBox) for (const a of r.attempts) skipReasons[a.outcome] = (skipReasons[a.outcome] ?? 0) + 1;
  const m4 = { ...metric(packed.length ? noBox.length / packed.length : null, packed.length, 10), skipReasons };

  // M5: latency percentiles, split by whether Gemini had to be called. Error runs (unknown order number,
  // failed lookup) stop early with no cache misses, so they would make the cached figures look faster.
  const timed = runs.filter((r) => r.status !== "error");
  const cachedMs = timed.filter((r) => r.cacheMisses === 0).map((r) => r.totalMs);
  const uncachedMs = timed.filter((r) => r.cacheMisses > 0).map((r) => r.totalMs);
  const m5 = {
    cached: metric({ p50: percentile(cachedMs, 50), p95: percentile(cachedMs, 95) }, cachedMs.length, 10),
    uncached: metric({ p50: percentile(uncachedMs, 50), p95: percentile(uncachedMs, 95) }, uncachedMs.length, 10),
  };

  // M6: Gemini failure rate with a breakdown by status.
  const byStatus: Record<string, number> = {};
  for (const e of extractions) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  const failed = extractions.filter((e) => e.status !== "ok").length;
  const m6 = { ...metric(extractions.length ? failed / extractions.length : null, extractions.length, 5), byStatus };

  // M7: cost per order and cache-hit rate.
  const totalUsd = runs.reduce((s, r) => s + r.costUsd, 0);
  const hits = runs.reduce((s, r) => s + r.cacheHits, 0);
  const misses = runs.reduce((s, r) => s + r.cacheMisses, 0);
  const m7 = {
    ...metric(runs.length ? totalUsd / runs.length : null, runs.length, 10),
    totalUsd,
    cacheHitRate: hits + misses ? hits / (hits + misses) : null,
    hits,
    misses,
  };

  return {
    m1CorrectionRate: m1,
    m2SourceMix: m2,
    m3ValidatorRejections: m3,
    m4NoBoxRate: m4,
    m5Latency: m5,
    m6GeminiFailureRate: m6,
    m7Cost: m7,
  };
}

export interface LatencyPoint {
  at: string;
  totalMs: number;
  cached: boolean;
  orderId: string;
}

export function latencySeries(runs: OrderRun[]): LatencyPoint[] {
  return runs
    .filter((r) => r.trigger !== "eval" && r.createdAt)
    .map((r) => ({ at: r.createdAt!, totalMs: r.totalMs, cached: r.cacheMisses === 0, orderId: r.orderId }))
    .sort((a, b) => a.at.localeCompare(b.at));
}
