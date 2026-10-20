// Removes cached product facts so the next order re-extracts them (cache-miss demo).
// Usage:
//   npx tsx --env-file-if-exists=.env.local scripts/clear-facts.ts --product p-16
//   npx tsx --env-file-if-exists=.env.local scripts/clear-facts.ts --all --yes

import { confirmed, must, scriptSupabase } from "./_supabase";

async function main() {
  const db = scriptSupabase();
  const i = process.argv.indexOf("--product");
  if (i !== -1 && process.argv[i + 1]) {
    const id = process.argv[i + 1];
    must("delete", await db.from("product_facts").delete().eq("product_id", id));
    console.log(`cleared facts for ${id}`);
    return;
  }
  if (process.argv.includes("--all")) {
    if (!confirmed()) {
      console.error("This clears the whole catalog cache. Re-run with --all --yes.");
      process.exit(1);
    }
    must("delete all", await db.from("product_facts").delete().neq("product_id", ""));
    console.log("cleared all cached facts");
    return;
  }
  console.error("Usage: clear-facts.ts --product <id> | --all --yes");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
