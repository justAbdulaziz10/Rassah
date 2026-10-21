"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "./Icons";

export default function OrderLookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Arabic-Indic digits → Latin, and "01002" → "1002" (order numbers never start with 0).
    const n = value
      .trim()
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/^0+(?=\d)/, "");
    if (!/^\d{1,10}$/.test(n)) {
      setError("اكتب رقم الطلب بالأرقام فقط");
      return;
    }
    router.push(`/orders/${n}`);
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end" role="search" aria-label="فتح طلب برقمه">
      <div className="flex items-center gap-2">
        <label htmlFor="order" className="shrink-0 text-sm text-muted">
          رقم الطلب
        </label>
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <SearchIcon className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted" />
          <input
            id="order"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            placeholder="1002"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "order-error" : undefined}
            className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 placeholder:text-muted/60 sm:w-36"
          />
        </div>
        <button type="submit" className="h-11 shrink-0 rounded-lg bg-brand px-5 font-bold text-brand-contrast hover:opacity-90">
          افتح
        </button>
      </div>
      {error && (
        <p id="order-error" className="text-sm text-critical">
          {error}
        </p>
      )}
    </form>
  );
}
