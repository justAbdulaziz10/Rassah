"use client";

import { useState } from "react";
import { FLAG_LABEL, FLAGS } from "./Badges";

export interface FactsFormValues {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightG: number | null;
  fragile: boolean;
  liquid: boolean;
  sensitive: boolean;
}

/** Form values from stored facts; a product with no facts yet starts empty. */
export function toFormValues(facts: Partial<FactsFormValues> | null | undefined): FactsFormValues {
  return {
    lengthCm: facts?.lengthCm ?? null,
    widthCm: facts?.widthCm ?? null,
    heightCm: facts?.heightCm ?? null,
    weightG: facts?.weightG ?? null,
    fragile: facts?.fragile ?? false,
    liquid: facts?.liquid ?? false,
    sensitive: facts?.sensitive ?? false,
  };
}

interface Props {
  initial: FactsFormValues;
  /** "measure": all four numbers are required (product had no usable data). */
  mode: "edit" | "measure";
  submitLabel: string;
  onSubmit: (changes: Partial<FactsFormValues>) => Promise<string | null>;
  onCancel?: () => void;
}

const NUM_FIELDS: Array<{ key: "lengthCm" | "widthCm" | "heightCm" | "weightG"; label: string; max: number }> = [
  { key: "lengthCm", label: "الطول (سم)", max: 150 },
  { key: "widthCm", label: "العرض (سم)", max: 150 },
  { key: "heightCm", label: "الارتفاع في وضع الوقوف (سم)", max: 150 },
  { key: "weightG", label: "الوزن (جم)", max: 30000 },
];

/**
 * What the form sends: an error to show, or the fields to save.
 * - measure: every number, even one that matches the stored guess (it is now measured).
 * - edit: only the fields whose value changed, each side on its own, so the sides still
 *   guessed keep their safety margin (the server marks the size measured only when all three
 *   sides are sent).
 */
export function factChanges(
  values: FactsFormValues,
  initial: FactsFormValues,
  mode: Props["mode"],
): { error: string } | { changes: Partial<FactsFormValues> } {
  const changes: Partial<FactsFormValues> = {};
  for (const f of NUM_FIELDS) {
    const v = values[f.key];
    if (mode === "measure" && (v === null || !(v > 0))) return { error: "أدخل الطول والعرض والارتفاع والوزن جميعاً" };
    if (v !== null && (mode === "measure" || v !== initial[f.key])) changes[f.key] = v;
  }
  for (const k of FLAGS) {
    if (values[k] !== initial[k]) changes[k] = values[k];
  }
  if (Object.keys(changes).length === 0) return { error: "لم تغيّر أي قيمة" };
  return { changes };
}

export default function FactsForm({ initial, mode, submitLabel, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<FactsFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const built = factChanges(values, initial, mode);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    const { changes } = built;
    setBusy(true);
    try {
      const err = await onSubmit(changes);
      if (err) setError(err);
    } catch {
      setError("تعذّر الاتصال. تأكد من الإنترنت ثم حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-xl border border-border bg-background p-4 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUM_FIELDS.map((f) => (
          <label key={f.key} className="grid content-start gap-1">
            <span className="font-medium text-muted">{f.label}</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0.1"
              max={f.max}
              dir="ltr"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-10 rounded-lg border border-border bg-surface px-2.5"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {FLAGS.map((k) => (
          <label key={k} className="flex items-center gap-2 py-1">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.checked })} />
            {FLAG_LABEL[k]}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="font-medium text-critical">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 font-bold text-brand-contrast hover:opacity-90 disabled:opacity-50">
          {busy ? "جارٍ الحفظ…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 hover:border-brand">
            إلغاء
          </button>
        )}
      </div>
    </form>
  );
}
