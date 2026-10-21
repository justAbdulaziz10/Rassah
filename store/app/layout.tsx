import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "متجر الواحة (تجريبي)",
  description: "متجر تجريبي لعرض مشروع رصّة. ليس متجراً حقيقياً ولا يبيع شيئاً.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="banner">متجر تجريبي لعرض مشروع رصّة: المنتجات والأسعار وهمية، ولا يتم أي دفع أو شحن.</div>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              متجر الواحة
            </Link>
            <nav>
              <Link href="/">المنتجات</Link>
              <Link href="/admin">لوحة التاجر: الطلبات</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
