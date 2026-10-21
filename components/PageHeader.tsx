import type { ReactNode } from "react";
import { AlertIcon, CheckIcon, InfoIcon } from "./Icons";

/** Page title with a one-line explanation of what the page is for. Shared by the console pages. `actions` sits beside the title (wraps below it on phones). */
export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-border pb-5">
      <div className="min-w-0 max-w-3xl">
        <h1 className="font-display text-[1.7rem] font-bold leading-tight sm:text-3xl">{title}</h1>
        {children && <p className="mt-2 leading-7 text-muted">{children}</p>}
      </div>
      {actions}
    </header>
  );
}

/** An empty state says what happened and what to do next. `tone="ok"` is for "nothing to do", which is good news. */
export function EmptyState({ title, children, tone = "neutral" }: { title: string; children?: ReactNode; tone?: "neutral" | "ok" }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
      {tone === "ok" && (
        <span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-ok-soft text-xl text-ok">
          <CheckIcon />
        </span>
      )}
      <p className={`font-medium ${tone === "ok" ? "text-lg font-bold text-ok" : ""}`}>{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted">{children}</p>}
    </div>
  );
}

/** A notice that explains a problem and what to do about it. Colour is never the only signal: each tone has its icon. */
export function Notice({ tone, children }: { tone: "warn" | "critical" | "info"; children: ReactNode }) {
  const style = {
    warn: "border-warn bg-warn-soft",
    critical: "border-critical bg-critical-soft",
    info: "border-info bg-info-soft",
  }[tone];
  const Icon = tone === "info" ? InfoIcon : AlertIcon;
  return (
    <div role={tone === "info" ? "note" : "alert"} className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${style}`}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** Loading placeholder with the same radius and border as the cards it stands in for. */
function CardSkeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl border border-border bg-surface ${className}`} aria-hidden />;
}

function Bar({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Skeleton for the order queue: summary panel, filter chips, card grid. Same shape as the loaded page, so nothing jumps. */
export function QueueSkeleton() {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-label="جارٍ تحميل الطلبات">
      <div className="panel p-5">
        <Bar className="h-8 w-56" />
        <Bar className="mt-4 h-2 w-full rounded-full" />
        <Bar className="mt-3 h-3 w-28" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[88, 112, 80, 120, 104].map((w, i) => (
          <div key={i} className="skeleton h-9 shrink-0 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="panel space-y-3 p-4">
            <div className="flex justify-between">
              <Bar className="h-6 w-20" />
              <Bar className="h-6 w-24 rounded-full" />
            </div>
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-2/3" />
            <Bar className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for row lists (notifications). */
export function ListSkeleton() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-label="جارٍ التحميل">
      <div>
        <Bar className="h-5 w-40" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="panel flex items-center gap-4 px-4 py-4">
              <Bar className="h-5 w-16" />
              <Bar className="h-4 flex-1" />
              <Bar className="hidden h-4 w-20 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Skeleton for a table card. */
export function TableSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3" role="status" aria-label="جارٍ تحميل الجدول">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <Bar key={i} className="h-8 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="panel overflow-hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-border px-4 py-4 last:border-0">
            <Bar className="h-4 w-48" />
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-16" />
            <Bar className="hidden h-4 w-28 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the monitoring dashboard: tiles then charts. */
export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-label="جارٍ تحميل الأرقام">
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Bar key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="panel space-y-3 p-4">
            <Bar className="h-3 w-3/4" />
            <Bar className="h-8 w-1/2" />
            <Bar className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton className="h-72" />
        <CardSkeleton className="h-72" />
      </div>
    </div>
  );
}
