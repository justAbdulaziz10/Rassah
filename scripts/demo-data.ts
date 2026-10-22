// Writes (or removes) the mock history from lib/demo/mock-data.ts, so every page shows every state
// for demos: orders 9001+ tagged demo = 'mock', their runs, product reads and corrections.
// Re-running --apply replaces the previous mock rows with a fresh story that ends now.
// Usage: npm run demo:data -- --apply     |     npm run demo:data -- --remove
// Afterwards it re-checks the alert rules once without a webhook, so the alerts the mock data causes
// are already open (or resolved after --remove) and the dashboard never sends a notification for them.

import { buildMockData, MOCK_ID_RANGE, MOCK_ORDER_TAG } from "../lib/demo/mock-data";
import { PROMPT_VERSION } from "../lib/ai/prompt";
import { fromExtraction, fromRun, getRepo } from "../lib/db/supabase";
import { ENGINE_VERSION } from "../lib/engine/config";
import { refreshAlerts } from "../lib/pipeline/pack";
import { must, scriptSupabase } from "./_supabase";

const db = scriptSupabase();

async function remove() {
  // Runs and reads first: corrections reference runs, so they go before order_runs.
  for (const table of ["corrections", "extraction_events", "order_runs"]) {
    must(table, await db.from(table).delete().gte("id", MOCK_ID_RANGE.min).lte("id", MOCK_ID_RANGE.max));
  }
  must("orders", await db.from("orders").delete().eq("demo", MOCK_ORDER_TAG)); // order_items cascade
}

async function apply() {
  const now = Date.now();
  // The same versions and model the deployed app stamps (lib/env.ts falls back to the same defaults).
  const data = buildMockData(now, {
    promptVersion: process.env.PROMPT_VERSION?.trim() || PROMPT_VERSION,
    engineVersion: process.env.ENGINE_VERSION?.trim() || ENGINE_VERSION,
    model: process.env.GEMINI_MODEL?.trim() || undefined,
  });
  must("orders", await db.from("orders").insert(data.orders.map((o) => ({ id: o.id, demo: MOCK_ORDER_TAG, expect: o.expect, created_at: o.createdAt }))));
  must("order_items", await db.from("order_items").insert(data.orders.flatMap((o) => o.lines.map((l) => ({ order_id: o.id, product_id: l.productId, qty: l.qty })))));
  must("order_runs", await db.from("order_runs").insert(data.runs.map((r) => ({ ...fromRun(r), created_at: r.createdAt }))));
  must("extraction_events", await db.from("extraction_events").insert(data.extractions.map((e) => ({ ...fromExtraction(e), id: e.id, created_at: e.createdAt }))));
  must(
    "corrections",
    await db.from("corrections").insert(
      data.corrections.map((c) => ({
        id: c.id,
        created_at: c.createdAt,
        run_id: c.runId,
        product_id: c.productId,
        field: c.field,
        old_value: c.oldValue,
        new_value: c.newValue,
        prior_origin: c.priorOrigin,
      })),
    ),
  );
  return data;
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--remove") ? "remove" : null;
  if (!mode) {
    console.error("Pass --apply to write the mock history or --remove to delete it.");
    process.exit(1);
  }
  await remove();
  if (mode === "apply") {
    const data = await apply();
    console.log(`wrote ${data.orders.length} orders, ${data.runs.length} runs, ${data.extractions.length} product reads, ${data.corrections.length} corrections`);
  } else {
    console.log("removed the mock history");
  }
  const open = await refreshAlerts(getRepo(), Date.now());
  console.log(`open alerts: ${open.length ? open.map((a) => `${a.rule} (${a.severity})`).join(", ") : "none"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
