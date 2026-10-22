# Monitoring, notifications, catalog and health

The operations side: `/monitoring` (الأداء) shows the seven metrics, charts, alerts and per-run traces; `/notifications` (الإشعارات) lists what needs attention; `/catalog` (المنتجات) shows what Rassah knows about each product; `/evaluation` (الدقة) shows offline results; `/api/health` reports the backend, database and versions.

## Sub-features

- `mon.health`: `/api/health` answers 200 with `app: "ok"`, `database: "ok"`; `status: "ok"` on production, `"degraded"` in memory mode by design.
- `mon.metrics`: `/api/monitoring/metrics` answers 200.
- `mon.pages`: `/monitoring`, `/notifications`, `/catalog`, `/evaluation` render (200).
- `catalog.demo`: with `DEMO_MODE=true`, each `/catalog` row also has «إعادة القراءة» (`POST /api/products/<id>/extract`, forced re-read that never overwrites manual facts) and «حذف البيانات المحفوظة» (`DELETE /api/products/<id>/facts`, the next order re-reads the product). Both answer 404 without demo mode. Manual edits there are covered in [corrections.md](corrections.md).
- `mon.queue`: `/api/orders/queue` returns the queue counts.

## How to get to it (user POV)

- The console header links: الطلبات، الإشعارات (with the bell count)، المنتجات، الأداء، الدقة.
- The landing page footer links to the same pages.

## Driving it with verify.sh

Preconditions:

- Local baseline, or production for the GET-only checks.

- **Health.** `GET $BASE/api/health` → 200; local: `backend: "memory"`, `database: "ok"`; prod: `status: "ok"`.
- **Metrics.** `GET $BASE/api/monitoring/metrics` → 200 (local).
- **Pages.** `GET` each of `/monitoring`, `/notifications`, `/catalog`, `/evaluation` → 200.
- **Queue.** `GET $BASE/api/orders/queue` → 200 with numeric `counts.total`.
- **Catalog demo controls (local).** `POST $BASE/api/products/p-01/extract` → 200 with one event, `trigger: "admin"`; with the blank key its `status` is `config_error` (nothing paid is called). `DELETE $BASE/api/products/p-02/facts` → 200, `cleared: "p-02"`; packing 1001 again → `needs_measurement` for `p-02` (its facts are gone and there is no key to re-read it).
- **Proof.** `extract_p_01.body`, `clear_p_02.body`, `repack_1001_cleared.body`, `health.body`, `metrics.body`, `queue.body` and the page bodies.

## Gotchas

- A 200 page proves it renders, not that the numbers are right; metric math is covered by the unit tests in `tests/monitoring/`.
- Memory mode starts with no events, so the dashboard shows "too few cases" until something is packed. `MEMORY_MOCK_DATA=true` loads the mock history instead.
- The extract and clear controls share a limiter (each clear leads to a Gemini call on the next order when a key is set). Never use them on production: they change the shared catalog and can spend money.
- Production numbers include real visitors' runs; do not assert exact counts there.
