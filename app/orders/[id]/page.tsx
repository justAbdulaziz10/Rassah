import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PackRunner from "@/components/PackRunner";

export const metadata: Metadata = { title: "نتيجة الطلب" };

export default function OrderResultPage(props: PageProps<"/orders/[id]">) {
  return (
    <div className="space-y-4">
      <Link href="/orders" className="text-sm text-muted hover:text-foreground">
        ← كل الطلبات
      </Link>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-border/50" />}>
        <Runner params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Runner({ params, searchParams }: Pick<PageProps<"/orders/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const sp = await searchParams;
  return <PackRunner key={id} orderId={id} simulateOutage={sp.outage === "1"} />;
}
