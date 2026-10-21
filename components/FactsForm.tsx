"use client";

import { useState } from "react";

export interface FactsFormValues {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightG: number | null;
  fragile: boolean;
  liquid: boolean;
  sensitive: boolean;
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

export default function FactsForm({ initial, mode, submitLabel, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<FactsFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const changes: Partial<FactsFormValues> = {};
    for (const f of NUM_FIELDS) {
      const v = values[f.key];
      if (mode === "measure" && (v === null || !(v > 0))) {
        setError("أدخل الطول والعرض والارتفاع والوزن جميعاً");
        return;
      }
      if (v !== initial[f.key] && v !== null) changes[f.key] = v;
    }
    // Editing one side means the packer measured the item: send all three so the size counts as measured.
    if (mode === "edit" && (["lengthCm", "widthCm", "heightCm"] as const).some((k) => k in changes)) {
      for (const k of ["lengthCm", "widthCm", "heightCm"] as const) if (values[k] !== null) changes[k] = values[k];
    }
    for (const k of ["fragile", "liquid", "sensitive"] as const) {
      if (values[k] !== initial[k]) changes[k] = values[k];
    }
    if (Object.keys(changes).length === 0) {
      setError("لم تغيّر أي قيمة");
      return;
    }
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
        {(
          [
            ["fragile", "قابل للكسر"],
            ["liquid", "سائل"],
            ["sensitive", "حساس"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 py-1">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.checked })} />
            {label}
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
