import type { ReactNode } from "react";

/** Page title with a one-line explanation of what the page is for. Shared by the console pages. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="border-b border-border pb-4">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      {children && <p className="mt-1.5 max-w-3xl leading-7 text-muted">{children}</p>}
    </header>
  );
}

/** An empty state says what happened and what to do next. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
    </div>
  );
}

/** Loading placeholder with the same radius and border as the cards it stands in for. */
export function CardSkeleton({ className = "h-96" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg border border-border bg-surface ${className}`} aria-hidden />;
}
