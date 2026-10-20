// Deletes monitoring events (extraction_events, order_runs, corrections, alerts) for a clean demo slate.
// Keeps the catalog (product_facts) and evaluation runs.
// Usage: npx tsx --env-file-if-exists=.env.local scripts/reset-events.ts --yes

import { confirmed, must, scriptSupabase } from "./_supabase";

async function main() {
  if (!confirmed()) {
    console.error("This deletes all monitoring events. Re-run with --yes to confirm.");
    process.exit(1);
  }
  const db = scriptSupabase();
  // corrections reference order_runs, so delete them first.
  for (const table of ["corrections", "extraction_events", "alerts", "order_runs"]) {
    must(table, await db.from(table).delete().not("id", "is", null));
    console.log(`cleared ${table}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
