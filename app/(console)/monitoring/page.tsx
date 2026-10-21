import type { Metadata } from "next";
import { Suspense } from "react";
import MonitoringDashboard from "@/components/MonitoringDashboard";
import { DashboardSkeleton, PageHeader } from "@/components/PageHeader";
import { isUuid } from "@/lib/http";

export const metadata: Metadata = { title: "الأداء" };

export default function MonitoringPage(props: PageProps<"/monitoring">) {
  return (
    <div className="space-y-5">
      <PageHeader title="الأداء">
        سرعة التجهيز، ودقة قراءة المنتجات، وتكلفة كل طلب.
      </PageHeader>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/monitoring">, "searchParams">) {
  const sp = await searchParams;
  const run = typeof sp.run === "string" && isUuid(sp.run) ? sp.run : null;
  return <MonitoringDashboard initialRun={run} />;
}
