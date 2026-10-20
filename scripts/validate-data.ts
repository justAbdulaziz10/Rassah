// Validates every data file against its schema and checks cross-references.
// Part of `npm run check`. Exits non-zero on any problem.

import {
  loadCartons,
  loadGroundTruth,
  loadOrders,
  loadPackingFixtures,
  loadProducts,
} from "../lib/data/load";

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

try {
  const products = loadProducts();
  const truth = loadGroundTruth();
  const { cartons } = loadCartons();
  const orders = loadOrders();
  const fixtures = loadPackingFixtures();

  const productIds = new Set(products.map((p) => p.id));
  if (productIds.size !== products.length) fail("duplicate product ids");
  const truthIds = new Set(truth.map((t) => t.productId));
  for (const id of productIds) if (!truthIds.has(id)) fail(`product ${id} has no ground truth`);
  for (const id of truthIds) if (!productIds.has(id)) fail(`ground truth for unknown product ${id}`);

  const groups = { A: 0, B: 0, C: 0 };
  for (const p of products) groups[p.group]++;
  if (groups.A !== 15 || groups.B !== 12 || groups.C !== 3) fail(`group sizes must be 15/12/3, got ${JSON.stringify(groups)}`);

  for (const t of truth) {
    const p = products.find((x) => x.id === t.productId);
    if (!p) continue;
    const expected = p.group === "A" ? "page" : p.group === "B" ? "inferred" : "unknown";
    if (t.expectedDimsSource !== expected) fail(`${t.productId}: expectedDimsSource should be ${expected}`);
    const hasDims = t.lengthCm !== null && t.widthCm !== null && t.heightCm !== null && t.weightG !== null;
    if (expected === "unknown" ? hasDims : !hasDims) fail(`${t.productId}: dims presence does not match group ${p.group}`);
  }
  const holdout = truth.filter((t) => t.holdout).length;
  if (holdout !== 10) fail(`holdout set must have 10 products, has ${holdout}`);
  const count = (k: "fragile" | "liquid" | "sensitive") => truth.filter((t) => t[k]).length;
  if (count("fragile") < 8) fail("need at least 8 fragile products");
  if (count("liquid") < 6) fail("need at least 6 liquid products");
  if (count("sensitive") < 4) fail("need at least 4 sensitive products");

  const cartonIds = new Set(cartons.map((c) => c.id));
  const orderIds = new Set<string>();
  for (const o of orders) {
    if (orderIds.has(o.id)) fail(`duplicate order ${o.id}`);
    orderIds.add(o.id);
    const units = o.items.reduce((s, i) => s + i.qty, 0);
    if (units > 12) fail(`order ${o.id} has ${units} units (max 12)`);
    for (const i of o.items) if (!productIds.has(i.productId)) fail(`order ${o.id} references unknown ${i.productId}`);
  }
  if (orders.length !== 20) fail(`expected 20 orders, got ${orders.length}`);
  if (orders.filter((o) => o.demo).length !== 3) fail("expected exactly 3 demo orders");

  const fx = fixtures.fixtures;
  const byGroup = (g: string) => fx.filter((f) => f.group === g).length;
  if (byGroup("known_feasible") !== 20 || byGroup("impossible") !== 20 || byGroup("random") !== 20) {
    fail("packing fixtures must be 20/20/20");
  }
  for (const f of fx) {
    for (const c of f.cartonIds) if (!cartonIds.has(c)) fail(`fixture ${f.id} references unknown carton ${c}`);
    if (f.group === "known_feasible" && !f.witness) fail(`fixture ${f.id} has no witness`);
    if (f.group === "impossible" && !f.impossibleReason) fail(`fixture ${f.id} has no impossible reason`);
  }

  console.log(
    `products ${products.length} (A ${groups.A} / B ${groups.B} / C ${groups.C}), ground truth ${truth.length} (holdout ${holdout}), ` +
      `cartons ${cartons.length}, orders ${orders.length}, packing fixtures ${fx.length}`,
  );
} catch (e) {
  fail((e as Error).message);
}

if (errors.length) {
  console.error("Data validation FAILED:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("Data validation passed.");
