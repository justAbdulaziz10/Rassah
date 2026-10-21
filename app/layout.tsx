import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Reem_Kufi } from "next/font/google";
import "./globals.css";

const arabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
});

// Kufi display face for headlines: geometric, block-built letterforms suit a product about stacking boxes.
const display = Reem_Kufi({
  variable: "--font-kufi",
  subsets: ["arabic", "latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: { default: "رصّة", template: "%s · رصّة" },
  description: "مساعد تغليف ذكي: يقرأ صفحات المنتجات ويقترح الكرتون الآمن الأوفر.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${arabic.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
