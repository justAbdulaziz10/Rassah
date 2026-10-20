import type { Metadata } from "next";

export const metadata: Metadata = { title: "التقييم" };

export default function EvaluationPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">التقييم</h1>
      <p className="mt-2 text-muted">قيد البناء (المرحلة 9).</p>
    </section>
  );
}
