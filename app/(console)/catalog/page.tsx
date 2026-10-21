import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import CatalogTable, { type CatalogRow } from "@/components/CatalogTable";
import { appEnv } from "@/lib/env";
import { repoOrError } from "@/lib/http";

export const metadata: Metadata = { title: "الكتالوج" };

export default function CatalogPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">الكتالوج</h1>
        <p className="mt-1 text-muted">
          الحقائق المحفوظة لكل منتج. كل منتج يُقرأ بالـ AI مرة وحدة بس، والقياس اليدوي والتصحيح ما ينكتب فوقه أبداً.
        </p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-border/50" />}>
        <Catalog />
      </Suspense>
    </div>
  );
}

async function Catalog() {
  await connection();
  const repo = repoOrError();
  if (repo instanceof Response) {
    return <p className="rounded-lg border border-warn bg-warn-soft p-4 text-sm">قاعدة البيانات غير مهيأة.</p>;
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
            confidence: f.confidence,
            evidence: f.evidence,
            origin: f.origin,
            extractedAt: f.extractedAt,
            stale: f.origin === "ai" && f.sourceHash !== p.sourceHash,
          }
        : null,
    };
  });
  const extracted = rows.filter((r) => r.facts).length;
  const seeded = rows.filter((r) => r.facts?.origin === "seeded").length;
  return (
    <>
      <p className="text-sm text-muted">
        <span className="ltr-nums">{extracted}</span> من <span className="ltr-nums">{rows.length}</span> منتج لها حقائق محفوظة
      </p>
      {seeded > 0 && (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">
          وضع بدون اتصال: <span className="ltr-nums">{seeded}</span> منتج حقائقها «بيانات تجريبية» محمّلة مسبقاً من بيانات الاختبار، وليست من
          الـ AI. لإيقافها: <code className="ltr-nums">MEMORY_SEED_FACTS=false</code>.
        </p>
      )}
      <CatalogTable rows={rows} demoMode={appEnv().DEMO_MODE} />
    </>
  );
}
