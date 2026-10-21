import type { DataSource } from "@/lib/engine/types";
import { SOURCE_LABEL, STATUS_LABEL } from "@/lib/ui/format";

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

/** Handling flags, in the order they are shown everywhere. */
export const FLAGS = ["fragile", "liquid", "sensitive"] as const;
export type Flag = (typeof FLAGS)[number];

export const FLAG_LABEL: Record<Flag, string> = {
  fragile: "قابل للكسر",
  liquid: "سائل",
  sensitive: "حساس",
};

const FLAG_COLOR: Record<Flag, { bg: string; text: string }> = {
  fragile: { bg: "bg-fragile-soft", text: "text-fragile" },
  liquid: { bg: "bg-liquid-soft", text: "text-liquid" },
  sensitive: { bg: "bg-sensitive-soft", text: "text-sensitive" },
};

/** One handling chip. `inRow`: it sits in a row that already sets the text size and wrapping (the order cards). */
export function FlagChip({ flag, inRow = false }: { flag: Flag; inRow?: boolean }) {
  const { bg, text } = FLAG_COLOR[flag];
  return (
    <span className={`${inRow ? "" : "whitespace-nowrap "}rounded ${bg} px-1.5 py-0.5 ${inRow ? "" : "text-xs "}font-medium ${text}`}>{FLAG_LABEL[flag]}</span>
  );
}

export function FlagChips(flags: Record<Flag, boolean>) {
  const on = FLAGS.filter((f) => flags[f]);
  if (on.length === 0) return <span className="text-xs text-muted">عادي</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {on.map((f) => (
        <FlagChip key={f} flag={f} />
      ))}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const style =
    status === "box_found"
      ? "bg-ok-soft text-ok"
      : status === "needs_measurement"
        ? "bg-warn-soft text-warn"
        : "bg-critical-soft text-critical";
  return <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${style}`}>{STATUS_LABEL[status] ?? status}</span>;
}
