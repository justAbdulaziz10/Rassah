import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import PackRunner from "@/components/PackRunner";
import { repoOrError } from "@/lib/http";
import { isOrderId } from "@/lib/ids";

export const metadata: Metadata = { title: "نتيجة الطلب" };

// The real HTTP 404 for unknown order numbers comes from proxy.ts: Cache Components serves this
// route as a prerendered shell with status 200, so a notFound() here cannot change the status in
// production. The checks below still show the not-found page for numbers the proxy lets through
// (the store range) that are not in the database. They read request-time data before any
// <Suspense> boundary, so navigations into this page are allowed to block.
export const instant = false;

export default async function OrderResultPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  await connection();
  if (!isOrderId(id)) notFound();

  const repo = repoOrError();
  let customerName: string | null = null;
  if (!(repo instanceof Response)) {
    // A DB error is not "not found": let the pack call report it on the page.
    const order = await repo.getOrder(id).catch(() => undefined);
    if (order === null) notFound();
    customerName = order?.customerName ?? null;
  }

  return (
    <div className="space-y-4">
      <Link href="/orders" className="text-sm text-muted hover:text-foreground print:hidden">
        ← كل الطلبات
      </Link>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-border/50" />}>
        <Runner id={id} customerName={customerName} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Runner({ id, customerName, searchParams }: { id: string; customerName: string | null } & Pick<PageProps<"/orders/[id]">, "searchParams">) {
  const sp = await searchParams;
  return <PackRunner key={id} orderId={id} customerName={customerName} simulateOutage={sp.outage === "1"} />;
}
