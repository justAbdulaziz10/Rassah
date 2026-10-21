# Demo store (متجر الواحة, تجريبي)

A **separate** demo e-commerce store that stands in for Salla during the demo. A customer fills a cart and places an order. The store gives it a new number (5001, 5002…). The packer types that number in Rassah, and **Rassah reads the order from the store's Orders API**, the same way it will read from Salla after a real integration.

```
Store (this app, own data)                       Rassah
 cart → checkout → order #5001  ── GET /api/orders/5001 (Bearer key) ──▶  packs it
```

## Separation from Rassah (by design)

- **Own app:** own `package.json`, own build, own Vercel project, own URL. Rassah's lint, typecheck and build ignore `store/`.
- **Own data:** orders live in the store's storage (a local file in dev, or a **separate** Supabase project in production). Never Rassah's database.
- **Rassah only reads.** It does not copy the store's order into its own tables. It reads the order when the packer types the number, and records the usual monitoring event for that pack.
- **Catalog:** the store sells the same 30 products that are already synced into Rassah's catalog (`data/products.json` is the store's own copy with prices). If an order contains a product Rassah doesn't know, Rassah says so instead of guessing.
- **Off by default in Rassah.** Rassah only calls the store when both `STORE_API_URL` and `STORE_API_KEY` are set.

## Run locally

```bash
cd store
npm install
cp .env.example .env.local      # set STORE_API_KEY (any long random string)
npm run dev                     # http://localhost:3001
```

Orders are saved to `store/.data/orders.json` (git-ignored). Then point a local Rassah at it: in Rassah's `.env.local`, set `STORE_API_URL=http://localhost:3001` and `STORE_API_KEY=<same key>`.

## Deploy (Vercel)

1. Create a **new, separate Supabase project** for the store. In its SQL editor run `store/supabase/0001_store.sql` (order numbers start at 5001).
2. Vercel → *Add New Project* → the same GitHub repo → **Root Directory: `store`**.
3. Environment variables for the store project: `STORE_API_KEY`, `STORE_SUPABASE_URL`, `STORE_SUPABASE_SERVICE_ROLE_KEY` (from the store's project), `RASSAH_URL=https://rassah.vercel.app`.
4. In **Rassah's** Vercel project add `STORE_API_URL=https://<store>.vercel.app` and the same `STORE_API_KEY`, then redeploy Rassah.

## Pages and API

| Path | What |
|---|---|
| `/` | Products + cart + "إتمام الطلب" |
| `/order/[id]` | Confirmation with the new order number (+ "جهّزه في رصّة" link) |
| `/admin` | Merchant's order list |
| `POST /api/checkout` | Creates an order. Validates products, ≤ 3 per product, ≤ 12 units (Rassah's cap), simple rate limit. |
| `GET /api/orders/[id]` | Orders API for Rassah. Requires `Authorization: Bearer <STORE_API_KEY>`. 401 without it, 404 if unknown. |

Synthetic store: no payment, no shipping, illustrative prices. The banner says so on every page. No third-party branding.
