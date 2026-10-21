import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AlertIcon, ArrowForwardIcon, BellIcon, BoxIcon, PackageCheckIcon } from "@/components/Icons";
import { ListSkeleton, Notice, PageHeader, EmptyState } from "@/components/PageHeader";
import { repoOrError } from "@/lib/http";
import { REASON_LABEL } from "@/lib/orders/labels";
import { loadQueue, type QueueSnapshot } from "@/lib/orders/load";
import type { QueueEntry } from "@/lib/orders/queue";
import { fmtPieces, fmtTime } from "@/lib/ui/format";

export const metadata: Metadata = { title: "الإشعارات" };

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="الإشعارات">ما ينتظرك الآن، الأهم أولاً.</PageHeader>
      <Suspense fallback={<ListSkeleton />}>
        <Inbox />
      </Suspense>
    </div>
  );
}

async function Inbox() {
  await connection();
  const repo = repoOrError();
  if (repo instanceof Response) {
    return <Notice tone="warn">لم يُربط النظام بقاعدة البيانات بعد، فلا تظهر الإشعارات. أخبر مسؤول النظام.</Notice>;
  }
  let snap: QueueSnapshot;
  try {
    snap = await loadQueue(repo);
  } catch {
    return <Notice tone="critical">تعذّر تحميل الإشعارات. حدّث الصفحة بعد قليل، وإن تكرر الأمر فأبلغ مسؤول النظام.</Notice>;
  }

  const attention = snap.entries.filter((e) => e.state === "attention");
  const fresh = snap.entries.filter((e) => e.state === "new");
  const ready = snap.entries.filter((e) => e.state === "ready");
  const nothing = attention.length + fresh.length + ready.length + snap.alerts.length === 0;

  if (nothing) {
    return (
      <EmptyState tone="ok" title="لا شيء ينتظرك الآن">
        كل الطلبات مغلّفة ولا توجد تنبيهات. سيظهر هنا أي طلب جديد أو طلب يحتاج قياساً.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      {attention.length > 0 && (
        <Group title="تحتاج تدخّلك" tone="critical" count={attention.length} hint="لن تُغلَّف هذه الطلبات حتى تعالجها.">
          {attention.map((e) => (
            <Row key={e.order.id} entry={e} snap={snap} tone="critical" detail={e.reason ? REASON_LABEL[e.reason] : ""} action="عالجه" />
          ))}
        </Group>
      )}

      {snap.alerts.length > 0 && (
        <Group title="تنبيهات النظام" tone="warn" count={snap.alerts.length} hint="شيء في النظام يعمل بأقل من المعتاد. التفاصيل في صفحة الأداء.">
          {snap.alerts.map((a) => (
            <li key={a.id ?? a.rule}>
              <Link
                href="/monitoring"
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-warn/60 bg-warn-soft/40 px-4 py-3.5 hover:bg-warn-soft"
              >
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${a.severity === "critical" ? "bg-critical text-white" : "bg-warn text-white"}`}>
                  <AlertIcon className="size-3.5" />
                  {a.severity === "critical" ? "عاجل" : "تنبيه"}
                </span>
                <span className="min-w-0 flex-1 leading-6">{a.message}</span>
                {a.createdAt && <span className="text-xs text-muted">{fmtTime(a.createdAt)}</span>}
              </Link>
            </li>
          ))}
        </Group>
      )}

      {fresh.length > 0 && (
        <Group title="طلبات جديدة" tone="brand" count={fresh.length} hint="وصلت ولم يجهّزها أحد بعد.">
          {fresh.map((e) => (
            <Row key={e.order.id} entry={e} snap={snap} tone="brand" detail={fmtPieces(e.order.unitCount)} action="جهّزه" />
          ))}
        </Group>
      )}

      {ready.length > 0 && (
        <Group title="بانتظار تأكيدك" tone="info" count={ready.length} hint="اختارت رصّة الكرتون، وبقي أن تغلّف الطلب وتضغط «تأكيد التغليف».">
          {ready.map((e) => (
            <Row
              key={e.order.id}
              entry={e}
              snap={snap}
              tone="info"
              detail={e.lastPreparedAt ? `جُهّز ${fmtTime(e.lastPreparedAt)}` : ""}
              action="أكمله"
            />
          ))}
        </Group>
      )}
    </div>
  );
}

const TONE: Record<string, { dot: string; Icon: typeof AlertIcon }> = {
  critical: { dot: "bg-critical-soft text-critical", Icon: AlertIcon },
  warn: { dot: "bg-warn-soft text-warn", Icon: BellIcon },
  brand: { dot: "bg-brand/15 text-brand", Icon: BoxIcon },
  info: { dot: "bg-info-soft text-info", Icon: PackageCheckIcon },
};

function Group({ title, tone, count, hint, children }: { title: string; tone: string; count: number; hint: string; children: ReactNode }) {
  const { dot, Icon } = TONE[tone];
  return (
    <section aria-labelledby={`g-${tone}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${dot}`}>
          <Icon className="size-[18px]" />
        </span>
        <div>
          <h2 id={`g-${tone}`} className="flex items-center gap-2 text-lg font-bold leading-8">
            {title}
            <span className="ltr-nums rounded-full bg-border/70 px-2 text-xs font-medium">{count}</span>
          </h2>
          <p className="text-sm leading-6 text-muted">{hint}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">{children}</ul>
    </section>
  );
}

function Row({ entry, snap, tone, detail, action }: { entry: QueueEntry; snap: QueueSnapshot; tone: string; detail: string; action: string }) {
  const names = entry.order.productIds.map((id) => snap.products.get(id)?.name ?? id);
  const critical = tone === "critical";
  return (
    <li>
      <Link
        href={`/orders/${entry.order.id}`}
        className={`group flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3.5 transition-colors ${
          critical ? "border-critical bg-critical-soft/50 hover:bg-critical-soft" : "border-border bg-surface hover:border-brand"
        }`}
      >
        <span className="ltr-nums text-lg font-bold">#{entry.order.id}</span>
        <span className="order-last w-full min-w-0 truncate text-sm sm:order-none sm:w-auto sm:flex-1">{names.join("، ")}</span>
        {detail && <span className={`text-sm ${critical ? "font-bold text-critical" : "text-muted"}`}>{detail}</span>}
        <span className="ms-auto inline-flex items-center gap-1 text-sm font-bold text-brand sm:ms-0">
          {action}
          <ArrowForwardIcon className="size-4 transition-transform group-hover:-translate-x-0.5" />
        </span>
      </Link>
    </li>
  );
}
