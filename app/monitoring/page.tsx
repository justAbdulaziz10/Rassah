import type { Metadata } from "next";

export const metadata: Metadata = { title: "المراقبة" };

export default function MonitoringPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">المراقبة</h1>
      <p className="mt-2 text-muted">قيد البناء (المرحلة 8).</p>
    </section>
  );
}
