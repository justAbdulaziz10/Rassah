"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ComponentProps } from "react";
import type { PackItemView, PackResponse } from "@/lib/pipeline/pack";
import { fmtApiError, fmtCartons, fmtDims, fmtPct, fmtPieces, fmtSar, fmtSmallerReason, fmtTime, fmtWeight, OUTCOME_LABEL, STATUS_LABEL } from "@/lib/ui/format";
import { useQueue } from "@/lib/ui/queue-store";
import { cartonFill, isHeavy, writtenStepOf } from "@/lib/ui/three";
import { FlagChips, SourceBadge, StatusPill } from "./Badges";
import { QUEUE_CHANGED } from "./ConsoleNav";
import FactsForm, { toFormValues, type FactsFormValues } from "./FactsForm";
import OrderQr from "./OrderQr";
import type PackingView3DView from "./PackingView3D";
import Safe3D from "./Safe3D";
import TopView2D from "./TopView2D";

// WebGL needs the browser; show a placeholder while it loads.
const PackingView3D = dynamic(() => import("./PackingView3D"), {
  ssr: false,
  loading: () => <p className="rounded-lg border border-border bg-surface p-6 text-center text-muted">جارٍ تحميل الشكل المجسّم…</p>,
});

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type State = { kind: "loading" } | { kind: "done"; data: PackResponse } | { kind: "failed"; message: string };

async function postJson(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function PackRunner({ orderId, customerName = null, simulateOutage }: { orderId: string; customerName?: string | null; simulateOutage: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // The header already polls the queue: the next order to open, and whether this one was packed before.
  const queue = useQueue();
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const started = useRef(false);

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
  const editItem = editing ? itemsByProduct.get(editing) : undefined;

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
        // 409: the server says why this result cannot be confirmed (a newer run, or no carton chosen).
        const error = (res.data as { error?: string }).error;
        setConfirmError(res.status === 409 && error ? fmtApiError(error) : "تعذّر حفظ التأكيد. اضغط «أعد الحساب» ثم أكّد مرة أخرى.");
        return;
      }
    } catch {
      setConfirmError("تعذّر الاتصال. تأكد من الإنترنت ثم أكّد مرة أخرى.");
      return;
    }
    setConfirmed(true);
    window.dispatchEvent(new Event(QUEUE_CHANGED));
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
              <StatusPill status={d.status} />
            )}
          </div>
          {customerName && <p className="mt-0.5 text-sm text-muted">العميل: {customerName}</p>}
          {split && (
            <>
              <p className="mt-2 text-3xl font-bold text-brand">يُغلَّف في {fmtCartons(split.boxes.length)}</p>
              <p className="mt-1 text-sm text-muted">
                {fmtPieces(split.boxes.reduce((s, b) => s + b.items.length, 0))} · لا يتّسع كرتون واحد للطلب بأمان، فقسّمته رصّة بأقل تكلفة
              </p>
            </>
          )}
          {d.carton && (
            <>
              <p className="mt-2 text-3xl font-bold text-brand">
                كرتون {d.carton.name} <span className="text-lg font-normal text-muted">{fmtDims(d.carton.innerCm)}</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                {fmtPieces(d.items.length)} · الكرتون الأوفر الذي يتّسع للطلب بأمان
              </p>
              {d.smaller?.length > 0 && <WhyNotSmaller smaller={d.smaller} />}
            </>
          )}
          {packedBefore && !confirmed && (
            <p className="mt-2 text-sm text-ok">✓ غُلّف هذا الطلب {packedBefore.at ? fmtTime(packedBefore.at) : "من قبل"}. الخطوات أدناه للمراجعة فقط.</p>
          )}
          {!d.monitoring.saved && <p className="mt-1 text-xs text-warn">لم يُحفظ سجل هذا الطلب في صفحة الأداء. التغليف غير متأثر.</p>}
        </div>
        {/* The printed sheet links back to this order, so the packer can open the 3D steps on a phone. */}
        {packable && (
          <div className="hidden items-center gap-2 print:flex">
            <OrderQr url={`${window.location.origin}/orders/${encodeURIComponent(d.orderId)}`} className="size-24" />
            <p className="w-28 text-xs">امسح الرمز لفتح الطلب وخطواته المجسّمة على الجوال</p>
          </div>
        )}
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
                initial={p.known}
                onSubmit={(c) => saveFacts(p.productId, c, false)}
              />
            </div>
          ))}
        </section>
      )}

      {split && <SplitBoxes key={d.runId} split={split} />}

      {d.status === "no_box" && !split && (
        <section className="rounded-lg border border-critical bg-critical-soft/40 p-4">
          <h2 className="font-bold text-critical">لا يوجد كرتون مناسب لهذا الطلب</h2>
          <p className="mt-1 text-sm">جرّبت رصّة كل الكراتين المتاحة، وهذا سبب استبعاد كل كرتون. ولم تجد رصّة تقسيماً مناسباً على أكثر من كرتون. تأكد من مقاسات المنتجات وأوزانها، أو قسّم الطلب يدوياً.</p>
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
          <section>
            <PackPlan key={d.runId} inner={d.carton.innerCm} items={viewItems} steps={d.instructions} titled />
          </section>

          {d.cost && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <h2 className="font-bold">
                التكلفة المتوقعة
              </h2>
              <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-6">
                <Stat label="الكرتون" value={fmtSar(d.cost.cartonSar)} />
                <Stat label="وزن الطرد" value={fmtWeight(d.cost.actualKg * 1000)} />
                <Stat label="الوزن الحجمي" value={fmtWeight(d.cost.volumetricKg * 1000)} hint="وزن تحسبه شركات الشحن من حجم الكرتون، ويُحاسب بالأكبر منه ومن وزن الطرد" />
                <Stat label="الشحن" value={fmtSar(d.cost.shippingSar)} />
                <Stat
                  label="امتلاء الكرتون"
                  value={fmtPct(cartonFill(d.carton.innerCm, viewItems.map((it) => it.placement)).usedShare)}
                  hint="حجم القطع بعد الحماية والهامش من حجم الكرتون من الداخل. الباقي يُملأ بالحشو"
                />
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
                      </td>
                      <td>
                        {f && (
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
          {editing && editItem && (
            <div className="mt-3">
              <p className="mb-2 text-sm font-medium">
                تصحيح «{editItem.name}»: يُحفظ تصحيحك ويُستخدم في كل الطلبات القادمة.
              </p>
              <FactsForm
                key={editing}
                mode="edit"
                submitLabel="احفظ التصحيح وأعد الحساب"
                initial={toFormValues(editItem.facts)}
                onSubmit={(c) => saveFacts(editing, c, true)}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
        </section>
      )}

      {d.monitoring.saved && (
        <p className="text-xs text-muted print:hidden">
          <Link href={`/monitoring?run=${d.runId}`} className="underline underline-offset-4 hover:text-foreground">
            سجل هذا التجهيز في صفحة الأداء
          </Link>
        </p>
      )}
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

/** The cartons smaller than the chosen one and why each was not used, so the choice can be checked by hand. */
function WhyNotSmaller({ smaller }: { smaller: PackResponse["smaller"] }) {
  return (
    <details className="mt-2 text-sm print:hidden">
      <summary className="cursor-pointer text-brand underline-offset-4 hover:underline">لماذا ليس كرتوناً أصغر؟</summary>
      <ul className="mt-1 space-y-0.5">
        {smaller.map((c) => (
          <li key={c.id}>
            <span className="font-medium">{c.name}</span> <span className="text-muted">{fmtDims(c.innerCm)}</span>: {fmtSmallerReason(c.reason)}
          </li>
        ))}
      </ul>
    </details>
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
    weightG: it.facts.weightG,
    placement: it.placement,
  }));
}

/**
 * The written steps and the 3D view on one step: picking a written step moves the view, and the
 * view's step is marked in the list. The view opens with every item in place.
 */
function PackPlan({
  inner,
  items,
  steps,
  titled = false,
}: {
  inner: [number, number, number];
  items: ReturnType<typeof toViewItems>;
  steps: PackResponse["instructions"];
  titled?: boolean;
}) {
  const [view, setView] = useState(items.length);
  // Only link the list once the 3D view is up; the 2D fallback has no steps.
  const [linked, setLinked] = useState(false);
  const writtenStep = (v: number) => writtenStepOf(v, steps.length);
  const heavy = new Map(items.filter(isHeavy).map((it) => [it.unitId, it.weightG ?? 0]));
  return (
    // minmax(0, …): a column never grows to its content's width, or the canvas would push the page wider than a phone.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-3">
        {titled && <h2 className="font-bold">خطوات التغليف</h2>}
        <Steps steps={steps} heavy={heavy} active={linked ? writtenStep(view) : null} onPick={linked ? (w) => setView(w - 1) : undefined} />
      </div>
      {/* The 3D view prints as a still of the carton (see PackingView3D). */}
      <div className="space-y-3">
        {titled && <h2 className="font-bold">شكل الترتيب داخل الكرتون</h2>}
        <Layout
          inner={inner}
          items={items}
          step={view}
          onStep={setView}
          writtenStep={writtenStep}
          thisSideUp={items.some((it) => it.liquid)}
          onReady={() => setLinked(true)}
        />
      </div>
    </div>
  );
}

function Steps({
  steps,
  heavy,
  active = null,
  onPick,
}: {
  steps: PackResponse["instructions"];
  /** Weight in grams of each heavy unit, by unitId. */
  heavy?: Map<string, number>;
  active?: number | null;
  onPick?: (step: number) => void;
}) {
  return (
    <ol className="space-y-2">
      {steps.map((s) => {
        const head = (
          <>
            <span className="ltr-nums flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs text-brand-contrast">
              {s.step}
            </span>
            <span>{s.text}</span>
            {s.unitId && heavy?.has(s.unitId) && (
              <span className="ms-auto h-fit shrink-0 whitespace-nowrap rounded bg-border/60 px-1.5 py-0.5 text-xs font-medium print:border print:border-border">
                ثقيل، {fmtWeight(heavy.get(s.unitId))}
              </span>
            )}
          </>
        );
        const isActive = active === s.step;
        return (
          <li
            key={s.step}
            aria-current={isActive ? "step" : undefined}
            className={`rounded-md border bg-surface p-3 transition-colors print:border-border print:ring-0 ${isActive ? "border-brand ring-1 ring-brand" : "border-border"}`}
          >
            {onPick ? (
              <button type="button" onClick={() => onPick(s.step)} className="flex w-full gap-2 text-start hover:text-brand" title="اعرض هذه الخطوة في الشكل">
                {head}
              </button>
            ) : (
              <div className="flex gap-2">{head}</div>
            )}
            {s.notes.length > 0 && (
              <ul className="mt-1 ms-8 list-disc space-y-0.5 text-sm text-muted">
                {s.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Layout({
  inner,
  items,
  ...view
}: { inner: [number, number, number]; items: ReturnType<typeof toViewItems> } & Omit<ComponentProps<typeof PackingView3DView>, "inner" | "items">) {
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
      <PackingView3D inner={inner} items={items} {...view} />
    </Safe3D>
  );
}

/**
 * One tab per carton when the order is split: what goes in it, the steps, the picture and the cost.
 * The printed sheet has every carton, each on its own page.
 */
function SplitBoxes({ split }: { split: NonNullable<PackResponse["split"]> }) {
  const n = split.boxes.length;
  const [shown, setShown] = useState(0);
  const tabsId = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const show = (i: number, focus = false) => {
    const next = (i + n) % n;
    setShown(next);
    if (focus) tabs.current[next]?.focus();
  };
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
      {/* Arrows move between cartons in reading order: left is the next one. */}
      <div
        role="tablist"
        aria-label="كراتين الطلب"
        className="flex flex-wrap gap-2 print:hidden"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") show(shown + 1, true);
          else if (e.key === "ArrowRight") show(shown - 1, true);
          else return;
          e.preventDefault();
        }}
      >
        {split.boxes.map((b, i) => (
          <button
            key={i}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${i}`}
            aria-controls={`${tabsId}-panel-${i}`}
            aria-selected={shown === i}
            tabIndex={shown === i ? 0 : -1}
            onClick={() => show(i)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-brand aria-selected:border-brand aria-selected:bg-brand aria-selected:font-bold aria-selected:text-brand-contrast"
          >
            الكرتون <span className="ltr-nums">{i + 1}</span>: {b.carton.name}
          </button>
        ))}
      </div>
      {split.boxes.map((b, i) => {
        const items = toViewItems(b.items);
        const names = new Map<string, number>();
        for (const it of b.items) names.set(it.name, (names.get(it.name) ?? 0) + 1);
        return (
          <section
            key={i}
            role="tabpanel"
            id={`${tabsId}-panel-${i}`}
            aria-labelledby={`${tabsId}-tab-${i}`}
            className={`space-y-4 rounded-lg border border-border bg-surface p-4 print:block print:break-before-page ${shown === i ? "" : "hidden"}`}
          >
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
            <PackPlan inner={b.carton.innerCm} items={items} steps={b.instructions} />
            {i < n - 1 && (
              <button
                type="button"
                onClick={() => {
                  show(i + 1, true);
                  tabs.current[i + 1]?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
                }}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-contrast hover:opacity-90 print:hidden"
              >
                الكرتون التالي <span className="ltr-nums">({i + 2}/{n})</span> ←
              </button>
            )}
          </section>
        );
      })}
    </>
  );
}
