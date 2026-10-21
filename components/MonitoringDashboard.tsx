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
const EMPLOYEE_ACTION: Record<string, string> = { pending: "لم يراجع بعد", confirmed: "أكّد التغليف", edited: "صحّح البيانات" };
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
  // data null = the trace could not be loaded (unknown run or network error).
  const [trace, setTrace] = useState<{ id: string; data: Trace | null } | null>(null);

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
        if (!cancelled) setTrace({ id: traceId, data: j as Trace | null });
      })
      .catch(() => {
        if (!cancelled) setTrace({ id: traceId, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  if (!data) {
    return error ? <Notice tone="critical">تعذّر تحميل أرقام الأداء. {fmtApiError(error)}</Notice> : <DashboardSkeleton />;
  }

  // Only the selected run's trace is shown; undefined while it is still loading.
  const shownTrace = trace && trace.id === traceId ? trace.data : undefined;
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:ms-auto" aria-live="polite">
          <span>
            {fmtCount(data.totals.runs, ORDERS)} · {fmtCount(data.totals.extractions, { one: "قراءة منتج واحدة", two: "قراءتان للمنتجات", few: "قراءات للمنتجات", many: "قراءة للمنتجات" })} ·{" "}
            {fmtCount(data.totals.corrections, { one: "تصحيح واحد", two: "تصحيحان", few: "تصحيحات", many: "تصحيحاً" })}
          </span>
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
        </div>
      </div>

      {error && <Notice tone="warn">تعذّر تحديث الأرقام ({fmtApiError(error)}). المعروض هو آخر تحديث ناجح.</Notice>}

      <Health data={data} />
      <Numbers data={data} />

      <section className="grid gap-4 lg:grid-cols-2">
        <LatencyCard data={data} />
        <CorrectionsCard data={data} />
        <SourcesCard data={data} />
        <FailuresCard data={data} />
        <OutcomesCard data={data} />
        <div className="grid content-start gap-4">
          <ValidatorCard data={data} />
          <CacheCard data={data} />
        </div>
      </section>

      {traceId && !data.recentRuns.some((r) => r.id === traceId) && (
        <section className="rounded-xl border-2 border-brand bg-surface p-4 sm:p-5" aria-label="تفاصيل الطلب">
          <TraceSlot trace={shownTrace} />
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
  const t = data.targets;
  const m1 = m.m1CorrectionRate;
  const m6 = m.m6GeminiFailureRate;
  const cached = m.m5Latency.cached;
  const uncached = m.m5Latency.uncached;
  const cost = m.m7Cost;
  const failed = m6.n - (m6.byStatus.ok ?? 0);
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="الأرقام الرئيسية">
      <Tile
        code="M1"
        title="منتجات صحّح الموظف بياناتها"
        value={fmtPct(m1.value)}
        n={m1.n}
        minN={m1.minN}
        sufficient={m1.sufficient}
        over={m1.sufficient && (m1.value ?? 0) > t.correctionRate}
        limit={`الحدّ المسموح ${fmtPct(t.correctionRate)}`}
        detail={m1.reviewed > 0 ? `صحّح الموظف ${ltr(String(m1.corrected))} من ${fmtCount(m1.reviewed, PRODUCTS)} راجعها` : "لم يراجع الموظف أي منتج قرأته رصّة بعد"}
        hint="من المنتجات التي قرأتها رصّة وراجعها الموظف، كم منها احتاج إلى تصحيح؟ كلما قلّت النسبة كانت القراءة أدق."
      />
      <Tile
        code="M6"
        title="قراءات المنتجات التي فشلت"
        value={fmtPct(m6.value)}
        n={m6.n}
        minN={m6.minN}
        sufficient={m6.sufficient}
        over={m6.sufficient && (m6.value ?? 0) > t.failureRate}
        limit={`الحدّ المسموح ${fmtPct(t.failureRate)}`}
        detail={m6.n > 0 ? `فشلت ${ltr(String(failed))} من ${fmtCount(m6.n, READS)}` : "لم تحتج رصّة إلى قراءة أي منتج جديد"}
        hint="إذا ارتفعت النسبة فقد تتعطل قراءة المنتجات الجديدة، وسيلزم قياسها يدوياً. الأسباب في بطاقة «أسباب فشل قراءة المنتجات»."
      />
      <Tile
        code="M5"
        title="سرعة تجهيز الطلب"
        value={
          <span className="grid grid-cols-2 gap-3">
            <SpeedValue label="منتجاته معروفة" ms={cached.value.p95} n={cached.n} over={cached.sufficient && (cached.value.p95 ?? 0) > t.cachedP95Ms} />
            <SpeedValue label="فيه منتج جديد" ms={uncached.value.p95} n={uncached.n} over={uncached.sufficient && (uncached.value.p95 ?? 0) > t.uncachedP95Ms} />
          </span>
        }
        n={cached.n + uncached.n}
        minN={cached.minN}
        sufficient={cached.sufficient || uncached.sufficient}
        limit={`الحدّ المسموح ${fmtMs(t.cachedP95Ms)} للمعروفة، و${fmtMs(t.uncachedP95Ms)} مع منتج جديد`}
        detail={`نصف الطلبات تنتهي خلال ${fmtMs(cached.value.p50 ?? uncached.value.p50)}`}
        hint="95% من الطلبات تنتهي خلال هذا الزمن أو أقل. الطلب الذي فيه منتج جديد أبطأ لأن رصّة تقرأ صفحته أول مرة."
      />
      <Tile
        code="M7"
        title="تكلفة الذكاء الاصطناعي للطلب"
        value={fmtAiSar(cost.value)}
        n={cost.n}
        minN={cost.minN}
        sufficient={cost.sufficient}
        detail={`لكل 1000 طلب: ${fmtAiSar(cost.value === null ? null : cost.value * 1000)} · إجمالي الفترة: ${fmtAiSar(cost.totalUsd)}`}
        hint="متوسط ما يكلّفه الذكاء الاصطناعي لكل طلب. ترتفع كلما زادت المنتجات الجديدة التي تحتاج قراءة، والمنتجات المعروفة مسبقاً بلا تكلفة."
      />
    </section>
  );
}

function SpeedValue({ label, ms, n, over }: { label: string; ms: number | null; n: number; over: boolean }) {
  return (
    <span className="block">
      <span className="block font-sans text-xs font-normal text-muted">{label}</span>
      <span className={`block whitespace-nowrap text-xl ${over ? "text-critical" : ""}`}>{n > 0 ? fmtMs(ms) : "—"}</span>
    </span>
  );
}

function Tile(props: {
  code: string;
  title: string;
  value: React.ReactNode;
  n: number;
  minN: number;
  sufficient: boolean;
  over?: boolean;
  limit?: string;
  detail?: string;
  hint: string;
}) {
  return (
    <div data-metric={props.code} className={`panel flex flex-col p-4 ${props.over ? "border-critical" : ""}`}>
      <p className="flex items-start gap-2 text-sm font-medium leading-6">
        {props.title}
        {props.over && (
          <span className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-critical-soft px-2 py-0.5 text-xs font-bold text-critical">
            <AlertIcon className="size-3.5" />
            فوق الحدّ
          </span>
        )}
      </p>
      <div className={`ltr-nums mt-2 text-[1.65rem] font-bold leading-tight ${typeof props.value === "string" && /^[\d.%\s\u2066-\u2069—]+$/.test(props.value) ? "font-display" : ""} ${props.over ? "text-critical" : ""}`}>
        {props.value}
      </div>
      {props.detail && <p className="mt-1.5 text-xs leading-5 text-muted">{props.detail}</p>}
      <p className="mt-1 flex flex-wrap gap-x-2 text-xs leading-5 text-muted">
        {props.limit && <span>{props.limit}</span>}
        <Sample n={props.n} minN={props.minN} sufficient={props.sufficient} />
      </p>
      <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted">{props.hint}</p>
    </div>
  );
}

/** How many cases a number rests on; below the minimum the value stays visible but is marked as not reliable yet. */
function Sample({ n, minN, sufficient = true }: { n: number; minN?: number; sufficient?: boolean }) {
  if (!sufficient && minN) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-border/50 px-2 font-medium">
        <InfoIcon className="size-3" />
        الحالات قليلة: <span className="ltr-nums">{n}</span> من <span className="ltr-nums">{minN}</span> المطلوبة، فلا يُعتمد على الرقم بعد
      </span>
    );
  }
  return (
    <span title="عدد الحالات التي بُني عليها هذا الرقم. كلما قلّ العدد قلّ الاعتماد على الرقم.">
      عدد الحالات: <span className="ltr-nums">{n}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- charts */

function Card(props: { code?: string; title: string; hint?: string; n?: number; children: React.ReactNode; className?: string }) {
  return (
    <section data-metric={props.code} className={`panel p-4 sm:p-5 ${props.className ?? ""}`}>
      <h2 className="text-lg font-bold leading-7">
        {props.title}{" "}
        {props.n !== undefined && (
          <span className="text-xs font-normal text-muted">
            · <Sample n={props.n} />
          </span>
        )}
      </h2>
      {props.hint && <p className="mb-4 mt-1 text-sm leading-6 text-muted">{props.hint}</p>}
      {props.children}
    </section>
  );
}

function Empty({ children = "لا توجد بيانات في هذه الفترة. جرّب فترة أطول، أو جهّز طلباً من صفحة «الطلبات»." }: { children?: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

/** The same numbers as a plain table, for screen readers and exact values. */
function TableView({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted">عرض البيانات في جدول</summary>
      <table className="mt-2 w-full tabular-nums [&_td]:py-1 [&_td]:pe-2">
        <thead>
          <tr className="text-muted">
            {head.map((h) => (
              <th key={h} className="text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className="ltr-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

const share = (v: number, total: number) => (total ? `${Math.round((v / total) * 100)}%` : "—");

/**
 * One series, one color for every bar, as before; label on the start side, count and share at the end.
 * Plain HTML so Arabic labels never get cut and the bars grow from the right like the text.
 */
function HBar({ rows, total }: { rows: Array<{ key: string; label: string; value: number; note?: string }>; total?: number }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);
  if (max === 0) return <Empty />;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(6.5rem,9rem)_1fr_4.5rem] items-center gap-x-3 text-sm">
          <span className="leading-5">{r.label}</span>
          <span className="h-5 rounded bg-border/30" aria-hidden>
            <span className="block h-full rounded bg-[var(--series-1)]" style={{ width: r.value ? `max(4px, ${(r.value / max) * 100}%)` : 0 }} />
          </span>
          <span className="ltr-nums whitespace-nowrap text-end text-xs text-muted">
            <b className="text-sm text-foreground">{r.value}</b> · {share(r.value, sum)}
          </span>
          {r.note && <span className="col-span-3 mt-0.5 text-xs leading-5 text-muted sm:col-start-2 sm:col-end-4">{r.note}</span>}
        </li>
      ))}
    </ul>
  );
}

function LatencyCard({ data }: { data: DashboardData }) {
  const points = data.latency.slice(-40).map((p, i) => ({ i, ms: p.totalMs, cached: p.cached, order: p.orderId, at: p.at }));
  const max = Math.max(0, ...points.map((p) => p.ms));
  const limit = data.targets.cachedP95Ms;
  const showLimit = max >= limit * 0.5; // a far-away limit line would flatten every bar
  const top = Math.max(max, showLimit ? limit : 0);
  const unit = top >= 1000 ? "بالثواني" : "بالملّي ثانية (جزء من ألف من الثانية)";
  return (
    <Card
      code="M5"
      title="زمن تجهيز كل طلب"
      hint="كل عمود طلب واحد، والأحدث على اليسار. الطلب الأبطأ غالباً فيه منتجات جديدة احتاجت قراءة. مرّر المؤشر على العمود لترى رقم الطلب ووقته."
      n={points.length}
    >
      {points.length === 0 ? (
        <Empty />
      ) : (
        <>
          <p className="mb-1 text-xs text-muted">المدة {unit}</p>
          <div className="h-60">
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
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[var(--series-1)]" aria-hidden />
              منتجاته معروفة مسبقاً
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[var(--series-2)]" aria-hidden />
              فيه منتجات جديدة
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
      <TableView
        head={["الوقت", "رقم الطلب", "منتجاته", "مدة التجهيز"]}
        rows={[...points].reverse().map((p) => [fmtClock(p.at), `#${p.order}`, p.cached ? "معروفة مسبقاً" : "فيه منتجات جديدة", fmtMs(p.ms)])}
      />
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
        {fmtMs(p.ms)} · {p.cached ? "منتجاته معروفة مسبقاً" : "فيه منتجات جديدة"}
      </p>
      <p className="text-muted">الساعة {fmtClock(p.at)}</p>
    </div>
  );
}

function CorrectionsCard({ data }: { data: DashboardData }) {
  const m1 = data.metrics.m1CorrectionRate;
  const points = data.reviews.slice(-40).map((p, i) => ({ i, ok: p.reviewed - p.corrected, fixed: p.corrected, order: p.orderId, at: p.at, fields: p.fields }));
  const fields = Object.entries(m1.byField).sort((a, b) => b[1] - a[1]);
  return (
    <Card
      code="M1"
      title="منتجات صحّح الموظف بياناتها"
      hint="كل عمود طلب راجعه الموظف، والأحدث على اليسار. طول العمود عدد المنتجات التي قرأتها رصّة في الطلب، والجزء الملوّن بالثاني ما صحّح الموظف مقاسه أو وزنه أو صفته. مرّر المؤشر على العمود لترى ما تغيّر."
      n={points.length}
    >
      {points.length === 0 ? (
        <Empty />
      ) : (
        <>
          <p className="mb-1 text-xs text-muted">عدد المنتجات في الطلب</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap={2}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="i" reversed hide />
                <YAxis orientation="right" {...AXIS} width={40} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={<CorrectionTip />} />
                <Bar dataKey="ok" stackId="m1" fill="var(--series-1)" maxBarSize={18} isAnimationActive={false}>
                  {points.map((p) => (
                    <Cell key={p.i} radius={p.fixed ? 0 : 3} />
                  ))}
                </Bar>
                <Bar dataKey="fixed" stackId="m1" fill="var(--series-2)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[var(--series-1)]" aria-hidden />
              قرأتها رصّة صحيحة
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[var(--series-2)]" aria-hidden />
              صحّحها الموظف
            </span>
            <span className="ms-auto">
              النسبة {fmtPct(m1.value)} · الحدّ {fmtPct(data.targets.correctionRate)}
            </span>
          </p>
          {fields.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              أكثر ما صُحّح: {fields.map(([f, n]) => `${FIELD_LABEL[f] ?? f} (${n})`).join(" · ")}
            </p>
          )}
        </>
      )}
      <TableView
        head={["الوقت", "رقم الطلب", "منتجات قرأتها رصّة", "صحّحها الموظف", "ما تغيّر"]}
        rows={[...points].reverse().map((p) => [fmtClock(p.at), `#${p.order}`, String(p.ok + p.fixed), String(p.fixed), p.fields.map((f) => FIELD_LABEL[f] ?? f).join("، ") || "—"])}
      />
    </Card>
  );
}

function CorrectionTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { ok: number; fixed: number; order: string; at: string; fields: string[] } }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div dir="rtl" className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-bold">
        الطلب <span className="ltr-nums">#{p.order}</span>
      </p>
      <p>
        {p.fixed === 0 ? `${fmtCount(p.ok + p.fixed, PRODUCTS)}، لم يُصحَّح شيء` : `صحّح الموظف ${ltr(String(p.fixed))} من ${fmtCount(p.ok + p.fixed, PRODUCTS)}`}
      </p>
      {p.fields.length > 0 && <p>{p.fields.map((f) => FIELD_LABEL[f] ?? f).join("، ")}</p>}
      <p className="text-muted">الساعة {fmtClock(p.at)}</p>
    </div>
  );
}

function SourcesCard({ data }: { data: DashboardData }) {
  const mix = data.metrics.m2SourceMix;
  const over = mix.sufficient && (mix.unknownShare ?? 0) > data.targets.unknownShare;
  const rows = (["page", "inferred", "manual", "unknown"] as const).map((k) => ({ key: k, label: SOURCE_LABEL[k], value: mix.value[k], note: SOURCE_HINT[k] }));
  return (
    <Card
      code="M2"
      title="من أين جاءت مقاسات القطع"
      hint={`كل قطعة في الطلبات المجهّزة حسب مصدر مقاسها. نسبة «غير معروف» ${fmtPct(mix.unknownShare)} والحدّ المسموح ${fmtPct(data.targets.unknownShare)}. إذا زادت القطع التقديرية أو غير المعروفة فمعنى ذلك أن صفحات المتجر تنقصها المقاسات.`}
      n={mix.n}
    >
      {over && (
        <Notice tone="warn">
          قطع كثيرة بلا مقاس معروف.{" "}
          <Link href="/catalog" className="font-medium underline">
            افتح المنتجات
          </Link>{" "}
          وأدخل مقاساتها.
        </Notice>
      )}
      {mix.n === 0 ? <Empty /> : <HBar rows={rows} />}
      <TableView head={["المصدر", "عدد القطع", "النسبة"]} rows={rows.map((r) => [r.label, String(r.value), share(r.value, mix.n)])} />
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

function FailuresCard({ data }: { data: DashboardData }) {
  const m6 = data.metrics.m6GeminiFailureRate;
  const ok = m6.byStatus.ok ?? 0;
  const failed = m6.n - ok;
  const rows = Object.entries(m6.byStatus)
    .filter(([s]) => s !== "ok")
    .sort((a, b) => b[1] - a[1])
    .map(([s, v]) => ({ key: s, label: EXTRACTION_STATUS_LABEL[s] ?? s, value: v, note: FAILURE_NOTE[s] }));
  return (
    <Card
      code="M6"
      title="أسباب فشل قراءة المنتجات"
      hint="عندما يصل منتج لم تره رصّة من قبل، تقرأ صفحته بالذكاء الاصطناعي لتعرف مقاسه ووزنه. الأسباب مرتبة من الأكثر تكراراً."
      n={m6.n}
    >
      {m6.n === 0 ? (
        <Empty>لم تحتج رصّة إلى قراءة أي منتج في هذه الفترة، فكل المنتجات كانت معروفة مسبقاً.</Empty>
      ) : (
        <>
          <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              نجحت <b className="ltr-nums">{ok}</b>
            </span>
            <span className={failed ? "font-medium text-critical" : ""}>
              فشلت <b className="ltr-nums">{failed}</b>
            </span>
            <span className="text-muted">من أصل {fmtCount(m6.n, READS)} ({fmtPct(m6.value)} فشل)</span>
          </p>
          {rows.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm font-medium text-ok">
              <CheckIcon className="size-5" />
              لم تفشل أي قراءة في هذه الفترة
            </p>
          ) : (
            <>
              <HBar rows={rows} total={failed} />
              <p className="mt-4 text-xs leading-5 text-muted">
                المنتج الذي فشلت قراءته يظهر للموظف «يحتاج قياس» حتى يقيسه أو تنجح القراءة لاحقاً. تفاصيل كل فشل في «تفاصيل تقنية» داخل الطلب.
              </p>
            </>
          )}
        </>
      )}
      <TableView
        head={["الحالة", "العدد", "النسبة"]}
        rows={Object.entries(m6.byStatus).map(([s, v]) => [EXTRACTION_STATUS_LABEL[s] ?? s, String(v), share(v, m6.n)])}
      />
    </Card>
  );
}

const OUTCOME_SHORT = { box_found: "كرتون واحد", no_box: "بلا كرتون مناسب", needs_measurement: "يحتاج قياساً", error: "تعذّر التجهيز" } as const;
const OUTCOME_NOTE = {
  box_found: "اختارت رصّة الكرتون الأوفر الذي يتّسع للطلب",
  no_box: "الطلب أكبر أو أثقل من أي كرتون، فتقترح رصّة تقسيمه على أكثر من كرتون",
  needs_measurement: "منتج بلا مقاس معروف، ينتظر أن يقيسه الموظف",
  error: "رقم طلب غير موجود أو خطأ في النظام",
} as const;
const SKIP_NOTE: Record<string, string> = {
  oversize: "قطعة أطول أو أعرض من الكرتون",
  overweight: "مجموع الوزن أكبر مما يتحمله الكرتون",
  search_budget: "لم يكتمل البحث في الوقت المسموح",
  no_layout: "القطع لا تتسع معاً مهما رُتّبت",
  validator_rejected: "وُجد ترتيب لكن المدقّق رفضه",
};

function OutcomesCard({ data }: { data: DashboardData }) {
  const m4 = data.metrics.m4NoBoxRate;
  const o = data.outcomes;
  const over = m4.sufficient && (m4.value ?? 0) > data.targets.noBoxRate;
  const rows = (["box_found", "no_box", "needs_measurement", "error"] as const).map((s) => ({ key: s, label: OUTCOME_SHORT[s], value: o[s], note: OUTCOME_NOTE[s] }));
  const skips = Object.entries(m4.skipReasons)
    .filter(([k]) => k !== "not_needed")
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: OUTCOME_LABEL[k] ?? k, value: v, note: SKIP_NOTE[k] }));
  return (
    <Card
      code="M4"
      title="نتيجة تجهيز الطلبات"
      hint="ماذا حدث لكل طلب جُهّز في هذه الفترة. إذا ارتفعت نسبة «بلا كرتون مناسب» فالكراتين المتوفرة لا تناسب منتجاتك، أو هامش الأمان كبير أكثر من اللازم."
      n={data.totals.runs}
    >
      <div className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className={`ltr-nums font-display text-3xl font-bold ${over ? "text-critical" : ""}`}>{fmtPct(m4.value)}</p>
        <p className="pb-1 text-sm text-muted">
          طلبات بلا كرتون مناسب · الحدّ المسموح {fmtPct(data.targets.noBoxRate)} · <Sample n={m4.n} minN={m4.minN} sufficient={m4.sufficient} />
        </p>
      </div>
      {data.totals.runs === 0 ? <Empty /> : <HBar rows={rows} />}

      {data.problemOrders.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-bold">طلبات تحتاج متابعة</h3>
          <p className="mt-0.5 text-xs text-muted">آخر تجهيز لها لم ينتهِ بكرتون واحد. اضغط الطلب لفتحه.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.problemOrders.map((p) => (
              <li key={p.orderId}>
                <Link href={`/orders/${p.orderId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs hover:border-brand">
                  <span className="ltr-nums font-bold">#{p.orderId}</span>
                  <span className="text-muted">{OUTCOME_SHORT[p.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {skips.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-bold">لماذا استُبعدت الكراتين</h3>
          <p className="mb-3 mt-0.5 text-xs text-muted">في الطلبات التي لم يتّسع لها كرتون واحد: كم مرة استُبعد كرتون، ولأي سبب.</p>
          <HBar rows={skips} />
        </div>
      )}
      <TableView head={["النتيجة", "عدد الطلبات", "النسبة"]} rows={rows.map((r) => [r.label, String(r.value), share(r.value, data.totals.runs)])} />
    </Card>
  );
}

function ValidatorCard({ data }: { data: DashboardData }) {
  const m3 = data.metrics.m3ValidatorRejections;
  return (
    <Card code="M3" title="ترتيبات رفضها المدقّق" hint="يفحص مدقّق مستقل كل ترتيب قبل أن يراه الموظف. يجب أن يبقى الرقم صفراً، وأي رقم غيره يعني خللاً يُبلَّغ به الفريق التقني.">
      {m3.value === 0 ? (
        <p className="flex items-center gap-2 text-3xl font-bold text-ok">
          <CheckIcon className="size-7" />
          <span className="ltr-nums">0</span>
          <span className="font-sans text-sm font-medium">كل ترتيب رآه الموظف اجتاز الفحص</span>
        </p>
      ) : (
        <div>
          <p className="flex items-center gap-2 text-3xl font-bold text-critical">
            <AlertIcon className="size-7" />
            <span className="ltr-nums">{m3.value}</span>
          </p>
          <p className="mt-1 text-sm" dir="ltr">
            {Object.entries(m3.byCode)
              .map(([c, v]) => `${c}: ${v}`)
              .join(" · ")}
          </p>
        </div>
      )}
    </Card>
  );
}

function CacheCard({ data }: { data: DashboardData }) {
  const c = data.metrics.m7Cost;
  const total = c.hits + c.misses;
  return (
    <Card code="M7-cache" title="منتجات كانت معروفة مسبقاً" hint="المنتج الذي قرأته رصّة مرة تحفظ بياناته، فلا يحتاج قراءة جديدة: تجهيز أسرع وبلا تكلفة.">
      <p className="ltr-nums font-display text-3xl font-bold">{fmtPct(c.cacheHitRate)}</p>
      <p className="mt-1 text-sm text-muted">
        {total > 0 ? `${ltr(String(c.hits))} من ${fmtCount(total, PRODUCTS)} لم تحتج قراءة، و${ltr(String(c.misses))} قُرئت لأول مرة.` : "لا توجد منتجات في هذه الفترة."}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------ recent runs */

type RunFilter = "all" | "problems" | "new" | "edited";
const RUN_FILTERS: Array<[RunFilter, string]> = [
  ["all", "الكل"],
  ["problems", "لم تنتهِ بكرتون واحد"],
  ["new", "فيها منتج جديد"],
  ["edited", "صحّح الموظف بياناتها"],
];

function matches(r: OrderRun, f: RunFilter) {
  if (f === "problems") return r.status !== "box_found";
  if (f === "new") return r.cacheMisses > 0;
  if (f === "edited") return r.employeeAction === "edited";
  return true;
}

function RecentRuns({ runs, openId, trace, onToggle }: { runs: OrderRun[]; openId: string | null; trace: Trace | null | undefined; onToggle: (id: string) => void }) {
  const [filter, setFilter] = useState<RunFilter>("all");
  const shown = runs.filter((r) => matches(r, filter));

  return (
    <Card title="آخر الطلبات المجهّزة" hint="آخر 25 تجهيزاً، الأحدث أولاً. اضغط «التفاصيل» لترى ما قرأته رصّة من المنتجات، وتجربة كل كرتون، والأزمنة، وتصحيحات الموظف.">
      <div className="mb-3 flex flex-wrap gap-2 text-sm" role="group" aria-label="تصفية الطلبات">
        {RUN_FILTERS.map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full border px-3 py-1 ${filter === f ? "border-brand bg-brand/10 font-bold text-brand" : "border-border text-muted hover:text-foreground"}`}
          >
            {label} <span className="ltr-nums text-xs">({runs.filter((r) => matches(r, f)).length})</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={runs.length === 0 ? "لا توجد طلبات مجهّزة في هذه الفترة" : "لا توجد طلبات بهذا الوصف"}>
          {runs.length === 0 ? "جهّز طلباً من صفحة «الطلبات» وسيظهر هنا." : "جرّب تصفية أخرى."}
        </EmptyState>
      ) : (
        <>
          {/* Phones and tablets: one card per run. */}
          <ul className="space-y-2 lg:hidden">
            {shown.map((r) => (
              <li key={r.id} className={`rounded-xl border p-3 text-sm ${openId === r.id ? "border-2 border-brand" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <Link href={`/orders/${r.orderId}`} className="ltr-nums font-bold hover:text-brand">
                    #{r.orderId}
                  </Link>
                  <StatusPill status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
                  <span className="ms-auto text-xs text-muted" title={fmtTime(r.createdAt)}>
                    {fmtClock(r.createdAt)}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <Kv k="الكرتون" v={r.cartonId ?? "—"} />
                  <Kv k="مدة التجهيز" v={fmtMs(r.totalMs)} />
                  <Kv k="المنتجات" v={productsText(r)} />
                  <Kv k="ما فعله الموظف" v={EMPLOYEE_ACTION[r.employeeAction]} />
                  <div className="col-span-2">
                    <Kv k="مصدر المقاسات" v={sourcesText(r)} />
                  </div>
                </dl>
                <DetailsButton open={openId === r.id} onClick={() => onToggle(r.id)} panelId={`run-card-${r.id}`} />
                {openId === r.id && (
                  <div id={`run-card-${r.id}`} className="mt-3 border-t border-border pt-3">
                    <TraceSlot trace={trace} />
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Wide screens: a table, details open under the row. */}
          <table className="hidden w-full text-sm lg:table [&_td]:px-2 [&_td]:py-2.5 [&_th]:px-2 [&_th]:py-2">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="text-start font-medium">الوقت</th>
                <th className="text-start font-medium">رقم الطلب</th>
                <th className="text-start font-medium">النتيجة</th>
                <th className="text-start font-medium">الكرتون</th>
                <th className="text-start font-medium">مدة التجهيز</th>
                <th className="text-start font-medium">المنتجات</th>
                <th className="text-start font-medium">مصدر المقاسات</th>
                <th className="text-start font-medium">ما فعله الموظف</th>
                <th>
                  <span className="sr-only">التفاصيل</span>
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {shown.map((r) => (
                <Fragment key={r.id}>
                  <tr className={`border-b border-border hover:bg-background ${openId === r.id ? "bg-brand/10" : ""}`}>
                    <td className="whitespace-nowrap text-xs text-muted" title={fmtTime(r.createdAt)}>
                      {fmtClock(r.createdAt)}
                    </td>
                    <td>
                      <Link href={`/orders/${r.orderId}`} className="ltr-nums font-bold hover:text-brand hover:underline">
                        #{r.orderId}
                      </Link>
                    </td>
                    <td>
                      <StatusPill status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
                    </td>
                    <td>{r.cartonId ?? "—"}</td>
                    <td className="whitespace-nowrap">{fmtMs(r.totalMs)}</td>
                    <td className="text-xs">{productsText(r)}</td>
                    <td className="text-xs">{sourcesText(r)}</td>
                    <td className="text-xs">{EMPLOYEE_ACTION[r.employeeAction]}</td>
                    <td className="text-end">
                      <DetailsButton open={openId === r.id} onClick={() => onToggle(r.id)} panelId={`run-row-${r.id}`} />
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr className="border-b-2 border-brand bg-brand/5">
                      <td colSpan={9} id={`run-row-${r.id}`} className="!px-4 !pb-5">
                        <TraceSlot trace={trace} />
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

function sourcesText(r: OrderRun): string {
  const parts = Object.entries(r.unitSources)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${SOURCE_LABEL[k as keyof typeof SOURCE_LABEL]} ${ltr(String(v))}`);
  return parts.length ? parts.join(" · ") : "—";
}

// Phones get cards and wide screens a table, both in the DOM, so each layout has its own panel id.
function DetailsButton({ open, onClick, panelId }: { open: boolean; onClick: () => void; panelId: string }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      aria-controls={panelId}
      className={`mt-2 rounded-lg border px-2.5 py-1 text-xs font-medium lg:mt-0 ${open ? "border-brand text-brand" : "border-border hover:border-brand hover:text-brand"}`}
    >
      {open ? "إخفاء التفاصيل" : "التفاصيل"}
    </button>
  );
}

function TraceSlot({ trace }: { trace: Trace | null | undefined }) {
  if (trace === undefined) return <p className="text-sm text-muted">جارٍ تحميل التفاصيل…</p>;
  if (trace === null) return <p className="text-sm text-warn">تعذّر تحميل تفاصيل هذا الطلب. حدّث الصفحة وحاول مرة أخرى.</p>;
  return <TraceView trace={trace} />;
}

function TraceView({ trace }: { trace: Trace }) {
  const r = trace.run;
  const name = (id: string) => trace.names?.[id] ?? id;
  return (
    <div className="space-y-4 text-sm">
      <h3 className="font-bold">
        تفاصيل تجهيز الطلب <span className="ltr-nums">#{r.orderId}</span>
        <span className="ms-2 text-xs font-normal text-muted">{fmtTime(r.createdAt)}</span>
      </h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kv k="النتيجة" v={STATUS_LABEL[r.status] ?? r.status} />
        <Kv k="الكرتون المختار" v={r.cartonId ?? "—"} />
        <Kv k="المدة الكلية للتجهيز" v={fmtMs(r.totalMs)} />
        <Kv k="منها قراءة المنتجات الجديدة" v={r.extractMs > 0 ? fmtMs(r.extractMs) : "لم تحتج"} />
        <Kv k="تكلفة الذكاء الاصطناعي" v={fmtAiSar(r.costUsd)} />
      </dl>

      {r.attempts.length > 0 && (
        <div>
          <h4 className="text-sm font-bold">نتيجة تجربة كل كرتون</h4>
          <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {r.attempts.map((a) => (
              <li
                key={a.cartonId}
                className={`rounded border px-2 py-0.5 ${a.cartonId === r.cartonId ? "border-ok bg-ok-soft text-ok" : a.outcome === "packed" ? "border-ok/50" : "border-border text-muted"}`}
              >
                <b>{a.cartonId}</b>: {OUTCOME_LABEL[a.outcome] ?? a.outcome}
                {a.cartonId === r.cartonId && <b> · المختار</b>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-sm font-bold">المنتجات الجديدة التي قرأتها رصّة ({ltr(String(trace.extractions.length))})</h4>
        {trace.extractions.length === 0 ? (
          <p className="mt-1 text-xs text-muted">كل منتجات هذا الطلب كانت معروفة مسبقاً، فلم تحتج إلى قراءة جديدة.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs">
            {trace.extractions.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2 rounded border border-border px-2 py-1.5">
                <span className="font-medium">{name(e.productId)}</span>
                <span className={e.status === "ok" ? "text-ok" : "text-critical"}>{e.status === "ok" ? "نجحت القراءة" : `فشلت: ${EXTRACTION_STATUS_LABEL[e.status] ?? e.status}`}</span>
                <span className="text-muted">{fmtMs(e.latencyMs)}</span>
                {e.dimsSource && <span className="text-muted">مقاسه: {SOURCE_LABEL[e.dimsSource]}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {trace.corrections.length > 0 && (
        <div>
          <h4 className="text-sm font-bold">تصحيحات الموظف ({ltr(String(trace.corrections.length))})</h4>
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
      <dd className="break-words font-medium">{v}</dd>
    </div>
  );
}
