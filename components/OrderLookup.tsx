"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OrderLookup({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [outage, setOutage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = value.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (!/^\d{1,10}$/.test(n)) {
      setError("اكتب رقم الطلب بالأرقام فقط");
      return;
    }
    router.push(`/orders/${n}${outage ? "?outage=1" : ""}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor="order" className="text-sm text-muted">
          رقم الطلب
        </label>
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
          className="w-28 rounded-lg border border-border bg-surface px-3 py-2"
        />
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 font-medium text-brand-contrast hover:opacity-90">
          افتح
        </button>
      </div>
      {error && (
        <p id="order-error" className="text-sm text-critical">
          {error}
        </p>
      )}
      {demoMode && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} />
          للعرض فقط: جرّب الطلب كأن خدمة القراءة الآلية متوقفة
        </label>
      )}
    </form>
  );
}
