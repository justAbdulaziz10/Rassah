import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import OrderLookup from "@/components/OrderLookup";
import { appEnv } from "@/lib/env";
import { repoOrError } from "@/lib/http";

export const metadata: Metadata = { title: "الطلبات" };

const DEMO_LABEL: Record<string, string> = {
  "quick-success": "عرض: نجاح سريع",
  "fragile-liquid-estimated": "عرض: قابل للكسر + سائل + تقديري",
  impossible: "عرض: مستحيل",
};

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">تجهيز طلب</h1>
        <p className="mt-1 text-muted">اكتب رقم الطلب، ورصّة تقرأ صفحات المنتجات وتقترح الكرتون الآمن الأوفر مع تعليمات التغليف.</p>
      </header>
      <Suspense fallback={<div className="h-28 animate-pulse rounded-lg bg-border/50" />}>
        <Lookup />
      </Suspense>
      <section>
        <h2 className="mb-3 font-bold">طلبات المتجر التجريبي</h2>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-border/50" />}>
          <OrderList />
        </Suspense>
      </section>
    </div>
  );
}

async function Lookup() {
  await connection();
  return <OrderLookup demoMode={appEnv().DEMO_MODE} />;
}

async function OrderList() {
  await connection();
  const repo = repoOrError();
  if (repo instanceof Response) {
    return <p className="rounded-lg border border-warn bg-warn-soft p-4 text-sm">قاعدة البيانات غير مهيأة. راجع README (Getting started).</p>;
  }
  let orders;
  try {
    orders = await repo.listOrders();
  } catch {
    return <p className="rounded-lg border border-critical bg-critical-soft p-4 text-sm">تعذر تحميل الطلبات من قاعدة البيانات.</p>;
  }
  if (orders.length === 0) return <p className="text-muted">لا توجد طلبات. شغّل npm run seed.</p>;
  const sorted = [...orders].sort((a, b) => Number(Boolean(b.demo)) - Number(Boolean(a.demo)) || a.id.localeCompare(b.id));
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((o) => (
        <li key={o.id}>
          <Link
            href={`/orders/${o.id}`}
            className={`block rounded-lg border bg-surface p-3 hover:border-brand ${o.demo ? "border-brand" : "border-border"}`}
          >
            <div className="flex items-center justify-between">
              <span className="ltr-nums text-lg font-bold">#{o.id}</span>
              <span className="text-xs text-muted">
                <span className="ltr-nums">{o.unitCount}</span> قطع
              </span>
            </div>
            {o.demo && <span className="mt-1 inline-block rounded bg-brand px-1.5 py-0.5 text-xs text-brand-contrast">{DEMO_LABEL[o.demo] ?? o.demo}</span>}
            {o.expect && <p className="mt-1 text-xs text-muted">{o.expect}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
