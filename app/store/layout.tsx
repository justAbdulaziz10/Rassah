import type { Metadata } from "next";
import Link from "next/link";
import { BoxIcon } from "@/components/Icons";

export const metadata: Metadata = {
  title: { default: "متجر الواحة", template: "%s · متجر الواحة" },
  description: "عطور وبخور وتمور وهدايا. كل طلب يُغلَّف في الكرتون المناسب.",
};

// The store sits outside the console: its own header, no packer navigation.
export default function StoreLayout({ children }: LayoutProps<"/store">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/store" className="font-display text-2xl font-bold text-brand">
            متجر الواحة
          </Link>
          <Link
            href="/orders"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-brand hover:text-brand"
          >
            <BoxIcon className="size-4" />
            لوحة الطلبات
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-8">{children}</main>
    </>
  );
}
