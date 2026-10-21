import { NextResponse, type NextRequest } from "next/server";
import ordersFile from "@/data/orders.json";

// Cache Components serves /orders/[id] as a prerendered shell with status 200, and
// `dynamicParams` is unavailable with Cache Components, so a notFound() inside the page cannot
// change the status in production. Unknown order ids are rejected here, before the cache, with a
// real 404 (rendered by app/not-found.tsx). Known ids: the seeded orders in data/orders.json, plus
// the range the built-in store numbers its orders in (5001+); the page checks those against the database.
const KNOWN_ORDER_IDS = new Set<string>(ordersFile.orders.map((o) => o.id));
const STORE_FIRST_ORDER_ID = 5001; // = lib/db/types.ts (the proxy bundle stays free of server-only imports)

export function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/")[2] ?? "";
  if (KNOWN_ORDER_IDS.has(id)) return NextResponse.next();
  if (/^[1-9]\d{3,9}$/.test(id) && Number(id) >= STORE_FIRST_ORDER_ID) return NextResponse.next();
  return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
}

export const config = { matcher: "/orders/:id" };
