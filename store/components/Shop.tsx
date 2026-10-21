"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface Product {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  description: string;
  priceSar: number;
}

const MAX_UNITS = 12;
const MAX_PER_LINE = 3;

export default function Shop({ products }: { products: Product[] }) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const units = lines.reduce((s, [, q]) => s + q, 0);
  const total = lines.reduce((s, [id, q]) => s + (byId.get(id)?.priceSar ?? 0) * q, 0);

  function change(id: string, delta: number) {
    setError(null);
    setCart((c) => {
      const next = Math.max(0, Math.min(MAX_PER_LINE, (c[id] ?? 0) + delta));
      const otherUnits = Object.entries(c).reduce((s, [k, q]) => s + (k === id ? 0 : q), 0);
      if (otherUnits + next > MAX_UNITS) return c;
      return { ...c, [id]: next };
    });
  }

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerName: name || undefined, items: lines.map(([productId, qty]) => ({ productId, qty })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCart({});
      router.push(`/order/${data.orderId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="layout">
      <section className="grid" aria-label="المنتجات">
        {products.map((p) => (
          <article key={p.id} className="card">
            <span className="cat">{p.categoryLabel}</span>
            <h3>{p.name}</h3>
            <p className="desc">{p.description}</p>
            <span className="price">
              <span className="num">{p.priceSar}</span> ر.س
            </span>
            {cart[p.id] ? (
              <span className="qty">
                <button aria-label="إنقاص" onClick={() => change(p.id, -1)}>−</button>
                <span className="num">{cart[p.id]}</span>
                <button aria-label="زيادة" onClick={() => change(p.id, 1)}>+</button>
              </span>
            ) : (
              <button className="btn ghost" onClick={() => change(p.id, 1)} disabled={units >= MAX_UNITS}>
                أضف للسلة
              </button>
            )}
          </article>
        ))}
      </section>

      <aside className="cart" aria-label="السلة">
        <h2>السلة</h2>
        {lines.length === 0 ? (
          <p className="muted">السلة فاضية. أضف منتجات من القائمة.</p>
        ) : (
          <>
            {lines.map(([id, q]) => (
              <div key={id} className="cart-row">
                <span>{byId.get(id)?.name}</span>
                <span className="qty">
                  <button aria-label="إنقاص" onClick={() => change(id, -1)}>−</button>
                  <span className="num">{q}</span>
                  <button aria-label="زيادة" onClick={() => change(id, 1)}>+</button>
                </span>
              </div>
            ))}
            <p>
              الإجمالي: <strong className="num">{total}</strong> ر.س · <span className="num">{units}</span> قطعة
            </p>
            <label className="muted" htmlFor="cust">
              اسم العميل (اختياري)
            </label>
            <input id="cust" className="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <p className="muted">الحد {MAX_UNITS} قطعة للطلب، و{MAX_PER_LINE} لكل منتج.</p>
            {error && <p className="err">{error}</p>}
            <button className="btn" style={{ width: "100%" }} onClick={checkout} disabled={busy}>
              {busy ? "جاري إنشاء الطلب…" : "إتمام الطلب"}
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
