import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { isLocalBackend } from "@/lib/env";
import { repoOrError } from "@/lib/http";
import { loadEval, type EvalView } from "@/lib/monitoring/evaluation";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/PageHeader";
import { fmtMs, fmtTime, ltr } from "@/lib/ui/format";

export const metadata: Metadata = { title: "الدقة" };

type Fmt = "pct" | "num" | "ms" | "usd" | "sar" | "text";
const PACKING_ROWS: Array<[string, string, Fmt]> = [
  ["engineValidity", "ترتيبات رصّة الصحيحة (المطلوب 100%)", "pct"],
  ["knownFeasibleRecall", "الحالات المحكمة التي وجدت رصّة لها حلاً (المطلوب 100%)", "pct"],
  ["impossibleFalseClaims", "مرات قالت فيها رصّة إن طلباً مستحيلاً يدخل الكرتون (المطلوب 0)", "num"],
  ["baselineInvalidRate", "ترتيبات الطريقة البسيطة المقارَنة التي خالفت قاعدة تغليف", "pct"],
  ["engineOnlyValid", "حالات نجحت فيها رصّة وأخفقت الطريقة البسيطة", "num"],
  ["meanCostSavingSar", "متوسط التوفير مقابل الطريقة البسيطة (للطلب، في الحالات الصحيحة عند الطرفين)", "sar"],
  ["runtimeP50Ms", "زمن البحث المعتاد عن ترتيب (النصف الأسرع من الحالات)", "ms"],
  ["runtimeP95Ms", "زمن البحث الذي تنتهي خلاله 95% من الحالات", "ms"],
];
const EXTRACTION_ROWS: Array<[string, string, Fmt]> = [
  ["dimAccuracy1cm", "دقة الأبعاد المكتوبة في الصفحة (خطأ لا يزيد على 1 سم)", "pct"],
  ["weightAccuracy10pct", "دقة الوزن المكتوب في الصفحة (خطأ لا يزيد على 10%)", "pct"],
  ["inferredDimMape", "متوسط نسبة الخطأ في الأبعاد التي تقدّرها رصّة (ولذلك نضيف هامش أمان)", "pct"],
  ["inferredWeightMape", "متوسط نسبة الخطأ في الأوزان التي تقدّرها رصّة", "pct"],
  ["honestyRate", "قول «غير معروف» بدل اختراع رقم", "pct"],
  ["fragileRecall", "اكتشاف المنتجات القابلة للكسر (من بين القابل للكسر فعلاً)", "pct"],
  ["fragilePrecision", "صحة وسم «قابل للكسر» (من بين ما وُسم به)", "pct"],
  ["liquidAccuracy", "دقة اكتشاف السوائل", "pct"],
  ["sourceCorrectness", "صحة تحديد مصدر المقاس (مكتوب في الصفحة أم تقدير)", "pct"],
  ["parseSuccess", "ردود الخدمة الصالحة للاستخدام", "pct"],
  ["avgLatencyMs", "متوسط زمن قراءة منتج واحد", "ms"],
  ["costPerProductUsd", "تكلفة قراءة المنتج الواحد", "usd"],
];

function fmt(v: unknown, f: Fmt): string {
  if (v === null || v === undefined) return "—";
  if (typeof v !== "number") return String(v);
  if (f === "pct") return ltr(`${Math.round(v * 1000) / 10}%`);
  if (f === "ms") return fmtMs(v);
  if (f === "usd") return ltr(`$${v.toFixed(5)}`);
  if (f === "sar") return `${ltr(String(Math.round(v * 100) / 100))} ر.س`;
  return ltr(String(v));
}

export default function EvaluationPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="الدقة">
        نتائج رصّة على حالات نعرف إجابتها الصحيحة.
      </PageHeader>
      <Suspense fallback={<TableSkeleton rows={8} />}>
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
        title="دقة ترتيب القطع في الكرتون (60 حالة، مقارنةً بطريقة بسيطة)"
        command="npm run eval:packing"
        view={packing}
        rows={PACKING_ROWS}
        version={(run) => run.engineVersion ?? ""}
      />
      <EvalCard
        title="دقة قراءة بيانات المنتجات (30 منتجاً)"
        command="npm run eval:extraction"
        view={extraction}
        rows={EXTRACTION_ROWS}
        pick={(s) => (s.all as Record<string, unknown>) ?? s}
        holdout={(s) => (s.holdout as Record<string, unknown>) ?? null}
        version={(run) => `${run.model ?? ""} · ${run.promptVersion ?? ""}`}
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
      <section className="panel p-4 sm:p-5">
        <h2 className="text-lg font-bold leading-7">{props.title}</h2>
        <div className="mt-3">
          <EmptyState title="لم يُجرَ هذا الاختبار بعد">
            يشغّله الفريق التقني بالأمر <code className="ltr-nums rounded bg-background px-1">{props.command}</code>.
          </EmptyState>
        </div>
      </section>
    );
  }
  const pick = props.pick ?? ((s) => s);
  const latest = pick(view.latest.summary);
  const previous = view.previous ? pick(view.previous.summary) : null;
  const holdout = props.holdout ? props.holdout(view.latest.summary) : null;
  const failed = view.results.filter((r) => r.passed === false);

  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-lg font-bold leading-7">{props.title}</h2>
      <p className="mt-1 text-sm text-muted">آخر اختبار: {fmtTime(view.latest.createdAt)}</p>
      <div className="table-scroll mt-4 rounded-lg border border-border">
        <table className={`w-full text-sm ${holdout || previous ? "min-w-[460px]" : ""} [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:py-2.5`}>
          <thead className="bg-background text-xs text-muted">
            <tr className="border-b border-border">
              <th className="text-start font-medium">ما الذي نقيسه</th>
              <th className="text-start font-medium">نتيجة آخر اختبار</th>
              {holdout && (
                <th className="text-start font-medium" title="حالات محجوزة لم تُستخدم في تحسين رصّة، فهي أصدق مقياس">
                  الحالات المحجوزة
                </th>
              )}
              {previous && <th className="text-start font-medium">الاختبار السابق</th>}
            </tr>
          </thead>
          <tbody>
            {props.rows.map(([key, label, f]) => (
              <tr key={key} className="border-b border-border last:border-0">
                <td className="min-w-[10rem] max-w-[13.5rem] leading-6 sm:max-w-[28rem]">{label}</td>
                <td className="whitespace-nowrap text-base font-bold">{fmt(latest[key], f)}</td>
                {holdout && <td className="whitespace-nowrap">{fmt(holdout[key], f)}</td>}
                {previous && <td className="whitespace-nowrap text-muted">{fmt(previous[key], f)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">
          الحالات التي لم تنجح (<span className="ltr-nums">{failed.length}</span> من <span className="ltr-nums">{view.results.length}</span>)
        </summary>
        <ul className="mt-2 space-y-1.5 text-xs">
          {failed.length === 0 && <li className="text-muted">لا توجد حالات فاشلة.</li>}
          {failed.map((r) => (
            <li key={r.caseId} className="ltr-nums rounded border border-border p-2" dir="ltr">
              <span className="font-medium">{r.caseId}</span> {JSON.stringify(r.details).slice(0, 220)}
            </li>
          ))}
        </ul>
      </details>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted">تفاصيل تقنية</summary>
        <p className="mt-2 text-muted" dir="ltr">
          {props.version(view.latest)} · {view.source === "database" ? "database" : "eval/results"} · {props.command}
        </p>
      </details>
    </section>
  );
}
