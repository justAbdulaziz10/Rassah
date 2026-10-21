"use client";

import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="mt-2 text-muted">جرّب مرة ثانية. إذا تكرر الخطأ، راجع صفحة المراقبة.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 rounded-md bg-brand px-4 py-2 text-brand-contrast"
      >
        حاول مرة ثانية
      </button>
    </section>
  );
}
