import Link from "next/link";

const NAV = [
  { href: "/orders", label: "الطلبات" },
  { href: "/catalog", label: "الكتالوج" },
  { href: "/monitoring", label: "المراقبة" },
  { href: "/evaluation", label: "التقييم" },
];

// The working screens (orders, catalog, monitoring, evaluation) share this header.
// The landing page at "/" sits outside this group and draws its own header.
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-display text-xl font-bold text-brand">
            رصّة
          </Link>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-muted hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
