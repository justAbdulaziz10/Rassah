"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtCount } from "@/lib/ui/format";
import { BellIcon, CrossIcon } from "./Icons";

interface QueueSummary {
  counts: { new: number; ready: number; attention: number; done: number; remaining: number; total: number };
  alertsOpen: number;
  newOrderIds: string[];
  attentionOrderIds: string[];
  remainingOrderIds: string[];
}

/** Fired by pages that change an order's state (e.g. confirming packing) so the badges update at once. */
export const QUEUE_CHANGED = "rassah:queue-changed";

const POLL_MS = 20_000;

const NAV = [
  { href: "/orders", label: "الطلبات" },
  { href: "/notifications", label: "الإشعارات" },
  { href: "/catalog", label: "المنتجات" },
  { href: "/monitoring", label: "الأداء" },
  { href: "/evaluation", label: "الدقة" },
] as const;

function Badge({ n, tone, label }: { n: number; tone: "brand" | "critical"; label: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-label={label}
      className={`ltr-nums ms-1.5 inline-grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold leading-5 ${
        tone === "critical" ? "bg-critical text-white" : "bg-brand text-brand-contrast"
      }`}
    >
      {n}
    </span>
  );
}

export default function ConsoleNav() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [arrived, setArrived] = useState<string[]>([]);
  const [failures, setFailures] = useState(0);
  const known = useRef<Set<string> | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await fetch("/api/orders/queue", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as QueueSummary;
      // Several refreshes can overlap (poll, focus, confirm); only the latest one may update the numbers.
      if (mine !== seq.current) return;
      // An unfinished order we have not seen since this tab opened is a newly arrived order, whatever its state.
      if (known.current) {
        const fresh = data.remainingOrderIds.filter((id) => !known.current!.has(id));
        if (fresh.length > 0) setArrived((a) => [...new Set([...a, ...fresh])]);
      }
      known.current = new Set([...(known.current ?? []), ...data.remainingOrderIds]);
      setSummary(data);
      setFailures(0);
    } catch {
      // Offline or the server is restarting: keep the last numbers, flag them after repeated failures, retry next tick.
      if (mine === seq.current) setFailures((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    // Refresh on every page change too, so the numbers follow what the employee just did.
    const first = window.setTimeout(refresh, 0);
    const id = window.setInterval(refresh, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(QUEUE_CHANGED, onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(QUEUE_CHANGED, onFocus);
    };
  }, [refresh, pathname]);

  const c = summary?.counts;
  // The bell counts what needs action now; new orders already show on the orders badge.
  const alertsCount = c ? c.attention + summary.alertsOpen : 0;

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = alertsCount > 0 ? `(${alertsCount}) ${base}` : base;
  }, [alertsCount, pathname]);

  return (
    <>
      <nav className="mx-auto flex max-w-6xl items-center gap-x-5 px-4 py-2.5" aria-label="التنقل الرئيسي">
        <Link href="/" className="shrink-0 font-display text-2xl font-bold leading-none text-brand" aria-label="رصّة، الصفحة الرئيسية">
          رصّة
        </Link>
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
        <ul className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-0.5 text-sm [scrollbar-width:none]">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center rounded-lg px-3 py-2 transition-colors ${
                    active ? "bg-brand/12 font-bold text-foreground" : "text-muted hover:bg-border/40 hover:text-foreground"
                  }`}
                >
                  {item.href === "/notifications" && <BellIcon className="me-1.5 size-4" />}
                  {item.label}
                  {item.href === "/orders" && c && (
                    <Badge n={c.remaining} tone={c.attention > 0 ? "critical" : "brand"} label={`${c.remaining} طلب متبقٍ`} />
                  )}
                  {item.href === "/notifications" && <Badge n={alertsCount} tone="critical" label={`${alertsCount} إشعار`} />}
                </Link>
              </li>
            );
          })}
        </ul>
        {failures >= 2 && (
          <span role="status" className="hidden shrink-0 text-xs text-warn sm:inline" title="الأرقام المعروضة قد تكون قديمة. ستُحدَّث تلقائياً عند عودة الاتصال.">
            تعذّر تحديث الأرقام
          </span>
        )}
      </nav>

      {arrived.length > 0 && (
        <div role="status" className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-xl border border-brand bg-surface px-4 py-3 text-sm shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]">
          <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
          <span>
            {arrived.length === 1 ? (
              <>
                وصل طلب جديد <span className="ltr-nums font-bold">#{arrived[0]}</span>
              </>
            ) : (
              <>وصل {fmtCount(arrived.length, { one: "طلب جديد", two: "طلبان جديدان", few: "طلبات جديدة", many: "طلباً جديداً" })}</>
            )}
          </span>
          <Link href={arrived.length === 1 ? `/orders/${arrived[0]}` : "/orders?show=new"} onClick={() => setArrived([])} className="font-bold text-brand underline-offset-4 hover:underline">
            افتح
          </Link>
          <button type="button" onClick={() => setArrived([])} className="grid size-7 place-items-center rounded-md text-muted hover:bg-border/40 hover:text-foreground" aria-label="إغلاق">
            <CrossIcon className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
