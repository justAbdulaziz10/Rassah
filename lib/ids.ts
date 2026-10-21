// Id formats shared by the API routes, pages and the proxy. Client-safe: no server-only imports.

/** Built-in store orders are numbered from here, so they never collide with the seeded orders (1001–1020). */
export const STORE_FIRST_ORDER_ID = 5001;

/** Order numbers are digits only (seeded, store and external orders alike). */
export function isOrderId(id: string): boolean {
  return /^\d{1,10}$/.test(id);
}

/** Catalog product ids look like p-01 … p-9999. */
export function isProductId(id: string): boolean {
  return /^p-\d{2,4}$/.test(id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run ids are Postgres uuids; anything else would make the database throw instead of returning "not found". */
export function isUuid(id: string): boolean {
  return UUID.test(id);
}
