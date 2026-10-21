import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import OrderLookup from "@/components/OrderLookup";
import { appEnv } from "@/lib/env";
import { repoOrError } from "@/lib/http";
import { FILTERS, parseFilter, REASON_LABEL, STATE_LABEL, STATE_STYLE, type FilterKey } from "@/lib/orders/labels";
import { loadQueue, type QueueSnapshot } from "@/lib/orders/load";
import type { QueueEntry } from "@/lib/orders/queue";
import { fmtCount, fmtPieces, fmtTime } from "@/lib/ui/format";

export const metadata: Metadata = { title: "الطلبات" };

export default function OrdersPage(props: PageProps<"/orders">) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">الطلبات</h1>
          <p className="mt-1 text-muted">افتح أي طلب، وتختار رصّة الكرتون المناسب وتكتب لك خطوات التغليف.</p>
        </div>
        <Suspense fallback={<div className="h-11 w-72 animate-pulse rounded-lg bg-border/50" />}>
          <Lookup />
        </Suspense>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-border/50" />}>
        <Queue searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Lookup() {
  await connection();
  return <OrderLookup demoMode={appEnv().DEMO_MODE} />;
}

function matches(e: QueueEntry, f: FilterKey) {
  if (f === "all") return true;
  if (f === "remaining") return e.state !== "done";
  return e.state === f;
}

async function Queue({ searchParams }: Pick<PageProps<"/orders">, "searchParams">) {
  await connection();
  const filter = parseFilter((await searchParams).show);
  const repo = repoOrError();
  if (repo instanceof Response) {
    return <p className="rounded-xl border border-warn bg-warn-soft p-4 text-sm">النظام غير متصل بقاعدة البيانات. أخبر مسؤول النظام.</p>;
  }
  let snap: QueueSnapshot;
  try {
    snap = await loadQueue(repo);
  } catch {
    return <p className="rounded-xl border border-critical bg-critical-soft p-4 text-sm">تعذّر تحميل الطلبات. حدّث الصفحة بعد قليل.</p>;
  }
  const { counts } = snap;
  if (counts.total === 0) return <p className="text-muted">لا توجد طلبات بعد.</p>;

  const shown = snap.entries.filter((e) => matches(e, filter));
  const countFor = (f: FilterKey) => (f === "all" ? counts.total : f === "remaining" ? counts.remaining : counts[f]);
  const donePct = Math.round((counts.done / counts.total) * 100);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-lg">
            {counts.remaining === 0 ? (
              <span className="font-bold text-ok">✓ غُلّفت كل الطلبات</span>
            ) : (
              <>
                متبقٍ <span className="ltr-nums text-3xl font-bold text-brand">{counts.remaining}</span> من{" "}
                {fmtCount(counts.total, { one: "طلب واحد", two: "طلبين", few: "طلبات", many: "طلباً" })}
              </>
            )}
          </p>
          {counts.attention > 0 && (
            <Link href="/orders?show=attention" className="rounded-full bg-critical px-3 py-1 text-sm font-bold text-white hover:opacity-90">
              {fmtCount(counts.attention, { one: "طلب يحتاج", two: "طلبان يحتاجان", few: "طلبات تحتاج", many: "طلباً يحتاج" })} تدخّلك
            </Link>
          )}
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-border/60"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={counts.total}
          aria-valuenow={counts.done}
          aria-label="الطلبات المغلّفة"
        >
          <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${donePct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          غُلّف <span className="ltr-nums">{counts.done}</span> من <span className="ltr-nums">{counts.total}</span>
        </p>
      </section>

      <nav aria-label="تصفية الطلبات" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          const n = countFor(f.key);
          return (
            <Link
              key={f.key}
              href={f.key === "remaining" ? "/orders" : `/orders?show=${f.key}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                active ? "border-brand bg-brand text-brand-contrast" : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {f.label}
              <span
                className={`ltr-nums rounded-full px-1.5 text-xs ${
                  f.key === "attention" && n > 0 && !active ? "bg-critical text-white" : active ? "bg-black/15" : "bg-border/60"
                }`}
              >
                {n}
              </span>
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
          {filter === "attention" ? "لا توجد طلبات تحتاج تدخّلك." : filter === "remaining" ? "لا توجد طلبات متبقية. أحسنت!" : "لا توجد طلبات هنا."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => (
            <li key={e.order.id}>
              <OrderCard entry={e} snap={snap} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ entry, snap }: { entry: QueueEntry; snap: QueueSnapshot }) {
  const { order, state, reason } = entry;
  const names = order.productIds.map((id) => snap.products.get(id)?.name ?? id);
  const flags = order.productIds.map((id) => snap.flags.get(id));
  const fragile = flags.some((f) => f?.fragile);
  const liquid = flags.some((f) => f?.liquid);
  const sensitive = flags.some((f) => f?.sensitive);
  const attention = state === "attention";

  return (
    <Link
      href={`/orders/${order.id}`}
      className={`group flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
        attention
          ? "border-critical bg-critical-soft/50 hover:bg-critical-soft"
          : state === "done"
            ? "border-border bg-surface/60 hover:border-ok"
            : "border-border bg-surface hover:border-brand"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ltr-nums text-lg font-bold">#{order.id}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE_STYLE[state]}`}>{STATE_LABEL[state]}</span>
      </div>

      <p className={`line-clamp-2 text-sm ${state === "done" ? "text-muted" : ""}`}>
        {names.slice(0, 2).join("، ")}
        {names.length > 2 && <span className="text-muted"> و{fmtCount(names.length - 2, { one: "منتج آخر", two: "منتجان آخران", few: "منتجات أخرى", many: "منتجاً آخر" })}</span>}
      </p>

      {attention && reason && <p className="text-sm font-bold text-critical">⚠ {REASON_LABEL[reason]}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted">
        <span>{fmtPieces(order.unitCount)}</span>
        {fragile && <span className="rounded bg-fragile-soft px-1.5 py-0.5 font-medium text-fragile">قابل للكسر</span>}
        {liquid && <span className="rounded bg-liquid-soft px-1.5 py-0.5 font-medium text-liquid">سائل</span>}
        {sensitive && <span className="rounded bg-sensitive-soft px-1.5 py-0.5 font-medium text-sensitive">حساس</span>}
        {state === "done" && entry.confirmedAt && <span className="ms-auto">غُلّف {fmtTime(entry.confirmedAt)}</span>}
        {state !== "done" && (
          <span className="ms-auto font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {state === "new" ? "جهّزه ←" : "افتحه ←"}
          </span>
        )}
      </div>
    </Link>
  );
}
