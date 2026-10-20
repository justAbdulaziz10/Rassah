"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PackItemView, PackResponse } from "@/lib/pipeline/pack";
import { fmtDims, fmtMs, fmtNum, fmtSar, fmtWeight, OUTCOME_LABEL, STATUS_LABEL } from "@/lib/ui/format";
import { FlagChips, SourceBadge, StatusPill } from "./Badges";
import FactsForm, { type FactsFormValues } from "./FactsForm";

// WebGL needs the browser; show the written instructions while it loads.
const PackingView3D = dynamic(() => import("./PackingView3D"), {
  ssr: false,
  loading: () => <p className="rounded-lg border border-border bg-surface p-6 text-center text-muted">جاري تحميل العرض ثلاثي الأبعاد…</p>,
});

type State = { kind: "loading" } | { kind: "done"; data: PackResponse } | { kind: "failed"; message: string };

async function postJson(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function PackRunner({ orderId, simulateOutage }: { orderId: string; simulateOutage: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const started = useRef(false);

  const pack = useCallback(async () => {
    setState({ kind: "loading" });
    setConfirmed(false);
    setEditing(null);
    try {
      const { data, status } = await postJson(`/api/orders/${encodeURIComponent(orderId)}/pack`, simulateOutage ? { simulateOutage: true } : {});
      if (data && typeof data === "object" && "runId" in data) setState({ kind: "done", data: data as PackResponse });
      else setState({ kind: "failed", message: (data as { error?: string }).error ?? `HTTP ${status}` });
    } catch {
      setState({ kind: "failed", message: "تعذر الاتصال بالخادم" });
    }
  }, [orderId, simulateOutage]);

  useEffect(() => {
    // Guard against React's dev double-invocation creating two runs.
    if (started.current) return;
    started.current = true;
    void pack();
  }, [pack]);

  if (state.kind === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-24 animate-pulse rounded-lg bg-border/50" />
        <div className="h-64 animate-pulse rounded-lg bg-border/50" />
        <p className="text-sm text-muted">نقرأ المنتجات ونرتب الطلب…</p>
      </div>
    );
  }
  if (state.kind === "failed") {
    return (
      <div className="rounded-lg border border-critical bg-critical-soft p-4">
        <p className="font-medium text-critical">{state.message}</p>
        <button onClick={pack} className="mt-3 rounded bg-brand px-3 py-1.5 text-brand-contrast">
          حاول مرة ثانية
        </button>
      </div>
    );
  }

  const d = state.data;
  const itemsByProduct = new Map<string, PackItemView>();
  for (const it of d.items) if (!itemsByProduct.has(it.productId)) itemsByProduct.set(it.productId, it);

  async function saveFacts(productId: string, changes: Partial<FactsFormValues>, viaRun: boolean) {
    const res = viaRun
      ? await postJson(`/api/runs/${d.runId}/action`, { action: "edit", productId, changes })
      : await postJson(`/api/products/${productId}/facts`, { changes, runId: d.runId }, "PATCH");
    if (!res.ok) return (res.data as { error?: string }).error ?? "تعذر الحفظ";
    await pack(); // re-pack with the corrected facts
    return null;
  }

  async function confirm() {
    const res = await postJson(`/api/runs/${d.runId}/action`, { action: "confirm" });
    if (res.ok) setConfirmed(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">الطلب #{d.orderId}</h1>
            <StatusPill status={d.status} label={STATUS_LABEL[d.status] ?? d.status} />
          </div>
          {d.carton && (
            <p className="mt-2 text-3xl font-bold text-brand">
              كرتون {d.carton.name} <span className="ltr-nums text-lg font-normal text-muted">{fmtDims(d.carton.innerCm)}</span>
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            <span className="ltr-nums">{d.cache.hits}</span> من الكاش · <span className="ltr-nums">{d.cache.misses}</span> استُخرج بالـ AI ·{" "}
            <span className="ltr-nums">{fmtMs(d.timings.totalMs)}</span>
            {!d.monitoring.saved && <span className="ms-2 rounded bg-warn-soft px-1.5 py-0.5 text-warn">المراقبة متعطلة جزئياً</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={pack} className="rounded border border-border px-3 py-1.5 text-sm">
            إعادة التجهيز
          </button>
          {d.status === "box_found" &&
            (confirmed ? (
              <span className="rounded bg-ok-soft px-3 py-1.5 text-sm text-ok">✓ تم التأكيد</span>
            ) : (
              <button onClick={confirm} className="rounded bg-brand px-4 py-1.5 text-sm font-medium text-brand-contrast">
                تأكيد التغليف
              </button>
            ))}
        </div>
      </section>

      {d.status === "needs_measurement" && (
        <section className="space-y-3 rounded-lg border border-warn bg-warn-soft/40 p-4">
          <h2 className="font-bold text-warn">لازم نقيس هالمنتجات مرة وحدة</h2>
          <p className="text-sm">
            ما نقدر نرتب الطلب بأرقام مخمّنة. قس كل منتج مرة وحدة، وينحفظ للطلبات الجاية.
          </p>
          {d.productsToMeasure.map((p) => (
            <div key={p.productId} className="space-y-2">
              <p className="font-medium">
                {p.name} <span className="text-xs text-muted">({p.productId})</span>
                {p.failedExtraction && <span className="ms-2 text-xs text-critical">تعذّر الاستخراج الآلي</span>}
              </p>
              <FactsForm
                mode="measure"
                submitLabel="حفظ القياس وإعادة التجهيز"
                initial={{ lengthCm: null, widthCm: null, heightCm: null, weightG: null, fragile: false, liquid: false, sensitive: false }}
                onSubmit={(c) => saveFacts(p.productId, c, false)}
              />
            </div>
          ))}
        </section>
      )}

      {d.status === "no_box" && (
        <section className="rounded-lg border border-critical bg-critical-soft/40 p-4">
          <h2 className="font-bold text-critical">لا يوجد كرتون مناسب ضمن وقت البحث</h2>
          <p className="mt-1 text-sm">هذا لا يعني أن الترتيب مستحيل حتماً. البحث محدود بالوقت. أسباب كل كرتون:</p>
          <ul className="mt-2 grid gap-1 text-sm">
            {d.attempts.map((a) => (
              <li key={a.cartonId}>
                <span className="font-medium">{a.cartonId}</span>: {OUTCOME_LABEL[a.outcome] ?? a.outcome}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(d.status === "error" || d.status === "not_found") && (
        <section className="rounded-lg border border-critical bg-critical-soft/40 p-4">
          <h2 className="font-bold text-critical">{STATUS_LABEL[d.status]}</h2>
          {d.errorMessage && <p className="mt-1 text-sm">{d.errorMessage}</p>}
        </section>
      )}

      {d.status === "box_found" && d.carton && (
        <>
          <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-3">
              <h2 className="font-bold">تعليمات التغليف</h2>
              <ol className="space-y-2">
                {d.instructions.map((s) => (
                  <li key={s.step} className="rounded-md border border-border bg-surface p-3">
                    <div className="flex gap-2">
                      <span className="ltr-nums flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs text-brand-contrast">
                        {s.step}
                      </span>
                      <span>{s.text}</span>
                    </div>
                    {s.notes.length > 0 && (
                      <ul className="mt-1 ms-8 list-disc space-y-0.5 text-sm text-muted">
                        {s.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </div>
            <div className="space-y-3">
              <h2 className="font-bold">العرض ثلاثي الأبعاد</h2>
              <PackingView3D
                inner={d.carton.innerCm}
                items={d.items.map((it) => ({
                  unitId: it.unitId,
                  name: it.name,
                  fragile: it.facts.fragile,
                  liquid: it.facts.liquid,
                  sensitive: it.facts.sensitive,
                  estimated: it.marginApplied,
                  placement: it.placement,
                }))}
              />
            </div>
          </section>

          {d.cost && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="font-bold">
                التكلفة التقديرية <span className="text-xs font-normal text-muted">(أسعار تجريبية، ليست أسعار شركة شحن)</span>
              </h2>
              <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <Stat label="الكرتون" value={fmtSar(d.cost.cartonSar)} />
                <Stat label="الوزن الفعلي" value={`${fmtNum(d.cost.actualKg, 2)} كجم`} />
                <Stat label="الوزن الحجمي" value={`${fmtNum(d.cost.volumetricKg, 2)} كجم`} />
                <Stat label="الشحن" value={fmtSar(d.cost.shippingSar)} />
                <Stat label="الإجمالي" value={fmtSar(d.cost.totalSar)} strong />
              </dl>
            </section>
          )}
        </>
      )}

      {/* Products: what the AI found, where each value came from, and corrections. */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="font-bold">المنتجات</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="text-start text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 text-start">المنتج</th>
                <th className="text-start">الكمية</th>
                <th className="text-start">الأبعاد</th>
                <th className="text-start">الوزن</th>
                <th className="text-start">التعامل</th>
                <th className="text-start">المصدر</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => {
                const it = itemsByProduct.get(l.productId);
                const f = it?.facts;
                return (
                  <tr key={l.productId} className="border-b border-border align-top last:border-0">
                    <td className="py-2">
                      {l.name}
                      {f?.evidence && <p className="mt-0.5 max-w-xs text-xs text-muted">«{f.evidence}»</p>}
                    </td>
                    <td className="ltr-nums">{l.qty}</td>
                    <td className="ltr-nums">
                      {f ? fmtDims([f.lengthCm, f.widthCm, f.heightCm]) : "—"}
                      {it && (it.marginApplied || it.paddingApplied) && (
                        <p className="text-xs text-muted">
                          للترتيب: {fmtDims(it.effectiveCm)}
                          {it.marginApplied ? " (+15% هامش)" : ""}
                          {it.paddingApplied ? " (+حماية)" : ""}
                        </p>
                      )}
                    </td>
                    <td className="ltr-nums">{f ? fmtWeight(f.weightG) : "—"}</td>
                    <td>{f ? <FlagChips {...f} /> : "—"}</td>
                    <td>
                      <SourceBadge source={l.dimsSource} />
                    </td>
                    <td>
                      {f && d.status === "box_found" && (
                        <button onClick={() => setEditing(editing === l.productId ? null : l.productId)} className="text-xs text-brand underline">
                          تعديل
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editing && itemsByProduct.get(editing) && (
          <div className="mt-3">
            <p className="mb-2 text-sm font-medium">تصحيح «{itemsByProduct.get(editing)!.name}»: التصحيح يُحسب في مؤشر جودة الـ AI</p>
            <FactsForm
              mode="edit"
              submitLabel="حفظ التصحيح وإعادة التجهيز"
              initial={{
                lengthCm: itemsByProduct.get(editing)!.facts.lengthCm,
                widthCm: itemsByProduct.get(editing)!.facts.widthCm,
                heightCm: itemsByProduct.get(editing)!.facts.heightCm,
                weightG: itemsByProduct.get(editing)!.facts.weightG,
                fragile: itemsByProduct.get(editing)!.facts.fragile,
                liquid: itemsByProduct.get(editing)!.facts.liquid,
                sensitive: itemsByProduct.get(editing)!.facts.sensitive,
              }}
              onSubmit={(c) => saveFacts(editing, c, true)}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
      </section>

      <p className="text-xs text-muted">
        رقم التشغيل:{" "}
        <Link href={`/monitoring?run=${d.runId}`} className="ltr-nums underline">
          {d.runId}
        </Link>
      </p>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`ltr-nums ${strong ? "text-lg font-bold" : ""}`}>{value}</dd>
    </div>
  );
}
