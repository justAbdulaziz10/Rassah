import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCT_BY_ID } from "@/lib/catalog";
import { getOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export default async function OrderPlaced({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const rassah = process.env.RASSAH_URL?.trim().replace(/\/+$/, "");

  return (
    <div className="panel" style={{ textAlign: "center" }}>
      <p className="muted">تم استلام طلبك ✓</p>
      <p>رقم الطلب</p>
      <p className="big">{order.id}</p>
      <table style={{ maxWidth: 520, margin: "16px auto" }}>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.productId}>
              <td>{PRODUCT_BY_ID.get(i.productId)?.name ?? i.productId}</td>
              <td className="num">× {i.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">الطلب يظهر الحين في لوحة التاجر. موظف التغليف يكتب رقمه في رصّة، ورصّة تجيبه من المتجر تلقائياً.</p>
      <p style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link className="btn ghost" href="/">
          طلب جديد
        </Link>
        <Link className="btn ghost" href="/admin">
          لوحة التاجر
        </Link>
        {rassah && (
          <a className="btn" href={`${rassah}/orders/${order.id}`} target="_blank" rel="noreferrer">
            جهّزه في رصّة ↗
          </a>
        )}
      </p>
    </div>
  );
}
