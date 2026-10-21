"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BagIcon, MinusIcon, PlusIcon } from "@/components/Icons";
import { fmtPieces } from "@/lib/ui/format";

export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryLabel: string;
  priceSar: number;
}

function Stepper({ qty, onChange, canAdd, name, idPrefix }: { qty: number; onChange: (d: number) => void; canAdd: boolean; name: string; idPrefix?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
      <button type="button" id={idPrefix && `${idPrefix}-dec`} aria-label={`أنقص ${name}`} onClick={() => onChange(-1)} className="grid size-8 place-items-center rounded-md hover:bg-background">
        <MinusIcon />
      </button>
      <span className="ltr-nums w-6 text-center font-bold" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        id={idPrefix && `${idPrefix}-inc`}
        aria-label={`زِد ${name}`}
        onClick={() => onChange(1)}
        disabled={!canAdd}
        className="grid size-8 place-items-center rounded-md hover:bg-background disabled:opacity-40"
      >
        <PlusIcon />
      </button>
    </span>
  );
}

export default function Shop({ products, maxUnits, maxPerLine }: { products: ShopProduct[]; maxUnits: number; maxPerLine: number }) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [category, setCategory] = useState<string>("all");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cartInView, setCartInView] = useState(false);
  const cartRef = useRef<HTMLElement>(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // "أضف للسلة" and the stepper replace each other, so move focus to the control that took the clicked one's place.
  const focusNext = useRef<string[] | null>(null);
  useEffect(() => {
    const ids = focusNext.current;
    if (!ids) return;
    focusNext.current = null;
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLButtonElement | null;
      if (el && !el.disabled) return el.focus();
    }
  });

  // The phone shortcut bar to the cart hides once the cart itself is on screen, so it never covers checkout.
  useEffect(() => {
    const el = cartRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setCartInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const categories = useMemo(() => [...new Map(products.map((p) => [p.category, p.categoryLabel]))], [products]);

  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const units = lines.reduce((s, [, q]) => s + q, 0);
  const total = lines.reduce((s, [id, q]) => s + (byId.get(id)?.priceSar ?? 0) * q, 0);
  const shown = category === "all" ? products : products.filter((p) => p.category === category);
  const nameOk = name.trim().length >= 2;

  function change(id: string, delta: number) {
    setError(null);
    setCart((c) => {
      const next = Math.max(0, Math.min(maxPerLine, (c[id] ?? 0) + delta));
      const others = Object.entries(c).reduce((s, [k, q]) => s + (k === id ? 0 : q), 0);
      if (others + next > maxUnits) return c;
      return { ...c, [id]: next };
    });
  }
  const canAdd = (id: string) => units < maxUnits && (cart[id] ?? 0) < maxPerLine;

  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    if (!nameOk) {
      setError("اكتب اسم العميل لإتمام الطلب");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerName: name.trim(), items: lines.map(([productId, qty]) => ({ productId, qty })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { orderId?: string; error?: string };
      if (!res.ok || !data.orderId) throw new Error(res.status === 429 ? "طلبات كثيرة في وقت قصير، جرّب بعد دقيقة" : (data.error ?? "تعذّر إنشاء الطلب"));
      router.push(`/store/order/${data.orderId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="المنتجات" className="min-w-0 space-y-4">
        <nav aria-label="الأقسام" className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
          {[["all", "الكل"] as [string, string], ...categories].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              aria-pressed={category === key}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                category === key ? "border-brand bg-brand font-medium text-brand-contrast" : "border-border bg-surface text-muted hover:border-brand hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const qty = cart[p.id] ?? 0;
            return (
              <li key={p.id} className={`flex flex-col gap-2 rounded-xl border bg-surface p-4 ${qty ? "border-brand" : "border-border"}`}>
                <span className="w-fit rounded bg-background px-2 py-0.5 text-xs text-muted">{p.categoryLabel}</span>
                <h3 className="font-bold leading-6">{p.name}</h3>
                <p className="line-clamp-3 text-sm leading-6 text-muted">{p.description}</p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <span className="text-lg font-bold">
                    <span className="ltr-nums">{p.priceSar}</span> <span className="text-sm font-normal">ر.س</span>
                  </span>
                  {qty ? (
                    <Stepper
                      qty={qty}
                      name={p.name}
                      idPrefix={`card-${p.id}`}
                      onChange={(d) => {
                        if (d < 0 && qty === 1) focusNext.current = [`card-${p.id}-add`];
                        change(p.id, d);
                      }}
                      canAdd={canAdd(p.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      id={`card-${p.id}-add`}
                      onClick={() => {
                        focusNext.current = [`card-${p.id}-inc`, `card-${p.id}-dec`];
                        change(p.id, 1);
                      }}
                      disabled={!canAdd(p.id)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-brand px-3 text-sm font-bold text-brand hover:bg-brand hover:text-brand-contrast disabled:opacity-40"
                    >
                      <PlusIcon /> أضف للسلة
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <aside id="cart" ref={cartRef} aria-label="السلة" className="panel scroll-mt-20 space-y-4 p-4 lg:sticky lg:top-20">
        <h2 id="cart-heading" tabIndex={-1} className="flex items-center gap-2 text-lg font-bold outline-none">
          <BagIcon /> السلة
          {units > 0 && <span className="ltr-nums rounded-full bg-brand px-2 text-sm text-brand-contrast">{units}</span>}
        </h2>
        {lines.length === 0 ? (
          <p className="text-sm text-muted">السلة فارغة. أضف منتجات من القائمة.</p>
        ) : (
          <form onSubmit={checkout} className="space-y-4" noValidate>
            <ul className="divide-y divide-border">
              {lines.map(([id, q]) => {
                const p = byId.get(id);
                return (
                  <li key={id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block leading-6">{p?.name}</span>
                      <span className="ltr-nums text-muted">{(p?.priceSar ?? 0) * q}</span> <span className="text-muted">ر.س</span>
                    </span>
                    <Stepper
                      qty={q}
                      name={p?.name ?? id}
                      onChange={(d) => {
                        if (d < 0 && q === 1) focusNext.current = ["cart-heading"];
                        change(id, d);
                      }}
                      canAdd={canAdd(id)}
                    />
                  </li>
                );
              })}
            </ul>
            <p className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-muted">{fmtPieces(units)}</span>
              <span className="text-xl font-bold">
                <span className="ltr-nums">{total}</span> <span className="text-sm font-normal">ر.س</span>
              </span>
            </p>
            <div className="space-y-1.5">
              <label htmlFor="customer" className="text-sm font-medium">
                اسم العميل <span className="text-critical">*</span>
              </label>
              <input
                id="customer"
                required
                autoComplete="name"
                maxLength={60}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                aria-invalid={error && !nameOk ? true : undefined}
                aria-describedby="cart-error"
                className="h-11 w-full rounded-lg border border-border bg-surface px-3"
              />
            </div>
            <p className="text-xs text-muted">
              الحد <span className="ltr-nums">{maxUnits}</span> قطعة للطلب، و<span className="ltr-nums">{maxPerLine}</span> لكل منتج.
            </p>
            <p id="cart-error" role="alert" className="text-sm text-critical empty:hidden">
              {error}
            </p>
            <button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-lg bg-brand font-bold text-brand-contrast hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "جارٍ إنشاء الطلب…" : "إتمام الطلب"}
            </button>
          </form>
        )}
      </aside>

      {units > 0 && !cartInView && (
        <a
          href="#cart"
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between rounded-xl bg-brand px-5 py-3.5 font-bold text-brand-contrast shadow-lg lg:hidden"
        >
          <span className="flex items-center gap-2">
            <BagIcon /> السلة ({fmtPieces(units)})
          </span>
          <span>
            <span className="ltr-nums">{total}</span> ر.س
          </span>
        </a>
      )}
    </div>
  );
}
