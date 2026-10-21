import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="mt-3 text-muted">الرابط غير صحيح أو أن الصفحة نُقلت. يمكنك الرجوع إلى الطلبات أو إلى الصفحة الرئيسية.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/orders" className="rounded-md bg-brand px-5 py-2.5 font-medium text-brand-contrast">
          الطلبات
        </Link>
        <Link href="/" className="rounded-md border border-border px-5 py-2.5 hover:border-brand">
          الصفحة الرئيسية
        </Link>
      </div>
    </section>
  );
}
