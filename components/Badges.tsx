import type { DataSource } from "@/lib/engine/types";
import { SOURCE_LABEL } from "@/lib/ui/format";

const SOURCE_STYLE: Record<DataSource, string> = {
  page: "bg-ok-soft text-ok",
  inferred: "bg-warn-soft text-warn border border-dashed border-warn",
  manual: "bg-info-soft text-info",
  unknown: "bg-critical-soft text-critical",
};

export function SourceBadge({ source, title }: { source: DataSource; title?: string }) {
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${SOURCE_STYLE[source]}`}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function FlagChips({ fragile, liquid, sensitive }: { fragile: boolean; liquid: boolean; sensitive: boolean }) {
  if (!fragile && !liquid && !sensitive) return <span className="text-xs text-muted">عادي</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {fragile && <span className="whitespace-nowrap rounded bg-fragile-soft px-1.5 py-0.5 text-xs font-medium text-fragile">قابل للكسر</span>}
      {liquid && <span className="whitespace-nowrap rounded bg-liquid-soft px-1.5 py-0.5 text-xs font-medium text-liquid">سائل</span>}
      {sensitive && <span className="whitespace-nowrap rounded bg-sensitive-soft px-1.5 py-0.5 text-xs font-medium text-sensitive">حساس</span>}
    </span>
  );
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  const style =
    status === "box_found"
      ? "bg-ok-soft text-ok"
      : status === "needs_measurement"
        ? "bg-warn-soft text-warn"
        : "bg-critical-soft text-critical";
  return <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}
