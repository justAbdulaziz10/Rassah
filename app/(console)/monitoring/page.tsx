import type { Metadata } from "next";
import { Suspense } from "react";
import MonitoringDashboard from "@/components/MonitoringDashboard";

export const metadata: Metadata = { title: "المراقبة" };

export default function MonitoringPage(props: PageProps<"/monitoring">) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">المراقبة</h1>
        <p className="mt-1 text-muted">
          سبعة مؤشرات، كل واحد يكشف مشكلة في مرحلة محددة: جودة الـ AI، والبيانات، والمحرك، والأداء، وGemini، والتكلفة. التقييم التجريبي مستبعد من هذه الأرقام.
        </p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-border/50" />}>
        <Dashboard searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/monitoring">, "searchParams">) {
  const sp = await searchParams;
  const run = typeof sp.run === "string" && /^[0-9a-f-]{36}$/i.test(sp.run) ? sp.run : null;
  return <MonitoringDashboard initialRun={run} />;
}
