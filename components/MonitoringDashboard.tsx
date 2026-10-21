"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Correction, ExtractionEvent, OrderRun } from "@/lib/db/types";
import type { DashboardData } from "@/lib/monitoring/dashboard";
import {
  EXTRACTION_STATUS_LABEL,
  fmtApiError,
  fmtCount,
  fmtMs,
  fmtPct,
  fmtAxisMs,
  fmtTime,
  fmtUsd,
  ltr,
  ORIGIN_LABEL,
  OUTCOME_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
} from "@/lib/ui/format";
import { StatusPill } from "./Badges";
import { CardSkeleton, EmptyState } from "./PageHeader";

const FIELD_LABEL: Record<string, string> = {
  lengthCm: "الطول",
  widthCm: "العرض",
  heightCm: "الارتفاع",
  weightG: "الوزن",
  fragile: "قابل للكسر",
  liquid: "سائل",
  sensitive: "حساس",
};
const EMPLOYEE_ACTION: Record<string, string> = { pending: "لم يراجع بعد", confirmed: "أكّد التغليف", edited: "صحّح البيانات" };
const RUNS = { one: "طلب واحد", two: "طلبان", few: "طلبات", many: "طلباً" };
const READS = { one: "قراءة منتج واحدة", two: "قراءتان للمنتجات", few: "قراءات للمنتجات", many: "قراءة للمنتجات" };

type Win = DashboardData["window"];
const WINDOWS: Array<[Win, string]> = [
  ["1h", "آخر ساعة"],
  ["24h", "آخر 24 ساعة"],
  ["7d", "آخر 7 أيام"],
  ["all", "الكل"],
];

const AXIS = { stroke: "var(--chart-axis)", fontSize: 12, tickLine: false } as const;
const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--foreground)",
  fontSize: 12,
};

interface Trace {
  run: OrderRun;
  extractions: ExtractionEvent[];
  corrections: Correction[];
}

export default function MonitoringDashboard({ initialRun }: { initialRun: string | null }) {
  const [win, setWin] = useState<Win>("24h");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [traceId, setTraceId] = useState<string | null>(initialRun);
  const [trace, setTrace] = useState<Trace | null>(null);

  // State is only set after the await, never synchronously inside the effect.
  const load = useCallback(async (w: Win) => {
    try {
      const res = await fetch(`/api/monitoring/metrics?window=${w}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as DashboardData);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Poll the metrics endpoint: first load right away, then every 15 seconds.
    const first = setTimeout(() => void load(win), 0);
    const t = setInterval(() => void load(win), 15_000);
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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  if (!data) {
    return error ? (
      <p className="rounded-lg border border-critical bg-critical-soft p-4 text-sm">
        تعذّر تحميل أرقام الأداء. {fmtApiError(error)}
      </p>
    ) : (
      <CardSkeleton />
    );
  }

  const m = data.metrics;
  const latency = data.latency.map((p) => ({
    t: new Date(p.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    cached: p.cached ? p.totalMs : null,
    uncached: p.cached ? null : p.totalMs,
    order: p.orderId,
  }));
  const latencyMax = Math.max(0, ...data.latency.map((p) => p.totalMs));
  const sourceRows = (Object.keys(m.m2SourceMix.value) as Array<keyof typeof m.m2SourceMix.value>).map((k) => ({
    label: SOURCE_LABEL[k],
    value: m.m2SourceMix.value[k],
  }));
  const failureRows = Object.entries(m.m6GeminiFailureRate.byStatus)
    .filter(([s]) => s !== "ok")
    .map(([status, value]) => ({ label: EXTRACTION_STATUS_LABEL[status] ?? status, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className={`space-y-6 transition-opacity ${refreshing ? "opacity-70" : ""}`}>
      {/* One filter row scopes every chart below. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="الفترة الزمنية">
          <span className="text-muted">الفترة:</span>
          {WINDOWS.map(([w, label]) => (
            <button
              key={w}
              onClick={() => {
                if (w === win) return;
                setRefreshing(true); // hold the previous render dimmed until the new window loads
                setWin(w);
              }}
              aria-pressed={win === w}
              className={`rounded-full border px-3 py-1 transition-colors ${win === w ? "border-brand bg-brand font-medium text-brand-contrast" : "border-border bg-surface hover:border-brand"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ms-auto text-xs text-muted">
          {fmtCount(data.totals.runs, RUNS)} · {fmtCount(data.totals.extractions, READS)} · آخر تحديث {fmtTime(data.generatedAt)}
        </span>
      </div>

      {error && <p className="text-sm text-critical">تعذّر تحديث الأرقام ({fmtApiError(error)}). المعروض هو آخر تحديث ناجح.</p>}
      <Alerts alerts={data.alerts} failed={data.alertsError} />

      {/* Headline numbers: one number each, so stat tiles, not charts. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          code="M1"
          title="منتجات صحّح الموظف بياناتها"
          value={fmtPct(m.m1CorrectionRate.value)}
          n={m.m1CorrectionRate.n}
          sufficient={m.m1CorrectionRate.sufficient}
          hint="من المنتجات التي قرأتها رصّة وراجعها الموظف، كم منها احتاج إلى تصحيح؟ كلما قلّت النسبة كانت القراءة أدق."
          detail={`صحّح الموظف ${ltr(String(m.m1CorrectionRate.corrected))} من ${ltr(String(m.m1CorrectionRate.reviewed))}`}
        />
        <Tile
          code="M6"
          title="قراءات المنتجات التي فشلت"
          value={fmtPct(m.m6GeminiFailureRate.value)}
          n={m.m6GeminiFailureRate.n}
          sufficient={m.m6GeminiFailureRate.sufficient}
          hint="إذا ارتفعت النسبة فقد تتعطل قراءة المنتجات الجديدة، وسيلزم قياسها يدوياً."
        />
        <Tile
          code="M5"
          title="سرعة تجهيز الطلب"
          value={`${fmtMs(m.m5Latency.cached.value.p95)} / ${fmtMs(m.m5Latency.uncached.value.p95)}`}
          n={m.m5Latency.cached.n + m.m5Latency.uncached.n}
          sufficient={m.m5Latency.cached.sufficient || m.m5Latency.uncached.sufficient}
          hint="95% من الطلبات تنتهي خلال هذا الزمن أو أقل. الأول لطلبات منتجاتها معروفة مسبقاً، والثاني لطلبات فيها منتجات جديدة تحتاج قراءة."
          detail="منتجات معروفة / منتجات جديدة"
        />
        <Tile
          code="M7"
          title="تكلفة تجهيز الطلب الواحد"
          value={fmtUsd(m.m7Cost.value)}
          n={m.m7Cost.n}
          sufficient={m.m7Cost.sufficient}
          hint="متوسط تكلفة الخدمة الآلية لكل طلب. ترتفع كلما زادت المنتجات الجديدة التي تحتاج قراءة."
          detail={`منتجات معروفة مسبقاً: ${fmtPct(m.m7Cost.cacheHitRate)}`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card code="M5" title="زمن تجهيز كل طلب" hint="كل نقطة تمثل طلباً واحداً. الطلب الأبطأ غالباً فيه منتجات جديدة احتاجت قراءة.">
          {latency.length === 0 ? (
            <Empty />
          ) : (
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latency} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="t" {...AXIS} minTickGap={24} />
                  <YAxis {...AXIS} width={60} tickFormatter={(v: number) => fmtAxisMs(v, latencyMax)} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtMs(Number(v))} labelFormatter={(l) => `الساعة ${l}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line name="منتجاته معروفة مسبقاً" dataKey="cached" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                  <Line name="فيه منتجات جديدة" dataKey="uncached" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <TableView
            head={["الساعة", "رقم الطلب", "منتجاته معروفة مسبقاً", "فيه منتجات جديدة"]}
            rows={latency.map((p) => [p.t, p.order, fmtMs(p.cached), fmtMs(p.uncached)])}
          />
        </Card>

        <Card
          code="M2"
          title="من أين جاءت مقاسات القطع"
          hint={`نسبة «غير معروف»: ${fmtPct(m.m2SourceMix.unknownShare)}. إذا زادت القطع التقديرية أو غير المعروفة فمعنى ذلك أن صفحات المتجر تنقصها المقاسات.`}
          n={m.m2SourceMix.n}
        >
          <HBar rows={sourceRows} />
          <TableView head={["المصدر", "عدد القطع"]} rows={sourceRows.map((r) => [r.label, String(r.value)])} />
        </Card>

        <Card code="M6" title="أسباب فشل قراءة المنتجات" hint="الأسباب مرتبة من الأكثر تكراراً." n={m.m6GeminiFailureRate.n}>
          {failureRows.length === 0 ? <p className="py-8 text-center text-sm text-ok">✓ لم يفشل أي طلب في هذه الفترة</p> : <HBar rows={failureRows} />}
          <TableView
            head={["الحالة", "العدد"]}
            rows={Object.entries(m.m6GeminiFailureRate.byStatus).map(([s, v]) => [EXTRACTION_STATUS_LABEL[s] ?? s, String(v)])}
          />
        </Card>

        <div className="grid gap-4">
          <Card code="M3" title="ترتيبات رفضها المدقّق" hint="يفحص مدقّق مستقل كل ترتيب قبل أن يراه الموظف. يجب أن يبقى الرقم صفراً، وأي رقم غيره يعني خللاً يُبلَّغ به الفريق التقني.">
            {m.m3ValidatorRejections.value === 0 ? (
              <p className="text-2xl font-bold text-ok">✓ 0</p>
            ) : (
              <div>
                <p className="text-2xl font-bold text-critical">⚠ {m.m3ValidatorRejections.value}</p>
                <p className="mt-1 text-sm" dir="ltr">
                  {Object.entries(m.m3ValidatorRejections.byCode)
                    .map(([c, v]) => `${c}: ${v}`)
                    .join(" · ")}
                </p>
              </div>
            )}
          </Card>
          <Card code="M4" title="طلبات بلا كرتون مناسب" hint="إذا ارتفعت النسبة فالكراتين المتوفرة لا تناسب منتجاتك، أو هامش الأمان كبير أكثر من اللازم." n={m.m4NoBoxRate.n}>
            <p className="text-2xl font-bold">{fmtPct(m.m4NoBoxRate.value)}</p>
            {Object.keys(m.m4NoBoxRate.skipReasons).length > 0 && (
              <ul className="mt-1 text-sm text-muted">
                {Object.entries(m.m4NoBoxRate.skipReasons).map(([k, v]) => (
                  <li key={k}>
                    {OUTCOME_LABEL[k] ?? k}: <span className="ltr-nums">{v}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      <Card title="آخر الطلبات المجهّزة" hint="اضغط على أي صف لعرض تفاصيله: ما قرأته رصّة من المنتجات، والأزمنة، وتصحيحات الموظف.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm [&_td]:px-2 [&_td]:py-2.5 [&_th]:px-2 [&_th]:py-2">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="text-start font-medium">الوقت</th>
                <th className="text-start font-medium">رقم الطلب</th>
                <th className="text-start font-medium">النتيجة</th>
                <th className="text-start font-medium">الكرتون</th>
                <th className="text-start font-medium">مدة التجهيز</th>
                <th className="text-start font-medium" title="عدد المنتجات المعروفة مسبقاً / عدد المنتجات الجديدة التي قرأتها رصّة">
                  منتجات معروفة / جديدة
                </th>
                <th className="text-start font-medium">مصدر المقاسات</th>
                <th className="text-start font-medium">ما فعله الموظف</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.recentRuns.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => setTraceId(r.id)}
                  onKeyDown={(e) => e.key === "Enter" && setTraceId(r.id)}
                  aria-selected={traceId === r.id}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-background ${traceId === r.id ? "bg-background" : ""}`}
                >
                  <td className="text-xs">{fmtTime(r.createdAt)}</td>
                  <td className="ltr-nums">#{r.orderId}</td>
                  <td>
                    <StatusPill status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
                  </td>
                  <td>{r.cartonId ?? "—"}</td>
                  <td>{fmtMs(r.totalMs)}</td>
                  <td className="ltr-nums">
                    {r.cacheHits}/{r.cacheMisses}
                  </td>
                  <td className="text-xs">
                    {Object.entries(r.unitSources)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => `${SOURCE_LABEL[k as keyof typeof SOURCE_LABEL]} ${v}`)
                      .join(" · ")}
                  </td>
                  <td className="text-xs">{EMPLOYEE_ACTION[r.employeeAction]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recentRuns.length === 0 && (
            <EmptyState title="لا توجد طلبات مجهّزة في هذه الفترة">جهّز طلباً من صفحة «الطلبات» وسيظهر هنا.</EmptyState>
          )}
        </div>
      </Card>

      {trace && <TraceView trace={trace} onClose={() => (setTraceId(null), setTrace(null))} />}
    </div>
  );
}

function Alerts({ alerts, failed }: { alerts: DashboardData["alerts"]; failed: boolean }) {
  if (failed) return <p className="rounded-lg border border-warn bg-warn-soft p-3 text-sm">⚠ تعذّر فحص التنبيهات</p>;
  if (alerts.length === 0) return <p className="rounded-lg border border-ok bg-ok-soft p-3 text-sm text-ok">✓ لا توجد تنبيهات مفتوحة</p>;
  const style = { critical: "border-critical bg-critical-soft", warning: "border-warn bg-warn-soft", info: "border-info bg-info-soft" };
  const icon = { critical: "⛔ حرج", warning: "⚠ تحذير", info: "ℹ معلومة" };
  return (
    <div className="space-y-2" role="alert">
      {alerts.map((a) => (
        <div key={a.id ?? a.rule} className={`rounded-lg border p-3 text-sm ${style[a.severity]}`}>
          <span className="font-bold">{icon[a.severity]}</span> <span className="ltr-nums text-xs text-muted">{a.rule.split("_")[0]}</span>
          <p className="mt-1">{a.message}</p>
          <p className="mt-1 text-xs text-muted">
            القيمة {alertNumber(a.rule, a.value)} · الحدّ المسموح {alertNumber(a.rule, a.threshold)} · بناءً على{" "}
            <span className="ltr-nums">{a.sampleSize}</span> حالة · بتاريخ {fmtTime(a.createdAt)}
            {a.simulated && " · (عطل تجريبي)"}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Alert numbers have different units per rule: M3 is a count, M5 is milliseconds, the rest are shares. */
function alertNumber(rule: string, v: number): string {
  if (rule.startsWith("M3_")) return ltr(String(v));
  if (rule.startsWith("M5_")) return fmtMs(v);
  return fmtPct(v);
}

function Sample({ n }: { n: number }) {
  return (
    <span title="عدد الحالات التي بُني عليها هذا الرقم. كلما قلّ العدد قلّ الاعتماد على الرقم.">
      عدد الحالات: <span className="ltr-nums">{n}</span>
    </span>
  );
}

function Tile(props: { code?: string; title: string; value: string; n: number; sufficient: boolean; hint: string; detail?: string }) {
  return (
    <div data-metric={props.code} className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">
        {props.title}
      </p>
      <p className="mt-2 text-2xl font-bold">
        {props.sufficient ? props.value : <span className="text-base font-medium text-muted">الحالات قليلة، لا يُعتمد على الرقم بعد</span>}
      </p>
      <p className="mt-1 text-xs text-muted">
        {props.detail && props.sufficient ? `${props.detail} · ` : ""}
        <Sample n={props.n} />
      </p>
      <p className="mt-2 text-xs text-muted">{props.hint}</p>
    </div>
  );
}

function Card({ code, title, hint, n, children }: { code?: string; title: string; hint?: string; n?: number; children: React.ReactNode }) {
  return (
    <section data-metric={code} className="rounded-lg border border-border bg-surface p-4">
      <h2 className="font-bold">
        {title}{" "}
        {n !== undefined && (
          <span className="text-xs font-normal text-muted">
            · <Sample n={n} />
          </span>
        )}
      </h2>
      {hint && <p className="mb-3 mt-1 text-xs text-muted">{hint}</p>}
      {children}
    </section>
  );
}

/** One series → one color for every bar; value labeled at the bar end. */
function HBar({ rows }: { rows: Array<{ label: string; value: number }> }) {
  if (rows.every((r) => r.value === 0)) return <Empty />;
  return (
    <div dir="ltr" style={{ height: Math.max(120, rows.length * 36 + 24) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barCategoryGap={8}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS} />
          <YAxis type="category" dataKey="label" width={110} {...AXIS} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }} />
          <Bar dataKey="value" name="العدد" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" fill="var(--foreground)" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TableView({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted">عرض البيانات في جدول</summary>
      <table className="mt-2 w-full tabular-nums [&_td]:py-1">
        <thead>
          <tr className="text-muted">
            {head.map((h) => (
              <th key={h} className="text-start">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
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

function Empty() {
  return <p className="py-8 text-center text-sm text-muted">لا توجد بيانات في هذه الفترة. جرّب فترة أطول، أو جهّز طلباً من صفحة «الطلبات».</p>;
}

function TraceView({ trace, onClose }: { trace: Trace; onClose: () => void }) {
  const r = trace.run;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  return (
    <section ref={ref} className="rounded-lg border-2 border-brand bg-surface p-4" aria-label="تفاصيل الطلب">
      <div className="flex items-center gap-2">
        <h2 className="font-bold">تفاصيل تجهيز الطلب #{r.orderId}</h2>
        <button onClick={onClose} className="ms-auto rounded border border-border px-3 py-1 text-xs hover:border-brand">
          إغلاق
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Kv k="النتيجة" v={STATUS_LABEL[r.status] ?? r.status} />
        <Kv k="الكرتون المختار" v={r.cartonId ?? "—"} />
        <Kv k="قراءة المنتجات الجديدة" v={fmtMs(r.extractMs)} />
        <Kv k="المدة الكلية للتجهيز" v={fmtMs(r.totalMs)} />
        <Kv k="تكلفة التجهيز" v={fmtUsd(r.costUsd)} />
      </dl>
      {r.attempts.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          نتيجة تجربة كل كرتون: {r.attempts.map((a) => `${a.cartonId}: ${OUTCOME_LABEL[a.outcome] ?? a.outcome}`).join(" · ")}
        </p>
      )}
      <h3 className="mt-4 text-sm font-bold">المنتجات الجديدة التي قرأتها رصّة ({trace.extractions.length})</h3>
      {trace.extractions.length === 0 ? (
        <p className="mt-1 text-xs text-muted">كل منتجات هذا الطلب كانت معروفة مسبقاً، فلم تحتج إلى قراءة جديدة.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs">
          {trace.extractions.map((e) => (
            <li key={e.id} className="rounded border border-border p-2">
              <span className="ltr-nums font-medium">{e.productId}</span> · {EXTRACTION_STATUS_LABEL[e.status] ?? e.status} · {fmtMs(e.latencyMs)}
              {e.dimsSource && <span> · مقاسه: {SOURCE_LABEL[e.dimsSource]}</span>}
            </li>
          ))}
        </ul>
      )}
      {trace.corrections.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-bold">تصحيحات الموظف ({trace.corrections.length})</h3>
          <ul className="mt-1 space-y-0.5 text-xs">
            {trace.corrections.map((c) => (
              <li key={c.id}>
                <span className="ltr-nums">{c.productId}</span> · {FIELD_LABEL[c.field] ?? c.field}: {ltr(String(c.oldValue ?? "—"))} ← {ltr(String(c.newValue))}
                {" "}({ORIGIN_LABEL[c.priorOrigin] ?? c.priorOrigin})
              </li>
            ))}
          </ul>
        </>
      )}
      <details className="mt-4 text-xs">
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
    </section>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="break-all">{v}</dd>
    </div>
  );
}
