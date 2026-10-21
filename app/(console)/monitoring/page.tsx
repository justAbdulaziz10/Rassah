import type { Metadata } from "next";
import { Suspense } from "react";
import MonitoringDashboard from "@/components/MonitoringDashboard";
import { CardSkeleton, PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "الأداء" };

export default function MonitoringPage(props: PageProps<"/monitoring">) {
  return (
    <div className="space-y-5">
      <PageHeader title="الأداء">
        كيف تعمل رصّة على طلباتك: سرعة التجهيز، ودقة قراءة المنتجات، وتكلفة كل طلب. طلبات الاختبار التجريبية لا تدخل في هذه الأرقام.
      </PageHeader>
      <Suspense fallback={<CardSkeleton />}>
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
