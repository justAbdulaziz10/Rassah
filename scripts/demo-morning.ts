// Demo-morning readiness check: health, data counts, (optional) event reset, sample packs, open alerts.
// Usage: npm run demo:morning [-- --reset]    BASE_URL defaults to https://rassah.vercel.app
// Does not clear product facts and does not call the admin extract endpoint.

import { MOCK_ORDER_TAG } from "../lib/demo/mock-data";
import type { DashboardData } from "../lib/monitoring/dashboard";
import { hasSupabaseEnv, scriptSupabase } from "./_supabase";
import { resetEvents } from "./reset-events";

const BASE_URL = (process.env.BASE_URL?.trim() || "https://rassah.vercel.app").replace(/\/+$/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = false;

async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    console.log(`✔ ${name} (${Date.now() - t0} ms)${detail ? `: ${detail}` : ""}`);
  } catch (e) {
    failed = true;
    console.log(`✖ ${name} (${Date.now() - t0} ms): ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function getJson(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function main() {
  console.log(`Demo morning against ${BASE_URL}`);

  await step("health", async () => {
    const { status, body } = await getJson("/api/health");
    const bad = [
      status !== 200 && `http ${status}`,
      body.status !== "ok" && `status=${String(body.status)}`,
      body.database !== "ok" && `database=${String(body.database)}`,
      body.geminiKeyPresent !== true && "geminiKeyPresent=false",
      body.demoMode !== true && "demoMode=false",
    ].filter(Boolean);
    if (bad.length) throw new Error(bad.join(", "));
    return `status ok, database ok, gemini key present, demoMode true, engine ${String(body.engineVersion)}`;
  });

  await step("supabase counts", async () => {
    if (!hasSupabaseEnv()) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    const db = scriptSupabase();
    const want: Array<[string, number, "eq" | "gte"]> = [["products", 30, "eq"], ["cartons", 5, "eq"], ["orders", 20, "eq"], ["product_facts", 27, "gte"]];
    const out: string[] = [];
    const bad: string[] = [];
    for (const [table, n, op] of want) {
      const q = db.from(table).select("*", { count: "exact", head: true });
      // Seeded orders only: store orders (demo = 'store') and mock orders (demo = 'mock') come and go.
      const { count, error } = await (table === "orders" ? q.or("demo.is.null,demo.not.in.(store,mock)") : q);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(`${table}=${count}`);
      if (count === null || (op === "eq" ? count !== n : count < n)) bad.push(`${table} expected ${op === "eq" ? "" : ">="}${n}, got ${count}`);
    }
    if (bad.length) throw new Error(bad.join("; "));
    return out.join(" ");
  });

  if (process.argv.includes("--reset")) {
    await step("reset events (eval runs kept)", async () => {
      await resetEvents(scriptSupabase());
    });
  }

  for (const [orderId, expectNoBox] of [["1001", false], ["1002", false], ["1003", false], ["1020", true]] as const) {
    await step(`pack ${orderId}`, async () => {
      const res = await fetch(`${BASE_URL}/api/orders/${orderId}/pack`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await res.json()) as { status?: string; carton?: { name?: string } | null; timings?: { totalMs?: number } };
      const line = `http ${res.status}, status ${body.status}, carton ${body.carton?.name ?? "none"}, totalMs ${body.timings?.totalMs}`;
      if (expectNoBox ? body.status !== "no_box" : !res.ok || body.status === "error" || body.status === "not_found") throw new Error(line);
      return line;
    });
    await sleep(1000); // pack route is rate-limited to 30/min/IP
  }

  await step("open alerts", async () => {
    const { status, body } = await getJson("/api/monitoring/metrics");
    if (status !== 200) throw new Error(`http ${status}`);
    // The dashboard returns the open alerts (resolvedAt is null), one per rule.
    const open = (body as unknown as DashboardData).alerts.filter((a) => !a.resolvedAt);
    const list = `${open.length} open: ${open.map((a) => a.rule).join(", ")}`;
    // The mock history (npm run demo:data) breaks some rules on purpose, so its alerts are expected.
    const mock = hasSupabaseEnv()
      ? (await scriptSupabase().from("orders").select("*", { count: "exact", head: true }).eq("demo", MOCK_ORDER_TAG)).count
      : 0;
    if (open.length && mock) return `${list} (expected: mock history loaded)`;
    if (open.length) throw new Error(list);
    return "0 open";
  });

  if (failed) {
    console.log("Demo morning: FAILED");
    process.exit(1);
  }
  console.log("Demo morning: all clear");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
