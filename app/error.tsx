"use client";

import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="mt-3 text-muted">لم نتمكن من عرض هذه الصفحة. جرّب مرة أخرى، وإذا تكرر الخطأ فأبلغ الفريق التقني.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 rounded-md bg-brand px-5 py-2.5 font-medium text-brand-contrast"
      >
        حاول مرة أخرى
      </button>
    </section>
  );
}
