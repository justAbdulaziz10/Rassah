import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { repoOrError } from "@/lib/http";
import { REASON_LABEL } from "@/lib/orders/labels";
import { loadQueue, type QueueSnapshot } from "@/lib/orders/load";
import type { QueueEntry } from "@/lib/orders/queue";
import { fmtPieces, fmtTime } from "@/lib/ui/format";

export const metadata: Metadata = { title: "الإشعارات" };

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">الإشعارات</h1>
        <p className="mt-1 text-muted">ما ينتظرك الآن، الأهم أولاً. تتحدّث الأرقام في الأعلى تلقائياً كل 20 ثانية.</p>
      </header>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-border/50" />}>
        <Inbox />
      </Suspense>
    </div>
  );
}

async function Inbox() {
  await connection();
  const repo = repoOrError();
  if (repo instanceof Response) {
    return <p className="rounded-xl border border-warn bg-warn-soft p-4 text-sm">لم يُربط النظام بقاعدة البيانات بعد.</p>;
  }
  let snap: QueueSnapshot;
  try {
    snap = await loadQueue(repo);
  } catch {
    return <p className="rounded-xl border border-critical bg-critical-soft p-4 text-sm">تعذّر تحميل الإشعارات. حدّث الصفحة بعد قليل.</p>;
  }

  const attention = snap.entries.filter((e) => e.state === "attention");
  const fresh = snap.entries.filter((e) => e.state === "new");
  const ready = snap.entries.filter((e) => e.state === "ready");
  const nothing = attention.length + fresh.length + ready.length + snap.alerts.length === 0;

  if (nothing) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-lg font-bold text-ok">✓ لا شيء ينتظرك الآن</p>
        <p className="mt-1 text-sm text-muted">كل الطلبات مغلّفة ولا توجد تنبيهات.</p>
      </div>
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
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn/60 bg-warn-soft/40 px-4 py-3 hover:bg-warn-soft"
              >
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.severity === "critical" ? "bg-critical text-white" : "bg-warn text-white"}`}>
                  {a.severity === "critical" ? "عاجل" : "تنبيه"}
                </span>
                <span className="flex-1">{a.message}</span>
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

const DOT: Record<string, string> = { critical: "bg-critical", warn: "bg-warn", brand: "bg-brand", info: "bg-info" };

function Group({ title, tone, count, hint, children }: { title: string; tone: string; count: number; hint: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="flex items-center gap-2 font-bold">
        <span className={`size-2.5 rounded-full ${DOT[tone]}`} aria-hidden />
        {title}
        <span className="ltr-nums rounded-full bg-border/60 px-2 text-xs">{count}</span>
      </h2>
      <p className="mb-2 mt-0.5 text-sm text-muted">{hint}</p>
      <ul className="space-y-2">{children}</ul>
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
        className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-4 py-3 transition-colors ${
          critical ? "border-critical bg-critical-soft/50 hover:bg-critical-soft" : "border-border bg-surface hover:border-brand"
        }`}
      >
        <span className="ltr-nums font-bold">#{entry.order.id}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{names.join("، ")}</span>
        <span className={`text-sm ${critical ? "font-bold text-critical" : "text-muted"}`}>{detail}</span>
        <span className="text-sm font-bold text-brand">{action} ←</span>
      </Link>
    </li>
  );
}
