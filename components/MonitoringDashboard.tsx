"use client";

import { useCallback, useEffect, useState } from "react";
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
import { fmtMs, fmtPct, fmtTime, fmtUsd, OUTCOME_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/ui/format";
import { StatusPill } from "./Badges";

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
    // Poll the metrics endpoint: first load right away, then every 15 s.
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
      <p className="rounded-lg border border-critical bg-critical-soft p-4 text-sm">{error}</p>
    ) : (
      <div className="h-96 animate-pulse rounded-lg bg-border/50" />
    );
  }

  const m = data.metrics;
  const latency = data.latency.map((p) => ({
    t: new Date(p.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    cached: p.cached ? p.totalMs : null,
    uncached: p.cached ? null : p.totalMs,
    order: p.orderId,
  }));
  const sourceRows = (Object.keys(m.m2SourceMix.value) as Array<keyof typeof m.m2SourceMix.value>).map((k) => ({
    label: SOURCE_LABEL[k],
    value: m.m2SourceMix.value[k],
  }));
  const failureRows = Object.entries(m.m6GeminiFailureRate.byStatus)
    .filter(([s]) => s !== "ok")
    .map(([status, value]) => ({ label: status, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className={`space-y-6 transition-opacity ${refreshing ? "opacity-70" : ""}`}>
      {/* One filter row scopes every chart below. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="الفترة الزمنية">
          {WINDOWS.map(([w, label]) => (
            <button
              key={w}
              onClick={() => {
                if (w === win) return;
                setRefreshing(true); // hold the previous render dimmed until the new window loads
                setWin(w);
              }}
              className={`rounded-full border px-3 py-1 ${win === w ? "border-brand bg-brand text-brand-contrast" : "border-border"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ms-auto text-xs text-muted">
          <span className="ltr-nums">{data.totals.runs}</span> طلب · <span className="ltr-nums">{data.totals.extractions}</span> استخراج ·
          تحديث {fmtTime(data.generatedAt)}
        </span>
      </div>

      {error && <p className="text-sm text-critical">تعذر التحديث: {error} (يُعرض آخر تحديث ناجح)</p>}
      <Alerts alerts={data.alerts} failed={data.alertsError} />

      {/* Headline numbers: one number each, so stat tiles, not charts. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          title="M1 · نسبة تصحيح الـ AI"
          value={fmtPct(m.m1CorrectionRate.value)}
          n={m.m1CorrectionRate.n}
          sufficient={m.m1CorrectionRate.sufficient}
          hint="من منتجات الـ AI اللي راجعها الموظف، كم واحد احتاج تصحيح؟ إذا ارتفعت: الـ AI يقرأ غلط، راجع الـ prompt بالتقييم."
          detail={`${m.m1CorrectionRate.corrected} من ${m.m1CorrectionRate.reviewed}`}
        />
        <Tile
          title="M6 · فشل Gemini"
          value={fmtPct(m.m6GeminiFailureRate.value)}
          n={m.m6GeminiFailureRate.n}
          sufficient={m.m6GeminiFailureRate.sufficient}
          hint="نسبة طلبات Gemini الفاشلة. إذا ارتفعت: المفتاح، أو حد الطلبات، أو تعطل الخدمة، أو رد غير صالح."
        />
        <Tile
          title="M5 · زمن التجهيز p95"
          value={`${fmtMs(m.m5Latency.cached.value.p95)} / ${fmtMs(m.m5Latency.uncached.value.p95)}`}
          n={m.m5Latency.cached.n + m.m5Latency.uncached.n}
          sufficient={m.m5Latency.cached.sufficient || m.m5Latency.uncached.sufficient}
          hint="مع الكاش / بدون كاش. البطء مع الكاش = مشكلة في المحرك أو قاعدة البيانات، وبدون كاش = Gemini بطيء."
          detail="مع الكاش / بدون كاش"
        />
        <Tile
          title="M7 · التكلفة لكل طلب"
          value={fmtUsd(m.m7Cost.value)}
          n={m.m7Cost.n}
          sufficient={m.m7Cost.sufficient}
          hint="تكلفة tokens لكل طلب. إذا ارتفعت: الكاش معطل أو الـ prompt طال."
          detail={`الكاش ${fmtPct(m.m7Cost.cacheHitRate)}`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="M5 · زمن التجهيز لكل طلب" hint="كل نقطة طلب. فجوة كبيرة بين الخطين تعني إن Gemini هو اللي ياخذ الوقت.">
          {latency.length === 0 ? (
            <Empty />
          ) : (
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={latency} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="t" {...AXIS} minTickGap={24} />
                  <YAxis {...AXIS} width={52} tickFormatter={(v: number) => fmtMs(v)} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtMs(Number(v))} labelFormatter={(l) => `الوقت ${l}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line name="مع الكاش" dataKey="cached" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                  <Line name="بدون كاش" dataKey="uncached" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <TableView
            head={["الوقت", "الطلب", "مع الكاش", "بدون كاش"]}
            rows={latency.map((p) => [p.t, p.order, fmtMs(p.cached), fmtMs(p.uncached)])}
          />
        </Card>

        <Card
          title="M2 · مصدر أبعاد القطع"
          hint={`نسبة غير المعروف ${fmtPct(m.m2SourceMix.unknownShare)}. إذا كثر التقديري أو غير المعروف: صفحات المتجر ناقصة البيانات.`}
          n={m.m2SourceMix.n}
        >
          <HBar rows={sourceRows} />
          <TableView head={["المصدر", "عدد القطع"]} rows={sourceRows.map((r) => [r.label, String(r.value)])} />
        </Card>

        <Card title="M6 · أسباب فشل Gemini" hint="config_error = المفتاح، rate_limited = حد الطلبات، parse_error = رد غير صالح، simulated_outage = تجربة العرض." n={m.m6GeminiFailureRate.n}>
          {failureRows.length === 0 ? <p className="py-8 text-center text-sm text-ok">✓ لا توجد أخطاء في هذه الفترة</p> : <HBar rows={failureRows} />}
          <TableView head={["الحالة", "العدد"]} rows={Object.entries(m.m6GeminiFailureRate.byStatus).map(([s, v]) => [s, String(v)])} />
        </Card>

        <div className="grid gap-4">
          <Card title="M3 · رفض الـ Validator لترتيبات المحرك" hint="يجب أن يكون صفراً دائماً. أي رقم أكبر يعني خطأ في المحرك: افتح التتبع وأعد إنتاجه في اختبار.">
            {m.m3ValidatorRejections.value === 0 ? (
              <p className="text-2xl font-bold text-ok">✓ 0</p>
            ) : (
              <div>
                <p className="text-2xl font-bold text-critical">⚠ {m.m3ValidatorRejections.value}</p>
                <p className="mt-1 text-sm">
                  {Object.entries(m.m3ValidatorRejections.byCode)
                    .map(([c, v]) => `${c}: ${v}`)
                    .join(" · ")}
                </p>
              </div>
            )}
          </Card>
          <Card title="M4 · طلبات بدون كرتون مناسب" hint="إذا ارتفعت: الكراتين ما تناسب المنتجات أو هامش الأمان كبير." n={m.m4NoBoxRate.n}>
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

      <Card title="آخر الطلبات" hint="اضغط على أي طلب لعرض تتبعه الكامل (الاستخراج، والتوقيت، والتصحيحات).">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 text-start">الوقت</th>
                <th className="text-start">الطلب</th>
                <th className="text-start">الحالة</th>
                <th className="text-start">الكرتون</th>
                <th className="text-start">الزمن</th>
                <th className="text-start">كاش/AI</th>
                <th className="text-start">المصادر</th>
                <th className="text-start">الموظف</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.recentRuns.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => setTraceId(r.id)}
                  onKeyDown={(e) => e.key === "Enter" && setTraceId(r.id)}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-background ${traceId === r.id ? "bg-background" : ""}`}
                >
                  <td className="py-2 text-xs">{fmtTime(r.createdAt)}</td>
                  <td className="ltr-nums">#{r.orderId}</td>
                  <td>
                    <StatusPill status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
                  </td>
                  <td>{r.cartonId ?? "—"}</td>
                  <td className="ltr-nums">{fmtMs(r.totalMs)}</td>
                  <td className="ltr-nums">
                    {r.cacheHits}/{r.cacheMisses}
                  </td>
                  <td className="text-xs">
                    {Object.entries(r.unitSources)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => `${SOURCE_LABEL[k as keyof typeof SOURCE_LABEL]} ${v}`)
                      .join(" · ")}
                  </td>
                  <td className="text-xs">{{ pending: "—", confirmed: "أكّد", edited: "عدّل" }[r.employeeAction]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recentRuns.length === 0 && <Empty />}
        </div>
      </Card>

      {trace && <TraceView trace={trace} onClose={() => (setTraceId(null), setTrace(null))} />}
    </div>
  );
}

function Alerts({ alerts, failed }: { alerts: DashboardData["alerts"]; failed: boolean }) {
  if (failed) return <p className="rounded-lg border border-warn bg-warn-soft p-3 text-sm">⚠ تعذر تقييم التنبيهات</p>;
  if (alerts.length === 0) return <p className="rounded-lg border border-ok bg-ok-soft p-3 text-sm text-ok">✓ لا توجد تنبيهات مفتوحة</p>;
  const style = { critical: "border-critical bg-critical-soft", warning: "border-warn bg-warn-soft", info: "border-info bg-info-soft" };
  const icon = { critical: "⛔ حرج", warning: "⚠ تحذير", info: "ℹ معلومة" };
  return (
    <div className="space-y-2" role="alert">
      {alerts.map((a) => (
        <div key={a.id ?? a.rule} className={`rounded-lg border p-3 text-sm ${style[a.severity]}`}>
          <span className="font-bold">{icon[a.severity]}</span> <span className="ltr-nums text-xs">{a.rule}</span>
          <p className="mt-1">{a.message}</p>
          <p className="mt-1 text-xs text-muted">
            القيمة <span className="ltr-nums">{a.value <= 1 ? fmtPct(a.value) : a.value}</span> · الحد{" "}
            <span className="ltr-nums">{a.threshold <= 1 ? fmtPct(a.threshold) : a.threshold}</span> · العينة{" "}
            <span className="ltr-nums">{a.sampleSize}</span> · منذ {fmtTime(a.createdAt)}
            {a.simulated && " · (عطل تجريبي)"}
          </p>
        </div>
      ))}
    </div>
  );
}

function Tile(props: { title: string; value: string; n: number; sufficient: boolean; hint: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4" title={props.hint}>
      <p className="text-xs text-muted">{props.title}</p>
      <p className="ltr-nums mt-2 text-2xl font-bold">{props.sufficient ? props.value : <span className="text-base text-muted">بيانات غير كافية</span>}</p>
      <p className="mt-1 text-xs text-muted">
        {props.detail && props.sufficient ? `${props.detail} · ` : ""}n = <span className="ltr-nums">{props.n}</span>
      </p>
      <p className="mt-2 text-xs text-muted">{props.hint}</p>
    </div>
  );
}

function Card({ title, hint, n, children }: { title: string; hint?: string; n?: number; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="font-bold">
        {title} {n !== undefined && <span className="ltr-nums text-xs font-normal text-muted">n = {n}</span>}
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
      <summary className="cursor-pointer text-muted">عرض كجدول</summary>
      <table className="mt-2 w-full tabular-nums">
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
  return <p className="py-8 text-center text-sm text-muted">لا توجد بيانات في هذه الفترة</p>;
}

function TraceView({ trace, onClose }: { trace: Trace; onClose: () => void }) {
  const r = trace.run;
  return (
    <section className="rounded-lg border-2 border-brand bg-surface p-4" aria-label="تتبع الطلب">
      <div className="flex items-center gap-2">
        <h2 className="font-bold">تتبع التشغيل</h2>
        <span className="ltr-nums text-xs text-muted">{r.id}</span>
        <button onClick={onClose} className="ms-auto rounded border border-border px-2 py-0.5 text-xs">
          إغلاق
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Kv k="الطلب" v={`#${r.orderId}`} />
        <Kv k="الحالة" v={STATUS_LABEL[r.status] ?? r.status} />
        <Kv k="الكرتون / الاستراتيجية" v={`${r.cartonId ?? "—"} / ${r.strategy ?? "—"}`} />
        <Kv k="الزمن (استخراج / ترتيب / كلي)" v={`${fmtMs(r.extractMs)} / ${fmtMs(r.packMs)} / ${fmtMs(r.totalMs)}`} />
        <Kv k="المرشحون المفحوصون" v={String(r.candidatesChecked)} />
        <Kv k="رفض الـ Validator" v={String(r.validatorRejections)} />
        <Kv k="tokens / التكلفة" v={`${r.tokensTotal} / ${fmtUsd(r.costUsd)}`} />
        <Kv k="الإصدار" v={`${r.engineVersion} · prompt ${r.promptVersion}`} />
      </dl>
      {r.attempts.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          الكراتين: {r.attempts.map((a) => `${a.cartonId} ${OUTCOME_LABEL[a.outcome] ?? a.outcome}`).join(" · ")}
        </p>
      )}
      <h3 className="mt-4 text-sm font-bold">استدعاءات Gemini ({trace.extractions.length})</h3>
      {trace.extractions.length === 0 ? (
        <p className="text-xs text-muted">كل المنتجات من الكاش.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs">
          {trace.extractions.map((e) => (
            <li key={e.id} className="rounded border border-border p-2">
              <span className="font-medium">{e.productId}</span> · {e.status} · {fmtMs(e.latencyMs)} · in {e.inputTokens} / out {e.outputTokens}
              {e.errorCode && <span className="text-critical"> · {e.errorCode}</span>}
              {e.dimsSource && <span> · {SOURCE_LABEL[e.dimsSource]}</span>}
              {e.errorMessage && <p className="mt-0.5 text-muted">{e.errorMessage}</p>}
            </li>
          ))}
        </ul>
      )}
      {trace.corrections.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-bold">تصحيحات الموظف ({trace.corrections.length})</h3>
          <ul className="mt-1 text-xs">
            {trace.corrections.map((c) => (
              <li key={c.id}>
                {c.productId} · {c.field}: {c.oldValue ?? "—"} → {c.newValue} ({c.priorOrigin})
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="ltr-nums">{v}</dd>
    </div>
  );
}
