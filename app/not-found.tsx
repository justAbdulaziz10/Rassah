import Link from "next/link";

export default function NotFound() {
  return (
    <section className="py-16 text-center">
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="mt-2 text-muted">تأكد من الرابط أو ارجع لصفحة الطلبات.</p>
      <Link href="/orders" className="mt-6 inline-block rounded-md bg-brand px-4 py-2 text-brand-contrast">
        صفحة الطلبات
      </Link>
    </section>
  );
}
