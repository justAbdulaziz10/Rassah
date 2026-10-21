import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import CatalogTable, { type CatalogRow } from "@/components/CatalogTable";
import { appEnv } from "@/lib/env";
import { repoOrError } from "@/lib/http";
import { CardSkeleton, PageHeader } from "@/components/PageHeader";
import { fmtCount } from "@/lib/ui/format";

export const metadata: Metadata = { title: "المنتجات" };

export default function CatalogPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="المنتجات">
        مقاسات وأوزان كل منتج كما حفظتها رصّة. تقرأ رصّة صفحة المنتج مرة واحدة وتحفظ ما وجدته، وما يقيسه الموظف أو يصحّحه لا
        يُستبدل بقراءة جديدة أبداً.
      </PageHeader>
      <Suspense fallback={<CardSkeleton />}>
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
      <p className="rounded-lg border border-warn bg-warn-soft p-4 text-sm">
        قاعدة البيانات غير جاهزة، فلا يمكن عرض الكتالوج. أخبر مسؤول النظام.
      </p>
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
  const products_ = (n: number) => fmtCount(n, { one: "منتج واحد", two: "منتجان", few: "منتجات", many: "منتجاً" });
  return (
    <>
      <p className="text-sm text-muted">
        البيانات محفوظة لـ <strong className="text-foreground">{products_(extracted)}</strong> من أصل{" "}
        <span className="ltr-nums">{rows.length}</span>. أما الباقي فلم تقرأه رصّة بعد، وسيُقرأ عند أول طلب يحتويه.
      </p>
      {seeded > 0 && (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm leading-7 text-muted">
          <strong className="text-foreground">نسخة تجريبية:</strong> بيانات {products_(seeded)} جاهزة مسبقاً للعرض، ولم تقرأها رصّة
          من صفحات المنتجات. اضغط «إعادة القراءة» بجانب أي منتج لتقرأه رصّة من صفحته.
        </p>
      )}
      <CatalogTable rows={rows} demoMode={appEnv().DEMO_MODE} />
    </>
  );
}
