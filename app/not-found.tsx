import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="mt-2 text-muted">تأكد من الرابط، أو ارجع للصفحة الرئيسية أو صفحة الطلبات.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/orders" className="rounded-md bg-brand px-4 py-2 text-brand-contrast">
          صفحة الطلبات
        </Link>
        <Link href="/" className="rounded-md border border-border px-4 py-2">
          الصفحة الرئيسية
        </Link>
      </div>
    </section>
  );
}
