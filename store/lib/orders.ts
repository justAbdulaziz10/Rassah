import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// The store's own order storage. Two backends:
// - Supabase (STORE_SUPABASE_URL + STORE_SUPABASE_SERVICE_ROLE_KEY): a SEPARATE project from Rassah.
// - Local JSON file (store/.data/orders.json): development only, never on Vercel.

export interface StoreOrder {
  id: string;
  createdAt: string;
  customerName: string | null;
  items: Array<{ productId: string; qty: number }>;
}

export class StorageNotConfigured extends Error {}

function supabase() {
  const url = process.env.STORE_SUPABASE_URL?.trim();
  const key = process.env.STORE_SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

// ---- local file backend (dev) ----
const FILE = path.join(process.cwd(), ".data", "orders.json");
function readFile(): StoreOrder[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as StoreOrder[];
  } catch {
    return [];
  }
}
function writeFile(orders: StoreOrder[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(orders, null, 2));
}
function localAllowed() {
  if (process.env.VERCEL === "1") throw new StorageNotConfigured("Store storage is not configured (STORE_SUPABASE_*).");
}

export async function createOrder(items: StoreOrder["items"], customerName: string | null): Promise<StoreOrder> {
  const db = supabase();
  if (db) {
    const { data, error } = await db.from("store_orders").insert({ customer_name: customerName }).select("id, created_at").single();
    if (error || !data) throw new Error(error?.message ?? "insert failed");
    const id = String(data.id);
    const res = await db.from("store_order_items").insert(items.map((i) => ({ order_id: data.id, product_id: i.productId, qty: i.qty })));
    if (res.error) throw new Error(res.error.message);
    return { id, createdAt: data.created_at as string, customerName, items };
  }
  localAllowed();
  const orders = readFile();
  const next = orders.reduce((m, o) => Math.max(m, Number(o.id)), 5000) + 1;
  const order: StoreOrder = { id: String(next), createdAt: new Date().toISOString(), customerName, items };
  writeFile([...orders, order]);
  return order;
}

export async function getOrder(id: string): Promise<StoreOrder | null> {
  const db = supabase();
  if (db) {
    const { data, error } = await db
      .from("store_orders")
      .select("id, created_at, customer_name, store_order_items(product_id, qty)")
      .eq("id", Number(id))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: String(data.id),
      createdAt: data.created_at as string,
      customerName: (data.customer_name as string) ?? null,
      items: ((data.store_order_items as Array<{ product_id: string; qty: number }>) ?? []).map((i) => ({ productId: i.product_id, qty: i.qty })),
    };
  }
  localAllowed();
  return readFile().find((o) => o.id === id) ?? null;
}

export async function listOrders(limit = 50): Promise<StoreOrder[]> {
  const db = supabase();
  if (db) {
    const { data, error } = await db
      .from("store_orders")
      .select("id, created_at, customer_name, store_order_items(product_id, qty)")
      .order("id", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((o) => ({
      id: String(o.id),
      createdAt: o.created_at as string,
      customerName: (o.customer_name as string) ?? null,
      items: ((o.store_order_items as Array<{ product_id: string; qty: number }>) ?? []).map((i) => ({ productId: i.product_id, qty: i.qty })),
    }));
  }
  localAllowed();
  return readFile().reverse().slice(0, limit);
}
