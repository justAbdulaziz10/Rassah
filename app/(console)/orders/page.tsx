import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlertIcon, ArrowForwardIcon, CheckIcon, PackageCheckIcon } from "@/components/Icons";
import OrderLookup from "@/components/OrderLookup";
import { EmptyState, Notice, PageHeader, QueueSkeleton } from "@/components/PageHeader";
import { repoOrError } from "@/lib/http";
import { FILTERS, parseFilter, REASON_LABEL, STATE_LABEL, STATE_STYLE, type FilterKey } from "@/lib/orders/labels";
import { loadQueue, type QueueSnapshot } from "@/lib/orders/load";
import type { QueueEntry } from "@/lib/orders/queue";
import { fmtCount, fmtPieces, fmtTime } from "@/lib/ui/format";

export const metadata: Metadata = { title: "الطلبات" };

export default function OrdersPage(props: PageProps<"/orders">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="الطلبات"
        actions={
          <Suspense fallback={<div className="skeleton h-11 w-full animate-pulse sm:w-72" aria-hidden />}>
            <Lookup />
          </Suspense>
        }
      >
        افتح أي طلب، وستختار رصّة الكرتون المناسب وتكتب لك خطوات التغليف.
      </PageHeader>
      <Suspense fallback={<QueueSkeleton />}>
        <Queue searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Lookup() {
  await connection();
  return <OrderLookup />;
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
    return <Notice tone="warn">النظام غير متصل بقاعدة البيانات، فلا يمكن عرض الطلبات. أخبر مسؤول النظام.</Notice>;
  }
  let snap: QueueSnapshot;
  try {
    snap = await loadQueue(repo);
  } catch {
    return <Notice tone="critical">تعذّر تحميل الطلبات. حدّث الصفحة بعد قليل، وإن تكرر الأمر فأبلغ مسؤول النظام.</Notice>;
  }
  const { counts } = snap;
  if (counts.total === 0) {
    return <EmptyState title="لا توجد طلبات بعد">عندما يصل أول طلب من متجرك سيظهر هنا، وتجهّزه رصّة بضغطة واحدة.</EmptyState>;
  }

  const shown = snap.entries.filter((e) => matches(e, filter));
  const countFor = (f: FilterKey) => (f === "all" ? counts.total : f === "remaining" ? counts.remaining : counts[f]);
  const donePct = Math.round((counts.done / counts.total) * 100);

  return (
    <div className="space-y-5">
      <section className="panel p-5" aria-label="ملخص الطلبات">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {counts.remaining === 0 ? (
            <p className="flex items-center gap-2 text-xl font-bold text-ok">
              <PackageCheckIcon className="size-6" />
              غُلّفت كل الطلبات
            </p>
          ) : (
            <p className="flex items-baseline gap-2.5 text-lg">
              <span className="ltr-nums font-display text-5xl font-bold leading-none text-brand">{counts.remaining}</span>
              <span>
                {counts.remaining === 1 ? "طلب ينتظر" : "طلبات تنتظر"} التغليف
                <span className="block text-sm text-muted">من أصل {fmtCount(counts.total, { one: "طلب واحد", two: "طلبين", few: "طلبات", many: "طلباً" })}</span>
              </span>
            </p>
          )}
          {counts.attention > 0 && (
            <Link
              href="/orders?show=attention"
              className="inline-flex items-center gap-2 rounded-lg bg-critical px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 focus-visible:outline-critical"
            >
              <AlertIcon className="size-4" />
              {fmtCount(counts.attention, { one: "طلب يحتاج", two: "طلبان يحتاجان", few: "طلبات تحتاج", many: "طلباً يحتاج" })} تدخّلك
            </Link>
          )}
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-border/70"
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

      <nav aria-label="تصفية الطلبات" className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          const n = countFor(f.key);
          return (
            <Link
              key={f.key}
              href={f.key === "remaining" ? "/orders" : `/orders?show=${f.key}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                active ? "border-brand bg-brand font-medium text-brand-contrast" : "border-border bg-surface text-muted hover:border-brand hover:text-foreground"
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
        filter === "attention" ? (
          <EmptyState tone="ok" title="لا توجد طلبات تحتاج تدخّلك">كل الطلبات الحالية يمكن تجهيزها دون قياس أو معالجة.</EmptyState>
        ) : filter === "remaining" ? (
          <EmptyState tone="ok" title="لا توجد طلبات متبقية. أحسنت!">
            كل الطلبات مغلّفة. اختر «تم تغليفها» لمراجعتها.
          </EmptyState>
        ) : (
          <EmptyState title="لا توجد طلبات هنا">جرّب تصفية أخرى من الأعلى، أو اختر «الكل».</EmptyState>
        )
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
  const done = state === "done";

  return (
    <Link
      href={`/orders/${order.id}`}
      className={`group flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
        attention
          ? "border-critical bg-critical-soft/60 hover:bg-critical-soft"
          : done
            ? "border-border bg-surface/60 hover:border-ok"
            : "border-border bg-surface hover:border-brand"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ltr-nums text-xl font-bold">#{order.id}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${STATE_STYLE[state]}`}>
          {attention && <AlertIcon className="size-3.5" />}
          {done && <CheckIcon className="size-3.5" />}
          {STATE_LABEL[state]}
        </span>
      </div>

      {order.customerName && <p className="-mt-1 text-sm text-muted">العميل: {order.customerName}</p>}

      <p className={`line-clamp-2 text-sm leading-6 ${done ? "text-muted" : ""}`}>
        {names.slice(0, 2).join("، ")}
        {names.length > 2 && <span className="text-muted"> و{fmtCount(names.length - 2, { one: "منتج آخر", two: "منتجان آخران", few: "منتجات أخرى", many: "منتجاً آخر" })}</span>}
      </p>

      {attention && reason && (
        <p className="flex items-start gap-1.5 text-sm font-bold leading-6 text-critical">
          <AlertIcon className="mt-1 size-4 shrink-0" />
          {REASON_LABEL[reason]}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-3 text-xs text-muted">
        <span>{fmtPieces(order.unitCount)}</span>
        {fragile && <span className="rounded bg-fragile-soft px-1.5 py-0.5 font-medium text-fragile">قابل للكسر</span>}
        {liquid && <span className="rounded bg-liquid-soft px-1.5 py-0.5 font-medium text-liquid">سائل</span>}
        {sensitive && <span className="rounded bg-sensitive-soft px-1.5 py-0.5 font-medium text-sensitive">حساس</span>}
        {done && entry.confirmedAt && <span className="ms-auto">غُلّف {fmtTime(entry.confirmedAt)}</span>}
        {!done && (
          <span className="ms-auto inline-flex items-center gap-1 text-sm font-bold text-brand">
            {state === "new" ? "جهّزه" : attention ? "عالجه" : "افتحه"}
            <ArrowForwardIcon className="size-4 transition-transform group-hover:-translate-x-0.5" />
          </span>
        )}
      </div>
    </Link>
  );
}
