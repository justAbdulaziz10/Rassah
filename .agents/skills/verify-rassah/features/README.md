# Rassah verification map

The maintained recipes for proving Rassah's user-facing behavior. Read this index, then the feature file that matches the change. `scripts/verify.sh` runs every drive below in one go; the files say what each check proves and how to repeat it by hand.

| Feature | File | Covered by `verify.sh` |
|---|---|---|
| Packing an order | [packing.md](packing.md) | local (packs), prod (GET pages only) |
| Confirming and correcting a result | [corrections.md](corrections.md) | local only |
| Demo store checkout | [store-checkout.md](store-checkout.md) | local only |
| Monitoring, notifications, catalog, health | [monitoring.md](monitoring.md) | local and prod |
| Site footer (MVP note and repo link) | [site-footer.md](site-footer.md) | local and prod |

## Baseline preconditions

- **Local runs** use the memory backend: `DATA_BACKEND=memory DEMO_MODE=true GEMINI_API_KEY=`, a fresh `next start` on a free port, started by `verify.sh local`. The in-memory store is seeded from `data/*.json` (30 products, 20 orders 1001–1020, 5 cartons) and product facts from `data/ground_truth.json` with origin `seeded`. Every restart is a clean slate.
- **Production runs** (`verify.sh prod`, `BASE_URL` overrides `https://rassah.vercel.app`) are read-only.
- Never drive a server this run did not start. Never write `.env.local`.

## Driving conventions

- The surface is HTTP: pages (`GET`, HTML) and the JSON API under `/api`. Assert on JSON fields and on fixed strings in HTML, never on layout.
- Order numbers and product IDs are stable handles: orders `1001`–`1020` come from `data/orders.json` (each has an `expect` note); store orders are numbered from `5001`.
- Do not POST to production. A pack writes events and can call Gemini (paid); a checkout writes an order everyone sees. Opening `/orders/<id>` **in a browser** also packs (the page POSTs on load); a plain `curl` GET of the HTML does not.

## Proof and skip reporting

- Evidence lands in `artifacts/verify/rassah/<timestamp>-<mode>/` (git-ignored): every response body, plus `build.log` and `server.log` in local mode. It survives cleanup.
- A check passes only on its asserted value (status code and a JSON or HTML expectation), never because a request merely answered.
- A mutation (correction, checkout) is proven by a second read: the re-pack or the queue.
- Report a feature you could not drive with the command you tried and the precondition that failed. Do not count a prod GET as proof of a POST-only behavior.

## Feature entry contract

Each feature file has an H1, one paragraph, then exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify.sh`, `Gotchas`.
