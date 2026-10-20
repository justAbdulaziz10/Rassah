// Loads the synthetic mock store into Supabase. Idempotent (upserts).
// Never writes product_facts: those must come from real Gemini extraction or manual entry.
// Usage: npm run seed

import { computeSourceHash } from "../lib/data/hash";
import { loadCartons, loadOrders, loadProducts } from "../lib/data/load";
import { must, scriptSupabase } from "./_supabase";

async function main() {
  const db = scriptSupabase();
  const products = loadProducts();
  const { cartons, shipping } = loadCartons();
  const orders = loadOrders();

  must(
    "products",
    await db.from("products").upsert(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        url: p.url,
        category: p.category,
        source_hash: computeSourceHash(p.name, p.description),
      })),
      { onConflict: "id" },
    ),
  );

  must(
    "cartons",
    await db.from("cartons").upsert(
      cartons.map((c) => ({
        id: c.id,
        name: c.name,
        inner_l_cm: c.inner[0],
        inner_w_cm: c.inner[1],
        inner_h_cm: c.inner[2],
        max_weight_g: c.maxWeightG,
        tare_g: c.tareG,
        cost_sar: c.costSar,
      })),
      { onConflict: "id" },
    ),
  );

  must(
    "shipping_rates",
    await db.from("shipping_rates").upsert(
      { id: 1, base_sar: shipping.baseSar, per_kg_sar: shipping.perKgSar, volumetric_divisor: shipping.volumetricDivisor },
      { onConflict: "id" },
    ),
  );

  must(
    "orders",
    await db.from("orders").upsert(orders.map((o) => ({ id: o.id, demo: o.demo ?? null, expect: o.expect })), { onConflict: "id" }),
  );

  // Replace order lines so edits to orders.json are reflected exactly.
  must("order_items delete", await db.from("order_items").delete().in("order_id", orders.map((o) => o.id)));
  must(
    "order_items",
    await db.from("order_items").insert(orders.flatMap((o) => o.items.map((i) => ({ order_id: o.id, product_id: i.productId, qty: i.qty })))),
  );

  const count = async (table: string) => {
    const res = await db.from(table).select("*", { count: "exact", head: true });
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  };
  console.log(
    `Seeded: products ${await count("products")}, cartons ${await count("cartons")}, orders ${await count("orders")}, order_items ${await count("order_items")}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
