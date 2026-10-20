import type { Metadata } from "next";

export const metadata: Metadata = { title: "الكتالوج" };

export default function CatalogPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">الكتالوج</h1>
      <p className="mt-2 text-muted">قيد البناء (المرحلة 7).</p>
    </section>
  );
}
