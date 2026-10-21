import Shop from "@/components/Shop";
import { CATEGORY_LABEL, PRODUCTS } from "@/lib/catalog";

export default function StorePage() {
  const products = PRODUCTS.map((p) => ({ ...p, categoryLabel: CATEGORY_LABEL[p.category] ?? p.category }));
  return <Shop products={products} />;
}
