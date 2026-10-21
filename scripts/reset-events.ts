// Deletes monitoring events (extraction_events, order_runs, corrections, alerts) for a clean demo slate.
// Keeps the catalog (product_facts) and evaluation runs.
// Usage: npx tsx --env-file-if-exists=.env.local scripts/reset-events.ts --yes

import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmed, must, scriptSupabase } from "./_supabase";

/** Clears monitoring events. Reused by scripts/demo-morning.ts (--reset). */
export async function resetEvents(db: SupabaseClient, log: (msg: string) => void = console.log) {
  // corrections reference order_runs, so delete them first.
  for (const table of ["corrections", "extraction_events", "alerts", "order_runs"]) {
    must(table, await db.from(table).delete().not("id", "is", null));
    log(`cleared ${table}`);
  }
}

async function main() {
  if (!confirmed()) {
    console.error("This deletes all monitoring events. Re-run with --yes to confirm.");
    process.exit(1);
  }
  await resetEvents(scriptSupabase());
}

// Run only when executed directly, not when imported by demo-morning.
if (process.argv[1]?.endsWith("reset-events.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
