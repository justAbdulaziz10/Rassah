import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/PageHeader";
import Shop, { type ShopProduct } from "@/components/store/Shop";
import { repoOrError } from "@/lib/http";
import { CATEGORY_LABEL, MAX_QTY_PER_LINE, MAX_UNITS, PRICE_SAR } from "@/lib/store/catalog";

export default function StorePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">كل ما تحتاجه، مغلّفاً بعناية</h1>
        <p className="mt-2 text-muted">أضف ما يعجبك إلى السلة وأكمل طلبك.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-border/50" aria-hidden />}>
        <Products />
      </Suspense>
    </div>
  );
}

async function Products() {
  await connection();
  const repo = repoOrError();
  if (repo instanceof Response) return <Notice tone="warn">المتجر غير متاح الآن. حاول بعد قليل.</Notice>;
  const products: ShopProduct[] = (await repo.listProducts())
    .filter((p) => PRICE_SAR[p.id] !== undefined)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category ?? "general",
      categoryLabel: CATEGORY_LABEL[p.category ?? "general"] ?? "منوعات",
      priceSar: PRICE_SAR[p.id],
    }));
  return <Shop products={products} maxUnits={MAX_UNITS} maxPerLine={MAX_QTY_PER_LINE} />;
}
