# Packing an order

The packer types an order number and Rassah returns the cheapest valid carton, numbered Arabic steps, a 3D layout and the cost, or says why it cannot: products to measure, or no single carton (with a split into several cartons).

## Sub-features

- `pack.single`: order 1001, one book, goes into the `FLAT` carton.
- `pack.estimate`: order 1002, the perfume `p-16` has no size on its page; its size is an estimate (`dimsSource: "inferred"`) and the order still packs.
- `pack.measure`: order 1017, products `p-29` and `p-30` have no usable size; status `needs_measurement`, nothing is guessed.
- `pack.split`: order 1020, about 20.5 kg; status `no_box` and `split.boxes` holds two or more validated cartons.
- `pack.trace`: every pack writes a run whose trace (`/api/runs/<runId>/trace`) names the order and carton.
- `pack.unknown`: an unknown order number below the store range (e.g. 1021) is a 404 page.

## How to get to it (user POV)

- `/orders` (الطلبات): type the number in «رقم الطلب» and press «افتح», or press «افتح» on a queue row.
- Directly at `/orders/<id>`: the page packs the order as it opens.
- From the store's confirmation: «جهّزه في رصّة».

## Driving it with verify.sh

Preconditions:

- Local baseline from [README.md](README.md); no earlier correction to `p-16` in this server's life.

- **Single item.** `curl -s -X POST -H 'content-type: application/json' -d '{}' $BASE/api/orders/1001/pack` → 200, `status: "box_found"`, `carton.id: "FLAT"`.
- **Estimated size.** Same for `1002` → `box_found`, and `lines[]` for `p-16` has `dimsSource: "inferred"`.
- **Measure first.** Same for `1017` → `status: "needs_measurement"`, `productsToMeasure[].productId` is exactly `p-29`, `p-30`.
- **Split.** Same for `1020` → `status: "no_box"`, `split.boxes.length >= 2`.
- **Trace.** `GET $BASE/api/runs/<runId from 1001>/trace` → 200, `run.orderId: "1001"`, `run.cartonId: "FLAT"`.
- **Unknown order.** `GET $BASE/orders/1021` → 404.
- **Proof.** `verify.sh local` saves `pack_1001.body`, `pack_1002.body`, `pack_1017.body`, `pack_1020.body` and `trace_1001.body`.

## Gotchas

- `/orders/1021` must be 404. A 200 means `proxy.ts` is missing from the build (Cache Components would otherwise render a 200 shell).
- Numbers from 5001 up (store orders, and the 9001+ mock history) pass `proxy.ts` by design and are checked by the page, so an unknown one such as 9999 renders the not-found view with status 200. Do not use them as the 404 probe.
- With a Gemini key set and `MEMORY_SEED_FACTS` not `true`, local packs of unseen products call Gemini. Keep `GEMINI_API_KEY` blank.
- The pack API allows 30 requests a minute per IP; repeated manual runs against one server can hit 429.
