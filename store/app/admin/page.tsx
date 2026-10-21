import { PRODUCT_BY_ID } from "@/lib/catalog";
import { listOrders, StorageNotConfigured } from "@/lib/orders";

export const dynamic = "force-dynamic";

export default async function MerchantOrders() {
  let orders;
  try {
    orders = await listOrders();
  } catch (e) {
    return <p className="panel err">{e instanceof StorageNotConfigured ? e.message : "تعذر تحميل الطلبات"}</p>;
  }
  const rassah = process.env.RASSAH_URL?.trim().replace(/\/+$/, "");

  return (
    <div className="panel">
      <h1 style={{ marginTop: 0 }}>لوحة التاجر: الطلبات</h1>
      <p className="muted">هذي هي البيانات اللي يقرأها رصّة من Orders API حق المتجر، مثل ما يقرأ من سلة بعد الربط.</p>
      {orders.length === 0 ? (
        <p className="muted">ما فيه طلبات للحين.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>الوقت</th>
              <th>العميل</th>
              <th>المنتجات</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="num">
                  <strong>#{o.id}</strong>
                </td>
                <td className="num">{new Date(o.createdAt).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>{o.customerName ?? "—"}</td>
                <td>
                  {o.items.map((i) => (
                    <div key={i.productId}>
                      {PRODUCT_BY_ID.get(i.productId)?.name ?? i.productId} <span className="num">× {i.qty}</span>
                    </div>
                  ))}
                </td>
                <td>
                  {rassah && (
                    <a href={`${rassah}/orders/${o.id}`} target="_blank" rel="noreferrer">
                      رصّة ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
