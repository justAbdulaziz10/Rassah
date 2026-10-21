import Link from "next/link";
import { SearchIcon } from "@/components/Icons";

export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-brand/10 text-3xl text-brand">
        <SearchIcon />
      </span>
      <h1 className="mt-5 font-display text-3xl font-bold">الصفحة غير موجودة</h1>
      <p className="mt-3 leading-7 text-muted">الرابط غير صحيح أو أن الصفحة نُقلت. يمكنك الرجوع إلى الطلبات أو إلى الصفحة الرئيسية.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/orders" className="rounded-lg bg-brand px-6 py-3 font-bold text-brand-contrast hover:opacity-90">
          الطلبات
        </Link>
        <Link href="/" className="rounded-lg border border-border px-6 py-3 font-medium hover:border-brand">
          الصفحة الرئيسية
        </Link>
      </div>
    </section>
  );
}
