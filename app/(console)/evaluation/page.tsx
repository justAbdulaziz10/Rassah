import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { isLocalBackend } from "@/lib/env";
import { repoOrError } from "@/lib/http";
import { loadEval, type EvalView } from "@/lib/monitoring/evaluation";
import { fmtTime } from "@/lib/ui/format";

export const metadata: Metadata = { title: "التقييم" };

type Fmt = "pct" | "num" | "ms" | "usd" | "text";
const PACKING_ROWS: Array<[string, string, Fmt]> = [
  ["engineValidity", "صحة ترتيبات المحرك (يجب 100%)", "pct"],
  ["knownFeasibleRecall", "إيجاد حل للحالات المضمونة (تعبئة 100%)", "pct"],
  ["impossibleFalseClaims", "ادعاءات خاطئة على حالات مستحيلة (يجب 0)", "num"],
  ["baselineInvalidRate", "ترتيبات الـ Baseline البسيط المرفوضة", "pct"],
  ["engineOnlyValid", "حالات صحيحة بالمحرك وغلط بالـ Baseline", "num"],
  ["meanCostSavingSar", "متوسط التوفير مقابل الـ Baseline (ر.س، حالات صحيحة للطرفين)", "num"],
  ["runtimeP50Ms", "زمن البحث p50", "ms"],
  ["runtimeP95Ms", "زمن البحث p95", "ms"],
];
const EXTRACTION_ROWS: Array<[string, string, Fmt]> = [
  ["dimAccuracy1cm", "دقة الأبعاد ±1 سم (مكتوبة في الصفحة)", "pct"],
  ["weightAccuracy10pct", "دقة الوزن ±10% (مكتوب في الصفحة)", "pct"],
  ["inferredDimMape", "خطأ تقدير الأبعاد (MAPE) يبرر هامش الأمان", "pct"],
  ["inferredWeightMape", "خطأ تقدير الوزن (MAPE)", "pct"],
  ["honestyRate", "الأمانة: «غير معروف» بدل اختراع رقم", "pct"],
  ["fragileRecall", "اكتشاف القابل للكسر (Recall)", "pct"],
  ["fragilePrecision", "دقة وسم القابل للكسر (Precision)", "pct"],
  ["liquidAccuracy", "دقة السوائل", "pct"],
  ["sourceCorrectness", "صحة مصدر المعلومة", "pct"],
  ["parseSuccess", "ردود صالحة", "pct"],
  ["avgLatencyMs", "متوسط الزمن", "ms"],
  ["costPerProductUsd", "التكلفة لكل منتج", "usd"],
];

function fmt(v: unknown, f: Fmt): string {
  if (v === null || v === undefined) return "—";
  if (typeof v !== "number") return String(v);
  if (f === "pct") return `${Math.round(v * 1000) / 10}%`;
  if (f === "ms") return `${v} ms`;
  if (f === "usd") return `$${v.toFixed(5)}`;
  return String(v);
}

export default function EvaluationPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">التقييم</h1>
        <p className="mt-1 text-muted">
          قياس على بيانات ثابتة بإجابات معروفة، منفصل عن المراقبة الحية. <strong>البيانات اصطناعية</strong> كتبها الفريق بأسلوب صفحات المتاجر
          السعودية. الإجابات الصحيحة صاغها الذكاء الاصطناعي من الأوصاف، ومراجعتها المستقلة من عضو آخر في الفريق لم تكتمل بعد.
        </p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-border/50" />}>
        <Evals />
      </Suspense>
    </div>
  );
}

async function Evals() {
  await connection();
  const r = repoOrError();
  const repo = r instanceof Response ? null : r;
  const allowFiles = isLocalBackend() || !repo;
  const [packing, extraction] = await Promise.all([loadEval(repo, "packing", allowFiles), loadEval(repo, "extraction", allowFiles)]);
  return (
    <>
      <EvalCard
        title="تقييم الترتيب: المحرك مقابل Baseline بسيط (60 حالة)"
        command="npm run eval:packing"
        view={packing}
        rows={PACKING_ROWS}
        version={(run) => run.engineVersion ?? ""}
      />
      <EvalCard
        title="تقييم استخراج Gemini (30 منتج)"
        command="npm run eval:extraction"
        view={extraction}
        rows={EXTRACTION_ROWS}
        pick={(s) => (s.all as Record<string, unknown>) ?? s}
        holdout={(s) => (s.holdout as Record<string, unknown>) ?? null}
        version={(run) => `${run.model ?? ""} · prompt ${run.promptVersion ?? ""}`}
      />
    </>
  );
}

function EvalCard(props: {
  title: string;
  command: string;
  view: EvalView;
  rows: Array<[string, string, Fmt]>;
  version: (run: NonNullable<EvalView["latest"]>) => string;
  pick?: (s: Record<string, unknown>) => Record<string, unknown>;
  holdout?: (s: Record<string, unknown>) => Record<string, unknown> | null;
}) {
  const { view } = props;
  if (!view.latest) {
    return (
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="font-bold">{props.title}</h2>
        <p className="mt-2 text-sm text-muted">
          لا توجد نتائج بعد. شغّل <code className="ltr-nums rounded bg-background px-1">{props.command}</code>.
        </p>
      </section>
    );
  }
  const pick = props.pick ?? ((s) => s);
  const latest = pick(view.latest.summary);
  const previous = view.previous ? pick(view.previous.summary) : null;
  const holdout = props.holdout ? props.holdout(view.latest.summary) : null;
  const failed = view.results.filter((r) => r.passed === false);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="font-bold">{props.title}</h2>
      <p className="mt-1 text-xs text-muted">
        آخر تشغيل {fmtTime(view.latest.createdAt)} · <span className="ltr-nums">{props.version(view.latest)}</span> · المصدر:{" "}
        {view.source === "database" ? "قاعدة البيانات" : "ملفات eval/results"}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm tabular-nums [&_td]:px-2 [&_th]:px-2">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="py-2 text-start">المؤشر</th>
              <th className="text-start">آخر تشغيل</th>
              {holdout && <th className="text-start">بيانات الاختبار المحجوزة</th>}
              {previous && <th className="text-start">التشغيل السابق</th>}
            </tr>
          </thead>
          <tbody>
            {props.rows.map(([key, label, f]) => (
              <tr key={key} className="border-b border-border last:border-0">
                <td className="py-2">{label}</td>
                <td className="ltr-nums font-medium">{fmt(latest[key], f)}</td>
                {holdout && <td className="ltr-nums">{fmt(holdout[key], f)}</td>}
                {previous && <td className="ltr-nums text-muted">{fmt(previous[key], f)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">
          الحالات اللي ما نجحت (<span className="ltr-nums">{failed.length}</span> من <span className="ltr-nums">{view.results.length}</span>)
        </summary>
        <ul className="mt-2 space-y-1 text-xs">
          {failed.map((r) => (
            <li key={r.caseId} className="ltr-nums rounded border border-border p-2" dir="ltr">
              <span className="font-medium">{r.caseId}</span> {JSON.stringify(r.details).slice(0, 220)}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
