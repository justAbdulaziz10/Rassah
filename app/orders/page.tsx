import type { Metadata } from "next";

export const metadata: Metadata = { title: "الطلبات" };

export default function OrdersPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">الطلبات</h1>
      <p className="mt-2 text-muted">قيد البناء (المرحلة 7).</p>
    </section>
  );
}
