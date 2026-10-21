import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckIcon } from "@/components/Icons";
import { repoOrError } from "@/lib/http";
import { PRICE_SAR } from "@/lib/store/catalog";
import { fmtPieces } from "@/lib/ui/format";

export const metadata: Metadata = { title: "تم استلام طلبك" };

export default function OrderPlacedPage(props: PageProps<"/store/order/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-80 max-w-xl animate-pulse rounded-xl bg-border/50" aria-hidden />}>
      <Placed params={props.params} />
    </Suspense>
  );
}

async function Placed({ params }: Pick<PageProps<"/store/order/[id]">, "params">) {
  await connection();
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const repo = repoOrError();
  if (repo instanceof Response) notFound();
  const order = await repo.getOrder(id);
  if (!order || order.customerName === null) notFound(); // only orders placed in the store
  const products = new Map((await repo.getProducts(order.lines.map((l) => l.productId))).map((p) => [p.id, p]));
  const total = order.lines.reduce((s, l) => s + (PRICE_SAR[l.productId] ?? 0) * l.qty, 0);
  const units = order.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <section className="panel mx-auto max-w-xl p-6 text-center sm:p-8">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-ok-soft text-ok">
        <CheckIcon className="size-6" />
      </span>
      <h1 className="mt-4 text-2xl font-bold">شكراً {order.customerName}، وصلنا طلبك</h1>
      <p className="mt-2 text-muted">رقم الطلب</p>
      <p className="ltr-nums font-display text-5xl font-bold text-brand">{order.id}</p>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border text-start text-sm">
        {order.lines.map((l) => (
          <li key={l.productId} className="flex items-center justify-between gap-3 px-4 py-3">
            <span>{products.get(l.productId)?.name ?? l.productId}</span>
            <span className="shrink-0 text-muted">{fmtPieces(l.qty)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        {fmtPieces(units)} · الإجمالي <span className="ltr-nums font-bold text-foreground">{total}</span> ر.س
      </p>

      <p className="mt-6 text-sm leading-6 text-muted">الطلب الآن في لوحة الطلبات، وتختار له رصّة الكرتون وخطوات التغليف.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link href={`/orders/${order.id}`} className="rounded-lg bg-brand px-5 py-2.5 font-bold text-brand-contrast hover:opacity-90">
          جهّزه في رصّة
        </Link>
        <Link href="/store" className="rounded-lg border border-border bg-surface px-5 py-2.5 hover:border-brand">
          طلب جديد
        </Link>
      </div>
    </section>
  );
}
