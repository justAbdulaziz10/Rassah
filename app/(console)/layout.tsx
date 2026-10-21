import ConsoleNav from "@/components/ConsoleNav";
import SiteFooter from "@/components/SiteFooter";

// The working screens (orders, notifications, products, performance, accuracy) share this header and the footer.
// The landing page at "/" sits outside this group and draws its own header.
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md print:hidden">
        <ConsoleNav />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-8">{children}</main>
      <SiteFooter />
    </>
  );
}
