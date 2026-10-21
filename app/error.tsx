"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertIcon } from "@/components/Icons";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center" role="alert">
      <span className="grid size-14 place-items-center rounded-full bg-warn-soft text-3xl text-warn">
        <AlertIcon />
      </span>
      <h1 className="mt-5 font-display text-3xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="mt-3 leading-7 text-muted">لم نتمكن من عرض هذه الصفحة. جرّب مرة أخرى، وإذا تكرر الخطأ فأبلغ الفريق التقني.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className="rounded-lg bg-brand px-6 py-3 font-bold text-brand-contrast hover:opacity-90">
          حاول مرة أخرى
        </button>
        <Link href="/orders" className="rounded-lg border border-border px-6 py-3 font-medium hover:border-brand">
          العودة إلى الطلبات
        </Link>
      </div>
    </section>
  );
}
