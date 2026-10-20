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
      setError("رقم الطلب أرقام فقط");
      return;
    }
    router.push(`/orders/${n}${outage ? "?outage=1" : ""}`);
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-surface p-4">
      <label htmlFor="order" className="block font-medium">
        رقم الطلب
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
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
          className="w-40 rounded border border-border bg-background px-3 py-2 text-lg"
        />
        <button type="submit" className="rounded bg-brand px-5 py-2 font-medium text-brand-contrast">
          جهّز الطلب
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      {demoMode && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} />
          <span>
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs text-warn">تحكم العرض</span> محاكاة تعطل Gemini
          </span>
        </label>
      )}
    </form>
  );
}
