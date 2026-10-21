import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import CatalogTable, { type CatalogRow } from "@/components/CatalogTable";
import { appEnv } from "@/lib/env";
import { repoOrError } from "@/lib/http";
import { Notice, PageHeader, TableSkeleton } from "@/components/PageHeader";

export const metadata: Metadata = { title: "المنتجات" };

export default function CatalogPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="المنتجات">
        مقاسات وأوزان كل منتج. ما يقيسه الموظف أو يصحّحه لا يُستبدل أبداً.
      </PageHeader>
      <Suspense fallback={<TableSkeleton />}>
        <Catalog />
      </Suspense>
    </div>
  );
}

async function Catalog() {
  await connection();
  const repo = repoOrError();
  if (repo instanceof Response) {
    return (
      <Notice tone="warn">قاعدة البيانات غير جاهزة، فلا يمكن عرض المنتجات. أخبر مسؤول النظام.</Notice>
    );
  }
  const [products, facts] = await Promise.all([repo.listProducts(), repo.listFacts()]);
  const byId = new Map(facts.map((f) => [f.productId, f]));
  const rows: CatalogRow[] = products.map((p) => {
    const f = byId.get(p.id);
    return {
      productId: p.id,
      name: p.name,
      category: p.category,
      facts: f
        ? {
            lengthCm: f.lengthCm,
            widthCm: f.widthCm,
            heightCm: f.heightCm,
            weightG: f.weightG,
            dimsSource: f.dimsSource,
            weightSource: f.weightSource,
            fragile: f.fragile,
            liquid: f.liquid,
            sensitive: f.sensitive,
            evidence: f.evidence,
            origin: f.origin,
            extractedAt: f.extractedAt,
            stale: f.origin === "ai" && f.sourceHash !== p.sourceHash,
          }
        : null,
    };
  });
  const extracted = rows.filter((r) => r.facts).length;
  const pending = rows.length - extracted;
  return (
    <>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border text-center sm:max-w-xl">
        <Stat label="كل المنتجات" value={rows.length} />
        <Stat label="محفوظة مقاساتها" value={extracted} tone="ok" />
        <Stat label="لم تُقرأ بعد" value={pending} tone={pending > 0 ? "warn" : undefined} />
      </dl>
      {pending > 0 && <p className="text-sm leading-6 text-muted">المنتجات التي لم تُقرأ بعد ستقرأها رصّة عند أول طلب يحتويها.</p>}
      <CatalogTable rows={rows} demoMode={appEnv().DEMO_MODE} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`ltr-nums mt-1 font-display text-2xl font-bold ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : ""}`}>{value}</dd>
    </div>
  );
}
