import "server-only";
// Alert rules (docs/stack/06 §3). evaluateRules() is pure; syncAlerts() opens/resolves alerts in the repo.
// Rules use rolling "last N events" windows, independent of the dashboard's time filter.

import type { Repo } from "@/lib/db/repo";
import type { Alert, Correction, ExtractionEvent, OrderRun, Severity } from "@/lib/db/types";
import { percentile } from "./metrics";

export interface RuleEvaluation {
  rule: string;
  severity: Severity;
  breached: boolean;
  value: number;
  threshold: number;
  sampleSize: number;
  minSample: number;
  message: string;
  simulated: boolean;
}

export interface AlertInput {
  extractions: ExtractionEvent[];
  runs: OrderRun[];
  corrections: Correction[];
  nowMs: number;
}

export const THRESHOLDS = {
  m6FailureRate: 0.1,
  m6Last: 20,
  m6MinSample: 5,
  m1CorrectionRate: 0.2,
  m1LastProducts: 30,
  m1MinSample: 10,
  m5UncachedP95Ms: 8000,
  m5CachedP95Ms: 2000,
  m5Last: 20,
  m5MinSample: 5,
  m4NoBoxRate: 0.15,
  m4Last: 20,
  m4MinSample: 10,
  m2UnknownShare: 0.3,
  m2MinUnits: 10,
};

const newestFirst = <T extends { createdAt?: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function evaluateRules(input: AlertInput): RuleEvaluation[] {
  const t = THRESHOLDS;
  const runs = newestFirst(input.runs.filter((r) => r.trigger !== "eval"));
  const extractions = newestFirst(input.extractions.filter((e) => e.trigger !== "eval"));
  const dayAgo = new Date(input.nowMs - 24 * 3600_000).toISOString();
  const out: RuleEvaluation[] = [];

  // M3: any validator rejection in the last 24 h is an engine bug.
  const lastDay = runs.filter((r) => (r.createdAt ?? "") >= dayAgo);
  const rejections = lastDay.reduce((s, r) => s + r.validatorRejections, 0);
  out.push({
    rule: "M3_validator_rejection",
    severity: "critical",
    breached: rejections > 0,
    value: rejections,
    threshold: 0,
    sampleSize: lastDay.length,
    minSample: 1,
    message: `المحرك أنتج ${rejections} ترتيب رفضه الـ Validator خلال 24 ساعة (يجب أن يكون صفراً)`,
    simulated: false,
  });

  // M6: Gemini failure rate over the last 20 extraction attempts.
  const recentEx = extractions.slice(0, t.m6Last);
  const failures = recentEx.filter((e) => e.status !== "ok");
  const failRate = recentEx.length ? failures.length / recentEx.length : 0;
  const simulated = failures.length > 0 && failures.every((e) => e.status === "simulated_outage");
  // A simulated outage ends as soon as Gemini answers again; real failures must age out of the window.
  const simulatedRecovered = simulated && recentEx[0]?.status === "ok";
  out.push({
    rule: "M6_gemini_failure_rate",
    severity: "critical",
    breached: recentEx.length >= t.m6MinSample && failRate > t.m6FailureRate && !simulatedRecovered,
    value: failRate,
    threshold: t.m6FailureRate,
    sampleSize: recentEx.length,
    minSample: t.m6MinSample,
    message: `فشل ${pct(failRate)} من آخر ${recentEx.length} طلب لـ Gemini${simulated ? " (عطل تجريبي)" : ""}`,
    simulated,
  });

  // M1: correction rate over the last 30 reviewed AI products.
  const reviewed: string[] = [];
  for (const r of runs) {
    if (r.employeeAction === "pending") continue;
    for (const p of r.aiProducts) if (!reviewed.includes(p)) reviewed.push(p);
    if (reviewed.length >= t.m1LastProducts) break;
  }
  const reviewedSet = new Set(reviewed.slice(0, t.m1LastProducts));
  const corrected = new Set(input.corrections.filter((c) => c.priorOrigin === "ai" && reviewedSet.has(c.productId)).map((c) => c.productId));
  const corrRate = reviewedSet.size ? corrected.size / reviewedSet.size : 0;
  out.push({
    rule: "M1_correction_rate",
    severity: "warning",
    breached: reviewedSet.size >= t.m1MinSample && corrRate > t.m1CorrectionRate,
    value: corrRate,
    threshold: t.m1CorrectionRate,
    sampleSize: reviewedSet.size,
    minSample: t.m1MinSample,
    message: `الموظفون صححوا ${pct(corrRate)} من منتجات الـ AI المراجَعة: راجع الـ prompt بالتقييم`,
    simulated: false,
  });

  // M5: latency p95 over the last 20 runs, split cached/uncached.
  const recentRuns = runs.slice(0, t.m5Last);
  const cachedP95 = percentile(recentRuns.filter((r) => r.cacheMisses === 0).map((r) => r.totalMs), 95);
  const uncachedP95 = percentile(recentRuns.filter((r) => r.cacheMisses > 0).map((r) => r.totalMs), 95);
  const nCached = recentRuns.filter((r) => r.cacheMisses === 0).length;
  const nUncached = recentRuns.length - nCached;
  const slowUncached = nUncached >= t.m5MinSample && (uncachedP95 ?? 0) > t.m5UncachedP95Ms;
  const slowCached = nCached >= t.m5MinSample && (cachedP95 ?? 0) > t.m5CachedP95Ms;
  out.push({
    rule: "M5_latency_p95",
    severity: "warning",
    breached: slowUncached || slowCached,
    value: slowCached ? cachedP95 ?? 0 : uncachedP95 ?? 0,
    threshold: slowCached ? t.m5CachedP95Ms : t.m5UncachedP95Ms,
    sampleSize: recentRuns.length,
    minSample: t.m5MinSample,
    message: `زمن التجهيز p95: مع الكاش ${cachedP95 ?? "-"} ms، بدون كاش ${uncachedP95 ?? "-"} ms`,
    simulated: false,
  });

  // M4: no-carton rate over the last 20 runs that reached packing.
  const packedRuns = runs.filter((r) => r.status === "box_found" || r.status === "no_box").slice(0, t.m4Last);
  const noBoxRate = packedRuns.length ? packedRuns.filter((r) => r.status === "no_box").length / packedRuns.length : 0;
  out.push({
    rule: "M4_no_box_rate",
    severity: "warning",
    breached: packedRuns.length >= t.m4MinSample && noBoxRate > t.m4NoBoxRate,
    value: noBoxRate,
    threshold: t.m4NoBoxRate,
    sampleSize: packedRuns.length,
    minSample: t.m4MinSample,
    message: `${pct(noBoxRate)} من الطلبات ما لقت كرتون مناسب: راجع قائمة الكراتين أو هامش الأمان`,
    simulated: false,
  });

  // M2: share of unknown units in the last 24 h.
  let units = 0;
  let unknown = 0;
  for (const r of lastDay) {
    for (const v of Object.values(r.unitSources)) units += v;
    unknown += r.unitSources.unknown ?? 0;
  }
  const unknownShare = units ? unknown / units : 0;
  out.push({
    rule: "M2_unknown_share",
    severity: "info",
    breached: units >= t.m2MinUnits && unknownShare > t.m2UnknownShare,
    value: unknownShare,
    threshold: t.m2UnknownShare,
    sampleSize: units,
    minSample: t.m2MinUnits,
    message: `${pct(unknownShare)} من القطع بدون أبعاد معروفة: صفحات المتجر ناقصة البيانات`,
    simulated: false,
  });

  return out;
}

export interface SyncOptions {
  webhookUrl?: string;
  fetchFn?: typeof fetch;
}

/** Opens alerts for newly breached rules (one open alert per rule) and resolves recovered ones. */
export async function syncAlerts(repo: Repo, evaluations: RuleEvaluation[], opts: SyncOptions = {}): Promise<Alert[]> {
  const open = await repo.listOpenAlerts();
  const openByRule = new Map(open.map((a) => [a.rule, a]));

  for (const ev of evaluations) {
    const existing = openByRule.get(ev.rule);
    if (ev.breached && !existing) {
      const alert: Alert = {
        rule: ev.rule,
        severity: ev.severity,
        value: ev.value,
        threshold: ev.threshold,
        sampleSize: ev.sampleSize,
        message: ev.message,
        simulated: ev.simulated,
        resolvedAt: null,
      };
      await repo.insertAlert(alert);
      if (opts.webhookUrl && !ev.simulated) {
        try {
          await (opts.fetchFn ?? fetch)(opts.webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: `[Rassah] ${ev.severity.toUpperCase()} ${ev.rule}: ${ev.message}` }),
          });
        } catch {
          // Alert delivery is best effort; the dashboard banner is the primary channel.
        }
      }
    } else if (!ev.breached && existing?.id) {
      await repo.resolveAlert(existing.id);
    }
  }
  return repo.listOpenAlerts();
}
