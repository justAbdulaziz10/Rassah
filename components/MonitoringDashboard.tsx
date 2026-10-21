"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Correction, ExtractionEvent, OrderRun } from "@/lib/db/types";
import type { DashboardData } from "@/lib/monitoring/dashboard";
import {
  EXTRACTION_STATUS_LABEL,
  fmtAiSar,
  fmtApiError,
  fmtClock,
  fmtCount,
  fmtMs,
  fmtPct,
  fmtTime,
  ltr,
  ORIGIN_LABEL,
  OUTCOME_LABEL,
  SOURCE_HINT,
  SOURCE_LABEL,
  STATUS_LABEL,
} from "@/lib/ui/format";
import { StatusPill } from "./Badges";
import { AlertIcon, CheckIcon, InfoIcon } from "./Icons";
import { DashboardSkeleton, EmptyState, Notice } from "./PageHeader";

const FIELD_LABEL: Record<string, string> = {
  length_cm: "الطول",
  width_cm: "العرض",
  height_cm: "الارتفاع",
  weight_g: "الوزن",
  fragile: "قابل للكسر",
  liquid: "سائل",
  sensitive: "حساس",
};
const EMPLOYEE_ACTION: Record<string, string> = { pending: "لم يؤكّد بعد", confirmed: "أكّد التغليف", edited: "صحّح البيانات" };
const ORDERS = { one: "طلب واحد", two: "طلبان", few: "طلبات", many: "طلباً" };
const READS = { one: "قراءة واحدة", two: "قراءتان", few: "قراءات", many: "قراءة" };
const PRODUCTS = { one: "منتج واحد", two: "منتجان", few: "منتجات", many: "منتجاً" };
const PIECES = { one: "قطعة واحدة", two: "قطعتان", few: "قطع", many: "قطعة" };
const REFRESH_SECONDS = 15;

type Win = DashboardData["window"];
const WINDOWS: Array<[Win, string]> = [
  ["1h", "آخر ساعة"],
  ["24h", "آخر 24 ساعة"],
  ["7d", "آخر 7 أيام"],
  ["all", "الكل"],
];

const AXIS = { stroke: "var(--chart-axis)", fontSize: 12, tickLine: false } as const;

interface Trace {
  run: OrderRun;
  extractions: ExtractionEvent[];
  corrections: Correction[];
  names?: Record<string, string>;
}

export default function MonitoringDashboard({ initialRun }: { initialRun: string | null }) {
  const [win, setWin] = useState<Win>("24h");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [traceId, setTraceId] = useState<string | null>(initialRun);
  const [trace, setTrace] = useState<Trace | null>(null);

  // State is only set after the await, never synchronously inside the effect.
  // Only the newest request may update the screen: a slow reply for an old window must not overwrite the selected one.
  const seq = useRef(0);
  const load = useCallback(async (w: Win) => {
    const mine = ++seq.current;
    try {
      const res = await fetch(`/api/monitoring/metrics?window=${w}`, { cache: "no-store" });
      const json = await res.json();
      if (mine !== seq.current) return;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as DashboardData);
      setError(null);
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message);
    } finally {
      if (mine === seq.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Poll the metrics endpoint: first load right away, then every 15 seconds.
    const first = setTimeout(() => void load(win), 0);
    const t = setInterval(() => void load(win), REFRESH_SECONDS * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [win, load]);

  useEffect(() => {
    if (!traceId) return;
    let cancelled = false;
    fetch(`/api/runs/${traceId}/trace`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setTrace(j as Trace | null);
      })
      .catch(() => {
        if (!cancelled) setTrace(null); // never leave the previous run's trace under a new selection
      });
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  if (!data) {
    return error ? <Notice tone="critical">تعذّر تحميل أرقام الأداء. {fmtApiError(error)}</Notice> : <DashboardSkeleton />;
  }

  const shownTrace = trace && trace.run.id === traceId ? trace : null;
  const toggleRun = (id: string) => setTraceId((cur) => (cur === id ? null : id));

  return (
    <div className={`space-y-6 transition-opacity ${refreshing ? "opacity-70" : ""}`}>
      {/* One filter row scopes every number below. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-sm" role="group" aria-label="الفترة الزمنية">
          <span className="text-muted">الفترة:</span>
          <span className="inline-flex gap-1 rounded-full border border-border bg-surface p-1">
            {WINDOWS.map(([w, label]) => (
              <button
                key={w}
                onClick={() => {
                  if (w === win) return;
                  setRefreshing(true); // hold the previous render dimmed until the new window loads
                  setWin(w);
                }}
                aria-pressed={win === w}
                className={`rounded-full px-3 py-1.5 whitespace-nowrap transition-colors ${win === w ? "bg-brand font-bold text-brand-contrast" : "text-muted hover:bg-border/40 hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted sm:ms-auto" aria-live="polite">
          <span title={fmtTime(data.generatedAt)}>
            آخر تحديث {fmtClock(data.generatedAt)} · يتحدّث تلقائياً كل {ltr(String(REFRESH_SECONDS))} ثانية
          </span>
          <button
            onClick={() => {
              setRefreshing(true);
              void load(win);
            }}
            className="rounded-lg border border-border bg-surface px-2.5 py-1 font-medium text-foreground hover:border-brand hover:text-brand"
          >
            حدّث الآن
          </button>
        </p>
      </div>

      {error && <Notice tone="warn">تعذّر تحديث الأرقام ({fmtApiError(error)}). المعروض هو آخر تحديث ناجح.</Notice>}

      <Health data={data} />
      <Numbers data={data} />

      <section className="grid gap-4 lg:grid-cols-2">
        <LatencyCard data={data} />
        <OutcomesCard data={data} />
        <div className="grid content-start gap-4">
          <SourcesCard data={data} />
          <ReadsCard data={data} />
        </div>
      </section>

      {traceId && !data.recentRuns.some((r) => r.id === traceId) && (
        <section className="panel p-4 sm:p-5" aria-label="تفاصيل الطلب">
          {shownTrace ? <TraceView trace={shownTrace} /> : <p className="text-sm text-muted">جارٍ تحميل التفاصيل…</p>}
          <button onClick={() => setTraceId(null)} className="mt-3 rounded-lg border border-border px-3 py-1 text-xs hover:border-brand">
            إغلاق
          </button>
        </section>
      )}

      <RecentRuns runs={data.recentRuns} openId={traceId} trace={shownTrace} onToggle={toggleRun} />
    </div>
  );
}

/* ---------------------------------------------------------------- health */

type Verdict = "ok" | "over" | "few";

interface Signal {
  key: string;
  title: string;
  verdict: Verdict;
  result: string;
  limit: string;
  few?: string;
  action?: { href: string; label: string };
}

function signals(d: DashboardData): Signal[] {
  const m = d.metrics;
  const t = d.targets;
  const few = (n: number, minN: number, what: string) => `تكفي ${ltr(String(minN))} ${what} للحكم، والمتوفر ${ltr(String(n))}`;
  const judge = (sufficient: boolean, over: boolean): Verdict => (!sufficient ? "few" : over ? "over" : "ok");

  const reads = m.m6GeminiFailureRate;
  const failed = reads.n - (reads.byStatus.ok ?? 0);
  const m1 = m.m1CorrectionRate;
  const cached = m.m5Latency.cached;
  const uncached = m.m5Latency.uncached;
  const slowCached = cached.sufficient && (cached.value.p95 ?? 0) > t.cachedP95Ms;
  const slowNew = uncached.sufficient && (uncached.value.p95 ?? 0) > t.uncachedP95Ms;
  const m4 = m.m4NoBoxRate;
  const m3 = m.m3ValidatorRejections;
  const m2 = m.m2SourceMix;

  return [
    {
      key: "reads",
      title: "قراءة صفحات المنتجات الجديدة",
      verdict: judge(reads.sufficient, (reads.value ?? 0) > t.failureRate),
      result:
        reads.n === 0
          ? "لم تحتج رصّة إلى قراءة أي صفحة جديدة في هذه الفترة."
          : `القراءات الفاشلة: ${ltr(String(failed))} من أصل ${fmtCount(reads.n, READS)} (${fmtPct(reads.value)}).`,
      limit: `الحدّ ${fmtPct(t.failureRate)}`,
      few: few(reads.n, reads.minN, "قراءات"),
      action: { href: "/catalog", label: "افتح المنتجات" },
    },
    {
      key: "accuracy",
      title: "دقة القراءة",
      verdict: judge(m1.sufficient, (m1.value ?? 0) > t.correctionRate),
      result:
        m1.reviewed === 0
          ? "لم يؤكّد الموظف بعد أي طلب فيه منتج قرأته رصّة."
          : `صحّح الموظف ${ltr(String(m1.corrected))} من ${fmtCount(m1.reviewed, PRODUCTS)} راجعها (${fmtPct(m1.value)}).`,
      limit: `الحدّ ${fmtPct(t.correctionRate)}`,
      few: few(m1.n, m1.minN, "منتجات مراجَعة"),
      action: { href: "/catalog", label: "راجع المنتجات" },
    },
    {
      key: "speed",
      title: "سرعة التجهيز",
      verdict: judge(cached.sufficient || uncached.sufficient, slowCached || slowNew),
      result:
        cached.n + uncached.n === 0
          ? "لم يُجهَّز أي طلب في هذه الفترة."
          : [
              cached.n > 0 ? `95% من الطلبات تنتهي خلال ${fmtMs(cached.value.p95)}` : null,
              uncached.n > 0 ? `${cached.n > 0 ? "و" : "95% من الطلبات "}خلال ${fmtMs(uncached.value.p95)} إن كان فيها منتج جديد` : null,
            ]
              .filter(Boolean)
              .join("، ") + ".",
      limit: `الحدّ ${fmtMs(t.cachedP95Ms)}، و${fmtMs(t.uncachedP95Ms)} مع منتج جديد`,
      few: few(cached.n + uncached.n, cached.minN, "طلبات"),
    },
    {
      key: "cartons",
      title: "إيجاد كرتون واحد للطلب",
      verdict: judge(m4.sufficient, (m4.value ?? 0) > t.noBoxRate),
      result:
        m4.n === 0
          ? "لم يصل أي طلب إلى اختيار الكرتون في هذه الفترة."
          : `طلبات لم يتّسع لها كرتون واحد: ${ltr(String(d.outcomes.no_box))} من أصل ${fmtCount(m4.n, ORDERS)} (${fmtPct(m4.value)}).`,
      limit: `الحدّ ${fmtPct(t.noBoxRate)}`,
      few: few(m4.n, m4.minN, "طلبات"),
    },
    {
      key: "validator",
      title: "فحص الترتيبات قبل عرضها",
      verdict: m3.value > 0 ? "over" : judge(m3.sufficient, false),
      result:
        m3.value === 0
          ? "لم يُرفض أي ترتيب: كل ترتيب رآه الموظف اجتاز الفحص."
          : `رُفض ${ltr(String(m3.value))} ترتيب. أبلغ الفريق التقني.`,
      limit: "يجب أن يبقى 0",
      few: "لم يُجهَّز أي طلب بعد",
    },
    {
      key: "measures",
      title: "مقاسات المنتجات",
      verdict: judge(m2.sufficient, (m2.unknownShare ?? 0) > t.unknownShare),
      result:
        m2.n === 0
          ? "لا توجد قطع في هذه الفترة."
          : `${ltr(String(m2.value.unknown))} من ${fmtCount(m2.n, PIECES)} بلا مقاس معروف (${fmtPct(m2.unknownShare)}) وتحتاج قياساً.`,
      limit: `الحدّ ${fmtPct(t.unknownShare)}`,
      few: few(m2.n, m2.minN, "قطع"),
      action: { href: "/catalog", label: "افتح المنتجات" },
    },
  ];
}

const VERDICT = {
  ok: { label: "سليم", cls: "bg-ok-soft text-ok", Icon: CheckIcon },
  over: { label: "فوق الحدّ", cls: "bg-critical-soft text-critical", Icon: AlertIcon },
  few: { label: "بيانات قليلة", cls: "bg-border/50 text-muted", Icon: InfoIcon },
} as const;

function Health({ data }: { data: DashboardData }) {
  const rows = signals(data);
  const over = rows.filter((r) => r.verdict === "over").length;
  const alerts = data.alerts.length;
  const few = rows.filter((r) => r.verdict === "few").length;
  const good = over === 0 && alerts === 0 && !data.alertsError;
  return (
    <section className="panel overflow-hidden" aria-labelledby="health-title">
      <div className={`flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5 ${good ? "bg-ok-soft text-ok" : "bg-critical-soft text-critical"}`}>
        {good ? <CheckIcon className="size-5" /> : <AlertIcon className="size-5" />}
        <h2 id="health-title" className="font-bold">
          {good
            ? few === 0
              ? "كل شيء يعمل كما يجب"
              : `لا شيء فوق الحدّ · ${fmtCount(few, { one: "مؤشر واحد", two: "مؤشران", few: "مؤشرات", many: "مؤشراً" })} بلا بيانات كافية بعد`
            : [alerts ? `${fmtCount(alerts, { one: "تنبيه مفتوح", two: "تنبيهان مفتوحان", few: "تنبيهات مفتوحة", many: "تنبيهاً مفتوحاً" })}` : null, over ? `${fmtCount(over, { one: "مؤشر واحد", two: "مؤشران", few: "مؤشرات", many: "مؤشراً" })} فوق الحدّ` : null]
                .filter(Boolean)
                .join(" · ")}
        </h2>
        <span className="text-sm font-normal opacity-90">· الحالة في الفترة المختارة مقارنةً بالحدود المسموحة</span>
      </div>

      {data.alertsError && (
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <Notice tone="warn">تعذّر فحص التنبيهات. حدّث الصفحة بعد قليل.</Notice>
        </div>
      )}
      {alerts > 0 && <Alerts alerts={data.alerts} />}

      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const v = VERDICT[r.verdict];
          return (
            <li key={r.key} data-signal={r.key} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[17rem_1fr_auto] sm:items-center sm:px-5">
              <p className="flex items-center gap-2 font-medium">
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${v.cls}`} title={r.verdict === "few" ? r.few : undefined}>
                  <v.Icon className="size-3.5" />
                  {v.label}
                </span>
                {r.title}
              </p>
              <p className="text-sm leading-6">
                {r.result}
                {r.verdict === "few" && r.few && <span className="block text-xs text-muted">{r.few}، فلا يُعتمد على النسبة بعد.</span>}
              </p>
              <p className="flex items-center gap-3 text-xs text-muted sm:justify-end">
                <span className="whitespace-nowrap">{r.limit}</span>
                {r.verdict === "over" && r.action && (
                  <Link href={r.action.href} className="whitespace-nowrap font-medium text-brand underline">
                    {r.action.label}
                  </Link>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Alerts({ alerts }: { alerts: DashboardData["alerts"] }) {
  const style = { critical: "border-critical bg-critical-soft", warning: "border-warn bg-warn-soft", info: "border-info bg-info-soft" };
  const label = { critical: "تنبيه حرج", warning: "تحذير", info: "للعلم" };
  return (
    <div className="space-y-2 border-b border-border px-4 py-3 sm:px-5" role="alert">
      {alerts.map((a) => {
        const Icon = a.severity === "info" ? InfoIcon : AlertIcon;
        return (
          <div key={a.id ?? a.rule} className={`rounded-xl border p-3 text-sm ${style[a.severity]}`}>
            <p className="flex items-center gap-2 font-bold">
              <Icon className="size-4" />
              {label[a.severity]}
              {a.simulated && <span className="text-xs font-normal text-muted">(محاكاة عطل، لا يُرسل إشعار)</span>}
            </p>
            <p className="mt-1 leading-6">{a.message}</p>
            <p className="mt-1 text-xs text-muted">
              القيمة {alertNumber(a.rule, a.value)} والحدّ {alertNumber(a.rule, a.threshold)} · من {ltr(String(a.sampleSize))} حالة · منذ {fmtClock(a.createdAt)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Alert numbers have different units per rule: M3 is a count, M5 is milliseconds, the rest are shares. */
function alertNumber(rule: string, v: number): string {
  if (rule.startsWith("M3_")) return ltr(String(v));
  if (rule.startsWith("M5_")) return fmtMs(v);
  return fmtPct(v);
}

/* --------------------------------------------------------------- numbers */

function Numbers({ data }: { data: DashboardData }) {
  const m = data.metrics;
  const o = data.outcomes;
  const runs = data.totals.runs;
  const cost = m.m7Cost;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="أرقام الفترة">
      <Tile code="runs" label="طلبات جُهّزت" value={ltr(String(runs))}>
        {runs > 0 && (
          <ul className="space-y-0.5">
            {(["box_found", "no_box", "needs_measurement", "error"] as const)
              .filter((s) => o[s] > 0)
              .map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${OUTCOME_DOT[s]}`} aria-hidden />
                  {OUTCOME_SHORT[s]}: <span className="ltr-nums">{o[s]}</span>
                </li>
              ))}
          </ul>
        )}
      </Tile>
      <Tile code="M5" label="95% من الطلبات تنتهي خلال" value={fmtMs(m.m5Latency.cached.value.p95 ?? m.m5Latency.uncached.value.p95)}>
        <p>نصف الطلبات خلال {fmtMs(m.m5Latency.cached.value.p50 ?? m.m5Latency.uncached.value.p50)}</p>
        {m.m5Latency.uncached.n > 0 && m.m5Latency.cached.n > 0 && <p>مع منتج جديد: {fmtMs(m.m5Latency.uncached.value.p95)}</p>}
      </Tile>
      <Tile code="M7-cache" label="منتجات كانت معروفة مسبقاً" value={fmtPct(cost.cacheHitRate)}>
        <p>
          {ltr(String(cost.hits))} من {fmtCount(cost.hits + cost.misses, PRODUCTS)} لم تحتج قراءة جديدة، لذلك يكون التجهيز أسرع وبلا تكلفة.
        </p>
      </Tile>
      <Tile code="M7" label="تكلفة الذكاء الاصطناعي للطلب" value={fmtAiSar(cost.value)}>
        <p>لكل 1000 طلب: {fmtAiSar(cost.value === null ? null : cost.value * 1000)}</p>
        <p>إجمالي الفترة: {fmtAiSar(cost.totalUsd)}</p>
      </Tile>
    </section>
  );
}

const OUTCOME_SHORT = { box_found: "كرتون واحد", no_box: "لا يتّسع له كرتون واحد", needs_measurement: "يحتاج قياساً", error: "تعذّر التجهيز" } as const;
const OUTCOME_DOT = { box_found: "bg-ok", no_box: "bg-warn", needs_measurement: "bg-info", error: "bg-critical" } as const;

function Tile({ code, label, value, children }: { code: string; label: string; value: string; children?: React.ReactNode }) {
  return (
    <div data-metric={code} className="panel flex flex-col p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="ltr-nums mt-1 whitespace-nowrap font-display text-2xl font-bold leading-tight">{value}</p>
      {children && <div className="mt-2 space-y-0.5 text-xs leading-5 text-muted">{children}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- charts */

function Card({ code, title, hint, children, className = "" }: { code?: string; title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section data-metric={code} className={`panel p-4 sm:p-5 ${className}`}>
      <h2 className="text-lg font-bold leading-7">{title}</h2>
      {hint && <p className="mb-4 mt-0.5 text-sm leading-6 text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function Empty({ children = "لا توجد بيانات في هذه الفترة. جرّب فترة أطول." }: { children?: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

function LatencyCard({ data }: { data: DashboardData }) {
  const points = data.latency.slice(-40).map((p, i) => ({ i, ms: p.totalMs, cached: p.cached, order: p.orderId, at: p.at }));
  const max = Math.max(0, ...points.map((p) => p.ms));
  const limit = data.targets.cachedP95Ms;
  const showLimit = max >= limit * 0.5; // a far-away limit line would flatten every bar
  const top = Math.max(max, showLimit ? limit : 0);
  const unit = top >= 1000 ? "بالثواني" : "بالملّي ثانية (جزء من ألف من الثانية)";
  return (
    <Card code="M5" title="مدة تجهيز آخر الطلبات" hint="كل عمود طلب واحد، والأحدث على اليسار. الطلب الذي فيه منتج جديد أبطأ لأن رصّة تقرأ صفحته أول مرة." className="lg:col-span-2">
      {points.length === 0 ? (
        <Empty />
      ) : (
        <>
          <p className="mb-1 text-xs text-muted">المدة {unit}</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap={2}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="i" reversed hide />
                <YAxis orientation="right" {...AXIS} width={40} tickFormatter={(v: number) => (top >= 1000 ? (v / 1000).toFixed(1) : String(Math.round(v)))} domain={[0, showLimit ? top * 1.1 : "auto"]} />
                <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={<LatencyTip />} />
                {showLimit && <ReferenceLine y={limit} stroke="var(--critical)" strokeDasharray="4 4" />}
                <Bar dataKey="ms" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false}>
                  {points.map((p) => (
                    <Cell key={p.i} fill={p.cached ? "var(--series-1)" : "var(--series-2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[var(--series-1)]" aria-hidden />
              كل منتجاته معروفة مسبقاً
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[var(--series-2)]" aria-hidden />
              فيه منتج جديد احتاج قراءة
            </span>
            {showLimit && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-critical" aria-hidden />
                الحدّ: {fmtMs(limit)}
              </span>
            )}
            <span className="ms-auto">الأبطأ: {fmtMs(max)}</span>
          </p>
        </>
      )}
    </Card>
  );
}

function LatencyTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { ms: number; cached: boolean; order: string; at: string } }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-bold">
        الطلب <span className="ltr-nums">#{p.order}</span>
      </p>
      <p>
        {fmtMs(p.ms)} · {p.cached ? "منتجاته معروفة" : "فيه منتج جديد"}
      </p>
      <p className="text-muted">{fmtClock(p.at)}</p>
    </div>
  );
}

/** One horizontal bar split into shares; the legend under it carries the exact numbers. */
function StackBar({ parts, label }: { parts: Array<{ key: string; value: number; color: string }>; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-border/50" role="img" aria-label={label}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <span key={p.key} className={p.color} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
    </div>
  );
}

function Legend({ rows }: { rows: Array<{ key: string; label: string; value: number; color: string; note?: string }> }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2">
          <span className={`size-2.5 translate-y-0.5 rounded-sm ${r.color}`} aria-hidden />
          <span>
            {r.label}
            {r.note && <span className="block text-xs leading-5 text-muted">{r.note}</span>}
          </span>
          <span className="ltr-nums whitespace-nowrap text-muted">
            <b className="font-bold text-foreground">{r.value}</b> · {total ? `${Math.round((r.value / total) * 100)}%` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OutcomesCard({ data }: { data: DashboardData }) {
  const o = data.outcomes;
  const rows = (["box_found", "no_box", "needs_measurement", "error"] as const).map((s) => ({
    key: s,
    label: OUTCOME_SHORT[s],
    value: o[s],
    color: OUTCOME_DOT[s],
    note: OUTCOME_NOTE[s],
  }));
  const skips = Object.entries(data.metrics.m4NoBoxRate.skipReasons).sort((a, b) => b[1] - a[1]);
  return (
    <Card code="M4" title="نتيجة تجهيز الطلبات" hint="ماذا حدث لكل طلب جُهّز في هذه الفترة.">
      {data.totals.runs === 0 ? (
        <Empty />
      ) : (
        <>
          <StackBar label="توزيع نتائج التجهيز" parts={rows.map((r) => ({ key: r.key, value: r.value, color: r.color }))} />
          <Legend rows={rows} />
        </>
      )}
      {data.problemOrders.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-sm font-medium">طلبات تحتاج متابعة (آخر نتيجة لها)</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.problemOrders.map((p) => (
              <li key={p.orderId}>
                <Link href={`/orders/${p.orderId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs hover:border-brand">
                  <span className="ltr-nums font-bold">#{p.orderId}</span>
                  <span className="text-muted">{OUTCOME_SHORT[p.status as keyof typeof OUTCOME_SHORT] ?? STATUS_LABEL[p.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {skips.length > 0 && (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer">لماذا لم يتّسع كرتون واحد؟</summary>
          <p className="mt-1">لكل طلب قُسّم، كم مرة استُبعد كرتون ولأي سبب:</p>
          <ul className="mt-1 space-y-0.5">
            {skips.map(([k, v]) => (
              <li key={k}>
                {OUTCOME_LABEL[k] ?? k}: <span className="ltr-nums">{v}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

const OUTCOME_NOTE = {
  box_found: "اختارت رصّة الكرتون الأوفر الذي يتّسع للطلب",
  no_box: "الطلب أكبر أو أثقل من أي كرتون، فتقترح رصّة تقسيمه على أكثر من كرتون",
  needs_measurement: "منتج بلا مقاس معروف، ينتظر أن يقيسه الموظف",
  error: "رقم طلب غير موجود أو خطأ في النظام",
} as const;

const SOURCE_COLOR = { page: "bg-ok", inferred: "bg-warn", manual: "bg-info", unknown: "bg-critical" } as const;

function SourcesCard({ data }: { data: DashboardData }) {
  const mix = data.metrics.m2SourceMix;
  const rows = (["page", "inferred", "manual", "unknown"] as const).map((k) => ({
    key: k,
    label: SOURCE_LABEL[k],
    value: mix.value[k],
    color: SOURCE_COLOR[k],
    note: SOURCE_HINT[k],
  }));
  return (
    <Card code="M2" title="من أين جاءت مقاسات القطع" hint="كل قطعة في الطلبات المجهّزة، حسب مصدر مقاسها. كلما زادت «من الصفحة» و«قياس يدوي» كان الاختيار أدق.">
      {mix.n === 0 ? (
        <Empty />
      ) : (
        <>
          <StackBar label="توزيع مصادر المقاسات" parts={rows.map((r) => ({ key: r.key, value: r.value, color: r.color }))} />
          <Legend rows={rows} />
        </>
      )}
    </Card>
  );
}

function ReadsCard({ data }: { data: DashboardData }) {
  const m6 = data.metrics.m6GeminiFailureRate;
  const ok = m6.byStatus.ok ?? 0;
  const failures = Object.entries(m6.byStatus)
    .filter(([s]) => s !== "ok")
    .sort((a, b) => b[1] - a[1]);
  return (
    <Card code="M6" title="قراءة صفحات المنتجات الجديدة" hint="عندما يصل منتج لم تره رصّة من قبل، تقرأ صفحته بالذكاء الاصطناعي لتعرف مقاسه ووزنه.">
      {m6.n === 0 ? (
        <Empty>لم تحتج رصّة إلى قراءة أي صفحة في هذه الفترة، فكل المنتجات كانت معروفة.</Empty>
      ) : (
        <>
          <StackBar
            label="نجاح القراءات"
            parts={[
              { key: "ok", value: ok, color: "bg-ok" },
              { key: "failed", value: m6.n - ok, color: "bg-critical" },
            ]}
          />
          <Legend
            rows={[
              { key: "ok", label: "نجحت", value: ok, color: "bg-ok" },
              ...failures.map(([s, v]) => ({
                key: s,
                label: `فشلت: ${EXTRACTION_STATUS_LABEL[s] ?? s}`,
                value: v,
                color: "bg-critical",
                note: FAILURE_NOTE[s],
              })),
            ]}
          />
          {failures.length > 0 && <p className="mt-3 text-xs leading-5 text-muted">المنتج الذي فشلت قراءته يظهر للموظف «يحتاج قياس» حتى يقيسه أو تنجح القراءة لاحقاً.</p>}
        </>
      )}
    </Card>
  );
}

const FAILURE_NOTE: Record<string, string> = {
  simulated_outage: "عطل تجريبي متعمَّد لاختبار التنبيهات",
  config_error: "مفتاح خدمة الذكاء الاصطناعي غير صحيح أو غير موجود",
  rate_limited: "تجاوزنا عدد الطلبات المسموح في الدقيقة",
  timeout: "لم ترد الخدمة في الوقت المحدد",
  api_error: "خطأ مؤقت من الخدمة",
  parse_error: "ردّت الخدمة بنص لا يمكن فهمه",
  blocked: "رفضت الخدمة محتوى الصفحة",
  empty: "ردّت الخدمة بلا محتوى",
};

/* ------------------------------------------------------------ recent runs */

type RunFilter = "all" | "problems" | "new";
const RUN_FILTERS: Array<[RunFilter, string]> = [
  ["all", "الكل"],
  ["problems", "فيها مشكلة"],
  ["new", "فيها منتج جديد"],
];

function RecentRuns({ runs, openId, trace, onToggle }: { runs: OrderRun[]; openId: string | null; trace: Trace | null; onToggle: (id: string) => void }) {
  const [filter, setFilter] = useState<RunFilter>("all");
  const shown = runs.filter((r) => filter === "all" || (filter === "problems" ? r.status !== "box_found" : r.cacheMisses > 0));
  const details = (r: OrderRun) => (openId === r.id ? trace ? <TraceView trace={trace} /> : <p className="text-sm text-muted">جارٍ تحميل التفاصيل…</p> : null);

  return (
    <Card title="آخر الطلبات المجهّزة" hint="آخر 25 تجهيزاً. اضغط «التفاصيل» لترى المنتجات التي قرأتها رصّة، وتجربة كل كرتون، وتصحيحات الموظف.">
      <div className="mb-3 flex flex-wrap gap-2 text-sm" role="group" aria-label="تصفية الطلبات">
        {RUN_FILTERS.map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full border px-3 py-1 ${filter === f ? "border-brand bg-brand/10 font-bold text-brand" : "border-border text-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={runs.length === 0 ? "لا توجد طلبات مجهّزة في هذه الفترة" : "لا توجد طلبات بهذا الوصف"}>
          {runs.length === 0 ? "جهّز طلباً من صفحة «الطلبات» وسيظهر هنا." : "جرّب تصفية أخرى."}
        </EmptyState>
      ) : (
        <>
          {/* Phones: one card per run. */}
          <ul className="space-y-2 md:hidden">
            {shown.map((r) => (
              <li key={r.id} className={`rounded-xl border p-3 text-sm ${openId === r.id ? "border-brand" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <Link href={`/orders/${r.orderId}`} className="ltr-nums font-bold hover:text-brand">
                    #{r.orderId}
                  </Link>
                  <StatusPill status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
                  <span className="ms-auto text-xs text-muted" title={fmtTime(r.createdAt)}>
                    {fmtClock(r.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {r.cartonId ? `كرتون ${r.cartonId} · ` : ""}
                  {fmtMs(r.totalMs)} · {productsText(r)} · {EMPLOYEE_ACTION[r.employeeAction]}
                </p>
                <DetailsButton open={openId === r.id} onClick={() => onToggle(r.id)} id={r.id} />
                {openId === r.id && (
                  <div id={`run-${r.id}`} className="mt-3 border-t border-border pt-3">
                    {details(r)}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Wider screens: a table, details open under the row. */}
          <table className="hidden w-full text-sm md:table [&_td]:px-2 [&_td]:py-2.5 [&_th]:px-2 [&_th]:py-2">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="text-start font-medium">الوقت</th>
                <th className="text-start font-medium">الطلب</th>
                <th className="text-start font-medium">النتيجة</th>
                <th className="text-start font-medium">الكرتون</th>
                <th className="text-start font-medium">المدة</th>
                <th className="text-start font-medium">المنتجات</th>
                <th className="text-start font-medium">الموظف</th>
                <th className="text-start font-medium">
                  <span className="sr-only">التفاصيل</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Fragment key={r.id}>
                  <tr className={`border-b border-border ${openId === r.id ? "bg-brand/5" : ""}`}>
                    <td className="whitespace-nowrap text-xs text-muted" title={fmtTime(r.createdAt)}>
                      {fmtClock(r.createdAt)}
                    </td>
                    <td>
                      <Link href={`/orders/${r.orderId}`} className="ltr-nums font-bold hover:text-brand">
                        #{r.orderId}
                      </Link>
                    </td>
                    <td>
                      <StatusPill status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
                    </td>
                    <td>{r.cartonId ?? "—"}</td>
                    <td className="whitespace-nowrap">{fmtMs(r.totalMs)}</td>
                    <td className="text-xs">{productsText(r)}</td>
                    <td className="text-xs text-muted">{EMPLOYEE_ACTION[r.employeeAction]}</td>
                    <td className="text-end">
                      <DetailsButton open={openId === r.id} onClick={() => onToggle(r.id)} id={r.id} />
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr className="border-b border-border bg-brand/5">
                      <td colSpan={8} id={`run-${r.id}`} className="!px-4 !pb-4">
                        {details(r)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

function productsText(r: OrderRun): string {
  const parts = [r.cacheHits > 0 ? `${ltr(String(r.cacheHits))} معروفة` : null, r.cacheMisses > 0 ? `${ltr(String(r.cacheMisses))} جديدة` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function DetailsButton({ open, onClick, id }: { open: boolean; onClick: () => void; id: string }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      aria-controls={`run-${id}`}
      className="mt-2 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:border-brand hover:text-brand md:mt-0"
    >
      {open ? "إخفاء التفاصيل" : "التفاصيل"}
    </button>
  );
}

function TraceView({ trace }: { trace: Trace }) {
  const r = trace.run;
  const name = (id: string) => trace.names?.[id] ?? id;
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kv k="النتيجة" v={STATUS_LABEL[r.status] ?? r.status} />
        <Kv k="الكرتون" v={r.cartonId ?? "—"} />
        <Kv k="المدة الكلية" v={fmtMs(r.totalMs)} />
        <Kv k="منها قراءة المنتجات" v={r.extractMs > 0 ? fmtMs(r.extractMs) : "لم تحتج"} />
        <Kv k="تكلفة الذكاء الاصطناعي" v={fmtAiSar(r.costUsd)} />
      </dl>

      {r.attempts.length > 0 && (
        <div>
          <h3 className="text-sm font-bold">تجربة كل كرتون</h3>
          <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {r.attempts.map((a) => (
              <li key={a.cartonId} className={`rounded border px-2 py-0.5 ${a.cartonId === r.cartonId ? "border-ok bg-ok-soft text-ok" : a.outcome === "packed" ? "border-ok/50" : "border-border text-muted"}`}>
                <b>{a.cartonId}</b>: {OUTCOME_LABEL[a.outcome] ?? a.outcome}
                {a.cartonId === r.cartonId && <b> · المختار</b>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold">المنتجات التي قرأتها رصّة في هذا التجهيز</h3>
        {trace.extractions.length === 0 ? (
          <p className="mt-1 text-xs text-muted">لا شيء: كل منتجات الطلب كانت معروفة مسبقاً.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs">
            {trace.extractions.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2 rounded border border-border px-2 py-1.5">
                <span className="font-medium">{name(e.productId)}</span>
                <span className={e.status === "ok" ? "text-ok" : "text-critical"}>{e.status === "ok" ? "نجحت" : `فشلت: ${EXTRACTION_STATUS_LABEL[e.status] ?? e.status}`}</span>
                <span className="text-muted">{fmtMs(e.latencyMs)}</span>
                {e.dimsSource && <span className="text-muted">المقاس: {SOURCE_LABEL[e.dimsSource]}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {trace.corrections.length > 0 && (
        <div>
          <h3 className="text-sm font-bold">تصحيحات الموظف</h3>
          <ul className="mt-1 space-y-0.5 text-xs">
            {trace.corrections.map((c) => (
              <li key={c.id}>
                {name(c.productId)} · {FIELD_LABEL[c.field] ?? c.field}: من {ltr(String(c.oldValue ?? "—"))} إلى {ltr(String(c.newValue ?? "—"))}{" "}
                <span className="text-muted">({ORIGIN_LABEL[c.priorOrigin] ?? "لم تكن له بيانات"})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted">تفاصيل تقنية (للفريق التقني)</summary>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kv k="رقم المرجع" v={r.id ?? "—"} />
          <Kv k="طريقة الترتيب المعتمدة" v={r.strategy ?? "—"} />
          <Kv k="ترتيبات جُرّبت" v={String(r.candidatesChecked)} />
          <Kv k="ترتيبات رفضها المدقّق" v={String(r.validatorRejections)} />
          <Kv k="زمن البحث عن ترتيب" v={fmtMs(r.packMs)} />
          <Kv k="وحدات النص المستهلكة" v={String(r.tokensTotal)} />
          <Kv k="إصدار المحرك" v={r.engineVersion} />
          <Kv k="إصدار تعليمات القراءة" v={r.promptVersion} />
        </dl>
        {trace.extractions.some((e) => e.errorCode || e.errorMessage) && (
          <ul className="mt-2 space-y-0.5 text-muted" dir="ltr">
            {trace.extractions
              .filter((e) => e.errorCode || e.errorMessage)
              .map((e) => (
                <li key={e.id}>
                  {e.productId}: {e.errorCode} {e.errorMessage}
                </li>
              ))}
          </ul>
        )}
      </details>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="break-all font-medium">{v}</dd>
    </div>
  );
}
