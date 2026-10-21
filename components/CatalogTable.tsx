"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DataSource } from "@/lib/engine/types";
import { fmtApiError, fmtDims, fmtTime, fmtWeight, ORIGIN_LABEL, SOURCE_HINT, SOURCE_LABEL } from "@/lib/ui/format";
import { FlagChips, SourceBadge } from "./Badges";
import FactsForm from "./FactsForm";
import { EmptyState, Notice } from "./PageHeader";

export interface CatalogRow {
  productId: string;
  name: string;
  category: string | null;
  facts: {
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
    weightG: number | null;
    dimsSource: DataSource;
    weightSource: DataSource;
    fragile: boolean;
    liquid: boolean;
    sensitive: boolean;
    confidence: string | null;
    evidence: string | null;
    origin: string;
    extractedAt: string | null;
    stale: boolean;
  } | null;
}

type Filter = "all" | DataSource | "none";

export default function CatalogTable({ rows, demoMode }: { rows: CatalogRow[]; demoMode: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const visible = useMemo(
    () => rows.filter((r) => filter === "all" || (filter === "none" ? !r.facts : r.facts?.dimsSource === filter)),
    [rows, filter],
  );

  async function call(productId: string, url: string, method: string, body?: unknown) {
    setBusy(productId);
    setMessage(null);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return fmtApiError((data as { error?: string }).error ?? `HTTP ${res.status}`);
    router.refresh();
    return null;
  }

  const filters: Array<[Filter, string]> = [
    ["all", "الكل"],
    ["page", SOURCE_LABEL.page],
    ["inferred", SOURCE_LABEL.inferred],
    ["manual", SOURCE_LABEL.manual],
    ["unknown", SOURCE_LABEL.unknown],
    ["none", "لم تُقرأ بعد"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm" role="group" aria-label="تصفية حسب مصدر المقاس">
        <span className="shrink-0 text-muted">مصدر المقاس:</span>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
          {filters.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 transition-colors ${filter === k ? "border-brand bg-brand font-medium text-brand-contrast" : "border-border bg-surface hover:border-brand"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {message && <Notice tone="critical">{message}</Notice>}
      <p className="text-xs text-muted md:hidden">اسحب الجدول جانباً لرؤية بقية الأعمدة.</p>
      <div className="table-scroll panel">
        <table className="w-full min-w-[900px] text-sm [&_td]:px-3 [&_td]:py-3.5 [&_th]:px-3 [&_th]:py-3">
          <thead className="bg-background text-xs text-muted">
            <tr className="border-b border-border">
              <th className="sticky start-0 z-10 bg-background text-start font-medium">المنتج</th>
              <th className="text-start font-medium">
                المقاس (سم)
                <span className="block text-[11px] font-normal">الطول × العرض × الارتفاع</span>
              </th>
              <th className="text-start font-medium">الوزن</th>
              <th className="text-start font-medium">تنبيهات التغليف</th>
              <th className="text-start font-medium" title="هل المقاس مكتوب في الصفحة، أم تقدير، أم قياس يدوي؟">
                مصدر المقاس
              </th>
              <th className="text-start font-medium" title="من أنتج هذه البيانات: رصّة بالذكاء الاصطناعي، أم موظف، أم بيانات تجريبية؟">
                من أدخل البيانات
              </th>
              <th className="text-start font-medium">آخر قراءة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.productId} className="group/row border-b border-border align-top last:border-0 hover:bg-background/60">
                <td className={`min-w-[190px] sm:min-w-[230px] ${editing === r.productId ? "" : "sticky start-0 z-10 bg-surface group-hover/row:bg-background"}`}>
                  <span className="font-medium">{r.name}</span> <span className="ltr-nums inline-block whitespace-nowrap text-xs text-muted" title="رمز المنتج">{r.productId}</span>
                  {r.facts?.evidence && <p className="mt-1 max-w-xs text-xs leading-5 text-muted">«{r.facts.evidence}»</p>}
                  {editing === r.productId && (
                    <div className="mt-2 min-w-[520px]">
                      <FactsForm
                        mode={r.facts && r.facts.dimsSource !== "unknown" ? "edit" : "measure"}
                        submitLabel="حفظ"
                        initial={{
                          lengthCm: r.facts?.lengthCm ?? null,
                          widthCm: r.facts?.widthCm ?? null,
                          heightCm: r.facts?.heightCm ?? null,
                          weightG: r.facts?.weightG ?? null,
                          fragile: r.facts?.fragile ?? false,
                          liquid: r.facts?.liquid ?? false,
                          sensitive: r.facts?.sensitive ?? false,
                        }}
                        onSubmit={async (changes) => {
                          const err = await call(r.productId, `/api/products/${r.productId}/facts`, "PATCH", { changes });
                          if (!err) setEditing(null);
                          return err;
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap">{r.facts ? fmtDims([r.facts.lengthCm, r.facts.widthCm, r.facts.heightCm]) : "—"}</td>
                <td className="whitespace-nowrap">{r.facts ? fmtWeight(r.facts.weightG) : "—"}</td>
                <td>{r.facts ? <FlagChips {...r.facts} /> : "—"}</td>
                <td>
                  {r.facts ? (
                    <SourceBadge source={r.facts.dimsSource} title={SOURCE_HINT[r.facts.dimsSource]} />
                  ) : (
                    <span className="text-xs text-muted">لم تُقرأ بعد</span>
                  )}
                </td>
                <td className="text-xs">
                  {r.facts ? ORIGIN_LABEL[r.facts.origin] ?? r.facts.origin : "—"}
                  {r.facts?.stale && <p className="mt-0.5 text-warn">وصف المنتج تغيّر بعد القراءة</p>}
                </td>
                <td className="text-xs text-muted">{r.facts?.extractedAt ? fmtTime(r.facts.extractedAt) : "—"}</td>
                <td className="whitespace-nowrap text-xs">
                  <button onClick={() => setEditing(editing === r.productId ? null : r.productId)} className="rounded px-1.5 py-1 font-medium text-brand underline underline-offset-4 hover:bg-brand/10">
                    {r.facts && r.facts.dimsSource !== "unknown" ? "تعديل" : "إدخال القياس"}
                  </button>
                  {demoMode && (
                    <>
                      <button
                        disabled={busy === r.productId}
                        onClick={async () => setMessage(await call(r.productId, `/api/products/${r.productId}/extract`, "POST"))}
                        title="تقرأ رصّة صفحة المنتج من جديد بالذكاء الاصطناعي. لا تستبدل ما قاسه موظف يدوياً."
                        className="ms-2 rounded px-1.5 py-1 text-muted underline underline-offset-4 hover:bg-border/40 disabled:opacity-50"
                      >
                        {busy === r.productId ? "جارٍ القراءة…" : "إعادة القراءة"}
                      </button>
                      {r.facts && (
                        <button
                          disabled={busy === r.productId}
                          onClick={async () => setMessage(await call(r.productId, `/api/products/${r.productId}/facts`, "DELETE"))}
                          title="يحذف البيانات المحفوظة لهذا المنتج، فتُقرأ من جديد عند أول طلب يحتويه."
                          className="ms-2 rounded px-1.5 py-1 text-muted underline underline-offset-4 hover:bg-border/40 disabled:opacity-50"
                        >
                          حذف البيانات المحفوظة
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="p-4">
            <EmptyState title="لا توجد منتجات بهذا المصدر">اختر «الكل» لعرض كل المنتجات.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
