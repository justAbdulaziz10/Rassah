import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import PackRunner from "@/components/PackRunner";
import { repoOrError } from "@/lib/http";

export const metadata: Metadata = { title: "نتيجة الطلب" };

// The order existence check runs before any <Suspense> boundary so an unknown order gets a real
// HTTP 404 (a notFound() after streaming starts keeps status 200). That check is request-time
// data, so navigations into this page are allowed to block.
export const instant = false;

export default async function OrderResultPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  await connection();
  if (!/^\d{1,10}$/.test(id)) notFound();

  const repo = repoOrError();
  if (!(repo instanceof Response)) {
    // A DB error is not "not found": let the pack call report it on the page.
    const order = await repo.getOrder(id).catch(() => undefined);
    if (order === null) notFound();
  }

  return (
    <div className="space-y-4">
      <Link href="/orders" className="text-sm text-muted hover:text-foreground">
        ← كل الطلبات
      </Link>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-border/50" />}>
        <Runner id={id} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Runner({ id, searchParams }: { id: string } & Pick<PageProps<"/orders/[id]">, "searchParams">) {
  const sp = await searchParams;
  return <PackRunner key={id} orderId={id} simulateOutage={sp.outage === "1"} />;
}
