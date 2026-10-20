"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DataSource } from "@/lib/engine/types";
import { fmtDims, fmtTime, fmtWeight, ORIGIN_LABEL, SOURCE_LABEL } from "@/lib/ui/format";
import { FlagChips, SourceBadge } from "./Badges";
import FactsForm from "./FactsForm";

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
    if (!res.ok) return (data as { error?: string }).error ?? `HTTP ${res.status}`;
    router.refresh();
    return null;
  }

  const filters: Array<[Filter, string]> = [
    ["all", "الكل"],
    ["page", SOURCE_LABEL.page],
    ["inferred", SOURCE_LABEL.inferred],
    ["manual", SOURCE_LABEL.manual],
    ["unknown", SOURCE_LABEL.unknown],
    ["none", "لم يُستخرج بعد"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="تصفية حسب المصدر">
        {filters.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 ${filter === k ? "border-brand bg-brand text-brand-contrast" : "border-border"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {message && <p className="text-sm text-critical">{message}</p>}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[820px] text-sm [&_td]:px-2 [&_th]:px-2">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="p-2 text-start">المنتج</th>
              <th className="text-start">الأبعاد</th>
              <th className="text-start">الوزن</th>
              <th className="text-start">التعامل</th>
              <th className="text-start">المصدر</th>
              <th className="text-start">الأصل</th>
              <th className="text-start">آخر استخراج</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.productId} className="border-b border-border align-top last:border-0">
                <td className="p-2">
                  <span className="font-medium">{r.name}</span> <span className="ltr-nums text-xs text-muted">{r.productId}</span>
                  {r.facts?.evidence && <p className="mt-0.5 max-w-xs text-xs text-muted">«{r.facts.evidence}»</p>}
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
                <td className="ltr-nums">{r.facts ? fmtDims([r.facts.lengthCm, r.facts.widthCm, r.facts.heightCm]) : "—"}</td>
                <td className="ltr-nums">{r.facts ? fmtWeight(r.facts.weightG) : "—"}</td>
                <td>{r.facts ? <FlagChips {...r.facts} /> : "—"}</td>
                <td>{r.facts ? <SourceBadge source={r.facts.dimsSource} /> : <span className="text-xs text-muted">لم يُستخرج</span>}</td>
                <td className="text-xs">
                  {r.facts ? ORIGIN_LABEL[r.facts.origin] ?? r.facts.origin : "—"}
                  {r.facts?.stale && <p className="text-warn">النص تغيّر</p>}
                </td>
                <td className="ltr-nums text-xs text-muted">{fmtTime(r.facts?.extractedAt)}</td>
                <td className="whitespace-nowrap p-2 text-xs">
                  <button onClick={() => setEditing(editing === r.productId ? null : r.productId)} className="text-brand underline">
                    {r.facts && r.facts.dimsSource !== "unknown" ? "تعديل" : "قياس"}
                  </button>
                  {demoMode && (
                    <>
                      <button
                        disabled={busy === r.productId}
                        onClick={async () => setMessage(await call(r.productId, `/api/products/${r.productId}/extract`, "POST"))}
                        className="ms-3 text-muted underline disabled:opacity-50"
                      >
                        {busy === r.productId ? "…" : "إعادة استخراج"}
                      </button>
                      {r.facts && (
                        <button
                          disabled={busy === r.productId}
                          onClick={async () => setMessage(await call(r.productId, `/api/products/${r.productId}/facts`, "DELETE"))}
                          className="ms-3 text-muted underline disabled:opacity-50"
                        >
                          مسح الكاش
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
