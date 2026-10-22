# Demo store checkout

متجر الواحة at `/store` is a demo shop on the same database. A customer adds products, types a name and checks out; the order gets a number from 5001 up and appears in the packer's queue as new, where it packs like any other order.

## Sub-features

- `store.checkout`: a valid cart and name create an order (201, `orderId >= 5001`).
- `store.placed`: the shop moves to `/store/order/<orderId>`, which thanks the customer by name and links «جهّزه في رصّة» to `/orders/<orderId>`.
- `store.queue`: the new order is listed in `/api/orders/queue` under `newOrderIds`.
- `store.pack`: the new order packs (`box_found` for perfume + novel).
- `store.validate`: a missing customer name is a 400 with an Arabic message.

## How to get to it (user POV)

- `/store` → add products → type the customer's name → «إتمام الطلب».
- Then «جهّزه في رصّة», or find the order in `/orders`.

## Driving it with verify.sh

Preconditions:

- Local baseline; the products sold in the store are the ones priced in `data/store-prices.json`.

- **Checkout.** `POST $BASE/api/store/checkout` with `{"customerName":"تحقق رصّة","items":[{"productId":"p-16","qty":1},{"productId":"p-17","qty":1}]}` → 201, `orderId` ≥ 5001.
- **Confirmation page.** `GET $BASE/store/order/<orderId>` → 200, the body contains the customer name and `href="/orders/<orderId>"`.
- **In the queue.** `GET $BASE/api/orders/queue` → `newOrderIds` contains that number.
- **Packs.** `POST $BASE/api/orders/<orderId>/pack` with `{}` → `status: "box_found"`.
- **Name required.** Same checkout with `"customerName":""` → 400.
- **Proof.** `checkout.body`, `store_placed.body`, `queue.body`, `pack_store.body`.

## Gotchas

- `/store/order/<id>` for an order not placed in the store (for example 1001) renders the not-found content with status 200 (Cache Components shell; `proxy.ts` only covers `/orders/:id`). Assert on the content, not a 404.
- Checkout allows 10 requests a minute per IP.
- At most 3 of one product and 12 units per order; larger carts are a 400.
- Never check out on production during verification: the order is visible to every visitor. Remove store orders there only with the user's approval (`delete from orders where demo = 'store'`).
