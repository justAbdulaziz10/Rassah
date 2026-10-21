"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PackItemView, PackResponse } from "@/lib/pipeline/pack";
import { fmtApiError, fmtCartons, fmtDims, fmtPieces, fmtSar, fmtTime, fmtWeight, OUTCOME_LABEL, STATUS_LABEL } from "@/lib/ui/format";
import { FlagChips, SeededBadge, SourceBadge, StatusPill } from "./Badges";
import { QUEUE_CHANGED } from "./ConsoleNav";
import FactsForm, { type FactsFormValues } from "./FactsForm";
import Safe3D from "./Safe3D";
import TopView2D from "./TopView2D";

// WebGL needs the browser; show a placeholder while it loads.
const PackingView3D = dynamic(() => import("./PackingView3D"), {
  ssr: false,
  loading: () => <p className="rounded-lg border border-border bg-surface p-6 text-center text-muted">جارٍ تحميل الشكل المجسّم…</p>,
});

type State = { kind: "loading" } | { kind: "done"; data: PackResponse } | { kind: "failed"; message: string };

/** What the order list knows: the next order to open, and whether this one was already packed. */
interface QueueInfo {
  remainingOrderIds: string[];
  done: Array<{ id: string; at: string | null }>;
}

async function fetchQueue(): Promise<QueueInfo | null> {
  try {
    const res = await fetch("/api/orders/queue", { cache: "no-store" });
    return res.ok ? ((await res.json()) as QueueInfo) : null;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function PackRunner({ orderId, simulateOutage }: { orderId: string; simulateOutage: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueInfo | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    let live = true;
    void fetchQueue().then((q) => live && setQueue(q));
    return () => {
      live = false;
    };
  }, [orderId]);

  const pack = useCallback(async () => {
    setState({ kind: "loading" });
    setConfirmed(false);
    setConfirmError(null);
    setEditing(null);
    try {
      const { data, status } = await postJson(`/api/orders/${encodeURIComponent(orderId)}/pack`, simulateOutage ? { simulateOutage: true } : {});
      if (data && typeof data === "object" && "runId" in data) setState({ kind: "done", data: data as PackResponse });
      else setState({ kind: "failed", message: (data as { error?: string }).error ?? `HTTP ${status}` });
      // Opening an order changes its place in the queue (new → waiting, or needs attention).
      window.dispatchEvent(new Event(QUEUE_CHANGED));
    } catch {
      setState({ kind: "failed", message: "تعذّر الاتصال. تأكد من الإنترنت ثم حاول مرة ثانية." });
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
        <p className="text-sm text-muted">جارٍ قراءة المنتجات واختيار الكرتون…</p>
      </div>
    );
  }
  if (state.kind === "failed") {
    return (
      <div className="rounded-lg border border-critical bg-critical-soft p-4">
        <p className="font-medium text-critical">{fmtApiError(state.message)}</p>
        <button onClick={pack} className="mt-3 rounded bg-brand px-3 py-1.5 text-brand-contrast">
          حاول مرة أخرى
        </button>
      </div>
    );
  }

  const d = state.data;
  const viewItems = toViewItems(d.items);
  const itemsByProduct = new Map<string, PackItemView>();
  for (const it of d.items) if (!itemsByProduct.has(it.productId)) itemsByProduct.set(it.productId, it);

  async function saveFacts(productId: string, changes: Partial<FactsFormValues>, viaRun: boolean) {
    const res = viaRun
      ? await postJson(`/api/runs/${d.runId}/action`, { action: "edit", productId, changes })
      : await postJson(`/api/products/${productId}/facts`, { changes, runId: d.runId }, "PATCH");
    if (!res.ok) return fmtApiError((res.data as { error?: string }).error ?? "Could not save");
    await pack(); // re-pack with the corrected facts
    return null;
  }

  async function confirm() {
    setConfirmError(null);
    try {
      const res = await postJson(`/api/runs/${d.runId}/action`, { action: "confirm" });
      if (!res.ok) {
        setConfirmError("تعذّر حفظ التأكيد. اضغط «أعد الحساب» ثم أكّد مرة أخرى.");
        return;
      }
    } catch {
      setConfirmError("تعذّر الاتصال. تأكد من الإنترنت ثم أكّد مرة أخرى.");
      return;
    }
    setConfirmed(true);
    window.dispatchEvent(new Event(QUEUE_CHANGED));
    setQueue(await fetchQueue());
  }

  const split = d.status === "no_box" ? d.split : null;
  const packable = d.status === "box_found" || split !== null;
  const packedBefore = queue?.done.find((x) => x.id === d.orderId) ?? null;
  const isDone = confirmed || packedBefore !== null;
  const nextId = queue?.remainingOrderIds.find((id) => id !== d.orderId) ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">الطلب #{d.orderId}</h1>
            {split ? (
              <span className="whitespace-nowrap rounded bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">على أكثر من كرتون</span>
            ) : (
              <StatusPill status={d.status} label={STATUS_LABEL[d.status] ?? d.status} />
            )}
          </div>
          {split && (
            <>
              <p className="mt-2 text-3xl font-bold text-brand">يُغلَّف في {fmtCartons(split.boxes.length)}</p>
              <p className="mt-1 text-sm text-muted">
                {fmtPieces(split.boxes.reduce((s, b) => s + b.items.length, 0))} · لا يتّسع كرتون واحد للطلب بأمان، فقسّمته رصّة بأقل تكلفة
              </p>
            </>
          )}
          {d.carton && (
            <p className="mt-2 text-3xl font-bold text-brand">
              كرتون {d.carton.name} <span className="text-lg font-normal text-muted">{fmtDims(d.carton.innerCm)}</span>
            </p>
          )}
          {d.carton && (
            <p className="mt-1 text-sm text-muted">
              {fmtPieces(d.items.length)} · الكرتون الأوفر الذي يتّسع للطلب بأمان
            </p>
          )}
          {packedBefore && !confirmed && (
            <p className="mt-2 text-sm text-ok">✓ غُلّف هذا الطلب {packedBefore.at ? fmtTime(packedBefore.at) : "من قبل"}. الخطوات أدناه للمراجعة فقط.</p>
          )}
          {d.lines.some((l) => l.origin === "seeded") && (
            <p className="mt-1 text-xs text-muted">وضع العرض بدون إنترنت: مقاسات المنتجات محمّلة مسبقاً.</p>
          )}
          {!d.monitoring.saved && <p className="mt-1 text-xs text-warn">لم يُحفظ سجل هذا الطلب في صفحة الأداء. التغليف غير متأثر.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {packable && (
            <button onClick={() => window.print()} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-border/40">
              اطبع الخطوات
            </button>
          )}
          <button onClick={pack} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-border/40" title="يعيد اختيار الكرتون بالمقاسات المحفوظة الآن">
            أعد الحساب
          </button>
          {packable &&
            (isDone ? (
              <span className="rounded-lg bg-ok-soft px-3 py-2 text-sm font-bold text-ok">✓ تم التغليف</span>
            ) : (
              <button onClick={confirm} className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-contrast hover:opacity-90">
                تأكيد التغليف
              </button>
            ))}
          {isDone &&
            (nextId ? (
              <Link href={`/orders/${nextId}`} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-contrast hover:opacity-90">
                الطلب التالي <span className="ltr-nums">#{nextId}</span> ←
              </Link>
            ) : queue ? (
              <Link href="/orders" className="rounded-lg border border-ok px-4 py-2 text-sm font-bold text-ok">
                ✓ لا توجد طلبات متبقية
              </Link>
            ) : (
              <Link href="/orders" className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-border/40">
                كل الطلبات ←
              </Link>
            ))}
          {confirmError && (
            <p role="alert" className="w-full text-sm font-medium text-critical">
              {confirmError}
            </p>
          )}
        </div>
      </section>

      {d.status === "needs_measurement" && (
        <section className="space-y-3 rounded-lg border border-warn bg-warn-soft/40 p-4">
          <h2 className="font-bold text-warn">قِس هذه المنتجات قبل التغليف</h2>
          <p className="text-sm">
            لم نجد مقاساتها في صفحة المنتج، ولا نرتّب الطلب على أرقام مخمّنة. قِس كل منتج مرة واحدة، ويُحفظ القياس للطلبات القادمة.
          </p>
          {d.productsToMeasure.map((p) => (
            <div key={p.productId} className="space-y-2">
              <p className="font-medium">
                {p.name}
                {p.failedExtraction && <span className="ms-2 text-xs text-critical">تعذّرت قراءة صفحة المنتج</span>}
              </p>
              <FactsForm
                mode="measure"
                submitLabel="احفظ القياس وأعد الحساب"
                initial={{ lengthCm: null, widthCm: null, heightCm: null, weightG: null, fragile: false, liquid: false, sensitive: false }}
                onSubmit={(c) => saveFacts(p.productId, c, false)}
              />
            </div>
          ))}
        </section>
      )}

      {split && <SplitBoxes split={split} />}

      {d.status === "no_box" && !split && (
        <section className="rounded-lg border border-critical bg-critical-soft/40 p-4">
          <h2 className="font-bold text-critical">لا يوجد كرتون مناسب لهذا الطلب</h2>
          <p className="mt-1 text-sm">جرّبت رصّة كل الكراتين المتاحة، وهذا سبب استبعاد كل كرتون. ولا ينفع تقسيمه أيضاً: إحدى القطع لا تتّسع وحدها في أي كرتون.</p>
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
          {d.errorMessage && <p className="mt-1 text-sm">{fmtApiError(d.errorMessage)}</p>}
        </section>
      )}

      {d.status === "box_found" && d.carton && (
        <>
          <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-3">
              <h2 className="font-bold">خطوات التغليف</h2>
              <Steps steps={d.instructions} />
            </div>
            <div className="space-y-3 print:hidden">
              <h2 className="font-bold">شكل الترتيب داخل الكرتون</h2>
              <Layout inner={d.carton.innerCm} items={viewItems} />
            </div>
          </section>

          {d.cost && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="font-bold">
                التكلفة المتوقعة <span className="text-xs font-normal text-muted">(أسعار تجريبية للعرض)</span>
              </h2>
              <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <Stat label="الكرتون" value={fmtSar(d.cost.cartonSar)} />
                <Stat label="وزن الطرد" value={fmtWeight(d.cost.actualKg * 1000)} />
                <Stat label="الوزن الحجمي" value={fmtWeight(d.cost.volumetricKg * 1000)} hint="وزن تحسبه شركات الشحن من حجم الكرتون، ويُحاسب بالأكبر منه ومن وزن الطرد" />
                <Stat label="الشحن" value={fmtSar(d.cost.shippingSar)} />
                <Stat label="الإجمالي" value={fmtSar(d.cost.totalSar)} strong />
              </dl>
            </section>
          )}
        </>
      )}

      {/* Before a carton is chosen there are no placed sizes to show: list what each product is waiting for. */}
      {d.status !== "box_found" && !split && d.lines.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-bold">منتجات الطلب</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {d.lines.map((l) => {
              const toMeasure = d.productsToMeasure.some((p) => p.productId === l.productId);
              return (
                <li key={l.productId} className="flex items-center gap-3 py-2">
                  <span className="flex-1">{l.name}</span>
                  <span className="text-muted">× {l.qty}</span>
                  {toMeasure ? (
                    <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">ينتظر القياس</span>
                  ) : (
                    <SourceBadge source={l.dimsSource} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Products: the sizes Rassah used, where each came from, and corrections. */}
      {d.status === "box_found" && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-bold">منتجات الطلب</h2>
          <p className="mt-0.5 text-sm text-muted">المقاسات التي رُتّب الطلب عليها. إذا وجدت مقاساً خاطئاً فاضغط «تصحيح».</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="text-start text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 text-start">المنتج</th>
                  <th className="text-start">الكمية</th>
                  <th className="text-start">المقاس</th>
                  <th className="text-start">الوزن</th>
                  <th className="text-start">طريقة التعامل</th>
                  <th className="text-start">مصدر المقاس</th>
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
                      <td>
                        {f ? fmtDims([f.lengthCm, f.widthCm, f.heightCm]) : "—"}
                        {it && (it.marginApplied || it.paddingApplied) && (
                          <p className="text-xs text-muted">
                            بعد {it.paddingApplied && it.marginApplied ? "الحماية وهامش 15%" : it.paddingApplied ? "إضافة الحماية" : "هامش أمان 15%"}: {fmtDims(it.effectiveCm)}
                          </p>
                        )}
                      </td>
                      <td>{f ? fmtWeight(f.weightG) : "—"}</td>
                      <td>{f ? <FlagChips {...f} /> : "—"}</td>
                      <td>
                        <SourceBadge source={l.dimsSource} />
                        {l.origin === "seeded" && <SeededBadge />}
                      </td>
                      <td>
                        {f && d.status === "box_found" && (
                          <button onClick={() => setEditing(editing === l.productId ? null : l.productId)} className="text-xs text-brand underline">
                            تصحيح
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
              <p className="mb-2 text-sm font-medium">
                تصحيح «{itemsByProduct.get(editing)!.name}»: يُحفظ تصحيحك ويُستخدم في كل الطلبات القادمة.
              </p>
              <FactsForm
                mode="edit"
                submitLabel="احفظ التصحيح وأعد الحساب"
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
      )}

      <p className="text-xs text-muted print:hidden">
        <Link href={`/monitoring?run=${d.runId}`} className="underline underline-offset-4 hover:text-foreground">
          سجل هذا التجهيز في صفحة الأداء
        </Link>
      </p>
    </div>
  );
}

function Stat({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <dt className={`text-xs text-muted ${hint ? "underline decoration-dotted underline-offset-4" : ""}`}>{label}</dt>
      <dd className={strong ? "text-lg font-bold" : ""}>{value}</dd>
    </div>
  );
}

function toViewItems(items: PackItemView[]) {
  return items.map((it) => ({
    unitId: it.unitId,
    name: it.name,
    fragile: it.facts.fragile,
    liquid: it.facts.liquid,
    sensitive: it.facts.sensitive,
    estimated: it.marginApplied,
    placement: it.placement,
  }));
}

function Steps({ steps }: { steps: PackResponse["instructions"] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
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
  );
}

function Layout({ inner, items }: { inner: [number, number, number]; items: ReturnType<typeof toViewItems> }) {
  return (
    <Safe3D
      fallback={
        <div className="rounded-lg border border-border bg-surface">
          <div className="h-80 w-full p-4 sm:h-96">
            <TopView2D inner={inner} items={items} />
          </div>
          <p className="border-t border-border px-4 py-3 text-sm text-muted">
            متصفحك لا يدعم العرض المجسّم، فهذا منظر علوي للكرتون. خطوات التغليف المكتوبة كاملة.
          </p>
        </div>
      }
    >
      <PackingView3D inner={inner} items={items} />
    </Safe3D>
  );
}

/** One section per carton when the order is split: what goes in it, the steps, the picture and the cost. */
function SplitBoxes({ split }: { split: NonNullable<PackResponse["split"]> }) {
  const n = split.boxes.length;
  return (
    <>
      <section className="rounded-lg border border-warn bg-warn-soft/40 p-4">
        <h2 className="font-bold text-warn">الطلب أكبر أو أثقل من أي كرتون واحد</h2>
        <p className="mt-1 text-sm">
          قسّمته رصّة على {fmtCartons(n)}، وكل كرتون مرتّب ومفحوص مثل أي طلب عادي. اكتب على كل كرتون رقمه ورقم الطلب
          (مثلاً «<span className="ltr-nums">1/{n}</span>») حتى تُشحن معاً. التكلفة المتوقعة للكل:{" "}
          <span className="font-bold">{fmtSar(split.totalSar)}</span>
        </p>
      </section>
      {split.boxes.map((b, i) => {
        const items = toViewItems(b.items);
        const names = new Map<string, number>();
        for (const it of b.items) names.set(it.name, (names.get(it.name) ?? 0) + 1);
        return (
          <section key={i} className="space-y-4 rounded-lg border border-border bg-surface p-4 print:break-before-page">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-bold">
                الكرتون <span className="ltr-nums">{i + 1}</span> من <span className="ltr-nums">{n}</span>: {b.carton.name}
              </h2>
              <span className="text-sm text-muted">{fmtDims(b.carton.innerCm)}</span>
              <span className="ms-auto text-sm">
                التكلفة المتوقعة <span className="font-bold">{fmtSar(b.cost.totalSar)}</span>
              </span>
            </div>
            <p className="text-sm text-muted">
              يحتوي:{" "}
              {[...names].map(([name, qty], k) => (
                <span key={name}>
                  {k > 0 && "، "}
                  {name}
                  {qty > 1 && ` (${fmtPieces(qty)})`}
                </span>
              ))}
            </p>
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              <Steps steps={b.instructions} />
              <div className="print:hidden">
                <Layout inner={b.carton.innerCm} items={items} />
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
