// Head-to-head packing benchmark: Rassah vs Paccurate vs 3DBinPacking (plus a naive packer as the floor).
// Same orders, same cartons, same prices and the same item sizes for every engine. Every layout is checked
// by our independent validator and priced by our cost model (carton + dimensional-weight shipping).
// Protocol and fairness rules: docs/benchmark.md.
//
// Vendors run only when their credentials are set. Their responses are cached in eval/bench-cache/
// (gitignored, keyed by request), so re-running the report never spends quota twice.
//
// Usage: npm run bench                                   (Rassah + naive only, no network)
//        PACCURATE_API_KEY=… npm run bench               (adds Paccurate)
//        BINPACKING_USERNAME=… BINPACKING_API_KEY=… npm run bench   (adds 3DBinPacking)
//        npm run bench -- --random 300 --write           (bigger random set; write eval/results/bench-<date>.{json,md})
//        npm run bench -- --cache-only                   (vendors from cache only, no network)

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { binPackingRequest, paccurateRequest, parseBinPacking, parsePaccurate, type EngineAnswer } from "../lib/bench/competitors";
import { loadCartons, loadGroundTruth, loadOrders, loadPackingFixtures, loadProducts } from "../lib/data/load";
import { baselinePack } from "../lib/engine/baseline";
import { ENGINE_CONFIG, ENGINE_VERSION } from "../lib/engine/config";
import { estimateCost } from "../lib/engine/cost";
import { volume } from "../lib/engine/geometry";
import { packUnits, prng } from "../lib/engine/packer";
import { prepareUnits } from "../lib/engine/prepare";
import { splitPack } from "../lib/engine/split";
import type { Carton, OrderLine, ProductFacts, Unit, ViolationCode } from "../lib/engine/types";
import { validateLayout } from "../lib/engine/validator";
import { percentile, round2 } from "../lib/math";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  // A following flag ("--random --write") is not a value: keep the default.
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? Number(args[i + 1]) : def;
};
const RANDOM_N = opt("random", 200);
const SEED = opt("seed", 20261022);
const WRITE = flag("write");
const CACHE_ONLY = flag("cache-only");
const VOPTS = { minSupport: ENGINE_CONFIG.minSupport, eps: ENGINE_CONFIG.eps };
const { cartons: CARTONS, shipping: RATES } = loadCartons();
const CACHE_DIR = path.join(process.cwd(), "eval", "bench-cache");

// ---------------------------------------------------------------------------------------------- datasets

interface Case {
  id: string;
  set: "fixtures" | "orders" | "random";
  units: Unit[];
  cartons: Carton[];
  /** Fixture cases built so that no single carton can hold them. */
  impossible: boolean;
}

/** True sizes for every product (as if measured), so every engine packs the same real items. */
function trueFacts(): Map<string, ProductFacts> {
  return new Map(
    loadGroundTruth().map((g) => [
      g.productId,
      {
        productId: g.productId,
        lengthCm: g.lengthCm,
        widthCm: g.widthCm,
        heightCm: g.heightCm,
        weightG: g.weightG,
        dimsSource: "page",
        weightSource: "page",
        fragile: g.fragile,
        liquid: g.liquid,
        sensitive: g.sensitive,
        confidence: "high",
      },
    ]),
  );
}

function buildCases(): Case[] {
  const cases: Case[] = [];
  const { fixtures } = loadPackingFixtures();
  for (const f of fixtures) {
    cases.push({
      id: f.id,
      set: "fixtures",
      impossible: f.group === "impossible",
      cartons: CARTONS.filter((c) => f.cartonIds.includes(c.id)),
      units: f.units.map((u) => ({
        unitId: u.unitId,
        productId: u.unitId.split("#")[0],
        name: u.unitId,
        dims: u.dims,
        baseDims: u.dims,
        weightG: u.weightG,
        fragile: u.fragile,
        liquid: u.liquid,
        sensitive: false,
        estimated: false,
        uprightHeight: u.uprightHeight,
      })),
    });
  }

  const facts = trueFacts();
  const names = new Map(loadProducts().map((p) => [p.id, p.name]));
  const toUnits = (lines: Array<{ productId: string; qty: number }>) => {
    const ls: OrderLine[] = lines.map((l) => ({ ...l, name: names.get(l.productId) ?? l.productId }));
    const r = prepareUnits(ls, facts, ENGINE_CONFIG);
    return r.ok ? r.units : null;
  };
  for (const o of loadOrders()) {
    const units = toUnits(o.items);
    if (units) cases.push({ id: `order-${o.id}`, set: "orders", impossible: false, cartons: CARTONS, units });
  }

  const rand = prng(SEED);
  const ids = [...facts.keys()];
  while (cases.filter((c) => c.set === "random").length < RANDOM_N) {
    const lines = new Map<string, number>();
    const nLines = 1 + Math.floor(rand() * 4);
    while (lines.size < nLines) lines.set(ids[Math.floor(rand() * ids.length)], 1 + Math.floor(rand() * 3));
    const units = toUnits([...lines].map(([productId, qty]) => ({ productId, qty })));
    if (units) cases.push({ id: `random-${cases.length}`, set: "random", impossible: false, cartons: CARTONS, units });
  }
  return cases;
}

// ---------------------------------------------------------------------------------------------- engines

interface Engine {
  key: string;
  label: string;
  /** Rules the engine cannot be told about (reported, and still checked by the validator). */
  unsupported: string[];
  run(c: Case): Promise<EngineAnswer>;
}

const rassah: Engine = {
  key: "rassah",
  label: `Rassah (${ENGINE_VERSION})`,
  unsupported: [],
  async run(c) {
    const opts = { config: ENGINE_CONFIG, rates: RATES };
    const r = packUnits(c.units, c.cartons, opts);
    if (r.status === "box_found") return { boxes: [{ carton: r.carton, placements: r.placements }], unpacked: [], engineMs: null };
    // Same as the app: when no single carton fits, suggest a split into several validated boxes.
    const split = splitPack(c.units, c.cartons, opts);
    return split
      ? { boxes: split.boxes.map((b) => ({ carton: b.carton, placements: b.placements })), unpacked: [], engineMs: null }
      : { boxes: [], unpacked: c.units.map((u) => u.unitId), engineMs: null };
  },
};

const naive: Engine = {
  key: "naive",
  label: "Naive packer (floor)",
  unsupported: ["liquids upright", "nothing on fragile", "support"],
  async run(c) {
    const r = baselinePack(c.units, c.cartons);
    return r ? { boxes: [r], unpacked: [], engineMs: null } : { boxes: [], unpacked: c.units.map((u) => u.unitId), engineMs: null };
  },
};

async function cachedPost(vendor: string, url: string, body: unknown, headers: Record<string, string>, cacheKeyBody: unknown) {
  const key = crypto.createHash("sha1").update(JSON.stringify(cacheKeyBody)).digest("hex");
  const file = path.join(CACHE_DIR, vendor, `${key}.json`);
  if (fs.existsSync(file)) return { ...(JSON.parse(fs.readFileSync(file, "utf8")) as { json: unknown; wallMs: number }), cached: true };
  if (CACHE_ONLY) throw new Error("not in cache (--cache-only)");
  const t0 = performance.now();
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const wallMs = performance.now() - t0;
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ json, wallMs }));
  return { json, wallMs, cached: false };
}

const vendorWall = new Map<string, number[]>();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function paccurate(apiKey: string | undefined): Engine {
  return {
    key: "paccurate",
    label: "Paccurate",
    unsupported: ["support (min. base contact)"],
    async run(c) {
      const body = paccurateRequest(c.units, c.cartons, RATES, ENGINE_CONFIG.wallCm);
      const headers: Record<string, string> = apiKey ? { authorization: `apikey ${apiKey}` } : {};
      const { json, wallMs, cached } = await cachedPost("paccurate", process.env.PACCURATE_URL || "https://api.paccurate.io/", body, headers, body);
      (vendorWall.get("paccurate") ?? vendorWall.set("paccurate", []).get("paccurate")!).push(wallMs);
      if (!cached) await pause(250);
      return parsePaccurate(json, c.units, c.cartons);
    },
  };
}

function binPacking(username: string, apiKey: string): Engine {
  return {
    key: "3dbinpacking",
    label: "3DBinPacking",
    unsupported: ["nothing on fragile", "support (min. base contact)"],
    async run(c) {
      const body = binPackingRequest(c.units, c.cartons, RATES, ENGINE_CONFIG.wallCm, { username, apiKey });
      const keyBody = { ...body, username: "", api_key: "" }; // never put credentials in the cache key or files
      const url = process.env.BINPACKING_URL || "https://global-api.3dbinpacking.com/packer/packIntoMany";
      const { json, wallMs, cached } = await cachedPost("3dbinpacking", url, body, {}, keyBody);
      (vendorWall.get("3dbinpacking") ?? vendorWall.set("3dbinpacking", []).get("3dbinpacking")!).push(wallMs);
      if (!cached) await pause(250);
      return parseBinPacking(json, c.units, c.cartons);
    },
  };
}

// ---------------------------------------------------------------------------------------------- scoring

type Outcome = "one_box" | "multi_box" | "not_packed" | "error";

interface Scored {
  outcome: Outcome;
  valid: boolean;
  violations: ViolationCode[];
  costSar: number | null;
  fill: number | null;
  ms: number;
  error?: string;
}

const GEOMETRY: ViolationCode[] = ["out_of_bounds", "overlap", "missing_item", "duplicate_item", "dim_mismatch", "overweight"];

function score(c: Case, a: EngineAnswer, ms: number): Scored {
  if (a.unpacked.length > 0 || a.boxes.length === 0) return { outcome: "not_packed", valid: false, violations: [], costSar: null, fill: null, ms };
  const byId = new Map(c.units.map((u) => [u.unitId, u]));
  const codes = new Set<ViolationCode>();
  let cost = 0;
  let inner = 0;
  for (const b of a.boxes) {
    const units = b.placements.map((p) => byId.get(p.unitId)).filter((u): u is Unit => !!u);
    for (const v of validateLayout(units, b.carton, b.placements, VOPTS).violations) codes.add(v.code);
    cost += estimateCost(b.carton, units, RATES, ENGINE_CONFIG.wallCm).totalSar;
    inner += volume(b.carton.inner);
  }
  // Every unit of the order must be placed exactly once across all boxes.
  const placed = a.boxes.flatMap((b) => b.placements.map((p) => p.unitId));
  if (placed.length !== c.units.length || new Set(placed).size !== c.units.length) codes.add("missing_item");
  const real = c.units.reduce((s, u) => s + volume(u.baseDims), 0);
  return {
    outcome: a.boxes.length === 1 ? "one_box" : "multi_box",
    valid: codes.size === 0,
    violations: [...codes],
    costSar: round2(cost),
    fill: real / inner,
    ms,
  };
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r2 = (n: number | null) => (n === null ? "—" : round2(n).toFixed(2));

// ---------------------------------------------------------------------------------------------- main

async function main() {
  const engines: Engine[] = [rassah, naive];
  if (process.env.PACCURATE_API_KEY || flag("paccurate-keyless")) engines.push(paccurate(process.env.PACCURATE_API_KEY));
  if (process.env.BINPACKING_USERNAME && process.env.BINPACKING_API_KEY) engines.push(binPacking(process.env.BINPACKING_USERNAME, process.env.BINPACKING_API_KEY));

  const cases = buildCases();
  const results = new Map<string, Map<string, Scored>>(engines.map((e) => [e.key, new Map()]));
  for (const e of engines) {
    process.stdout.write(`${e.label}: `);
    for (const c of cases) {
      const t0 = performance.now();
      try {
        const a = await e.run(c);
        const wall = performance.now() - t0;
        results.get(e.key)!.set(c.id, score(c, a, a.engineMs ?? wall));
      } catch (err) {
        results.get(e.key)!.set(c.id, { outcome: "error", valid: false, violations: [], costSar: null, fill: null, ms: 0, error: (err as Error).message });
      }
    }
    const errs = [...results.get(e.key)!.values()].filter((s) => s.outcome === "error");
    console.log(`${cases.length} cases${errs.length ? `, ${errs.length} errors (first: ${errs[0].error})` : ""}`);
  }

  const lines: string[] = [];
  const out = (s = "") => lines.push(s);
  out(`# Packing benchmark — ${new Date().toISOString().slice(0, 10)}`);
  out();
  out(`Cases: ${cases.length} (fixtures ${cases.filter((c) => c.set === "fixtures").length}, demo orders ${cases.filter((c) => c.set === "orders").length}, random orders ${cases.filter((c) => c.set === "random").length}, seed ${SEED}).`);
  out("Demo orders 1006 and 1017 are left out: their products have no known size even in the ground truth.");
  out("Same units, cartons and prices for every engine. Layouts judged by the Rassah validator, cost by one cost model (carton + dimensional-weight shipping, SAR).");
  out();

  const sets: Array<[string, (c: Case) => boolean]> = [
    ["All feasible cases", (c) => !c.impossible],
    ["Realistic orders (demo + random, full carton catalog)", (c) => c.set !== "fixtures"],
    ["Hard fixtures (tight, one carton offered)", (c) => c.set === "fixtures" && !c.impossible],
  ];
  for (const [title, pick] of sets) {
    const cs = cases.filter(pick);
    out(`## ${title} — ${cs.length} cases`);
    out();
    out("| Engine | Packed (one box) | Split into several boxes | Not packed | **Valid layouts** (all rules) | Geometry-valid only | p50 / p95 time |");
    out("|---|---|---|---|---|---|---|");
    for (const e of engines) {
      const s = cs.map((c) => results.get(e.key)!.get(c.id)!);
      const packed = s.filter((x) => x.outcome === "one_box" || x.outcome === "multi_box");
      const geo = packed.filter((x) => !x.violations.some((v) => GEOMETRY.includes(v)));
      const valid = packed.filter((x) => x.valid);
      const times = s.filter((x) => x.outcome !== "error").map((x) => x.ms);
      const wall = e.key === "paccurate" || e.key === "3dbinpacking" ? " (vendor-reported or wall incl. network)" : "";
      out(
        `| ${e.label} | ${pct(s.filter((x) => x.outcome === "one_box").length, cs.length)} | ${pct(s.filter((x) => x.outcome === "multi_box").length, cs.length)} | ${pct(s.filter((x) => x.outcome === "not_packed" || x.outcome === "error").length, cs.length)} | **${pct(valid.length, cs.length)}** | ${pct(geo.length, cs.length)} | ${r2(percentile(times, 50))} / ${r2(percentile(times, 95))} ms${wall} |`,
      );
    }
    out();

    // Cost: only where both engines produced a layout that passes every rule, so nobody "saves" by breaking one.
    for (const e of engines.filter((x) => x.key !== "rassah")) {
      const both = cs.filter((c) => results.get("rassah")!.get(c.id)!.valid && results.get(e.key)!.get(c.id)!.valid);
      if (!both.length) continue;
      const ra = both.map((c) => results.get("rassah")!.get(c.id)!.costSar!);
      const ot = both.map((c) => results.get(e.key)!.get(c.id)!.costSar!);
      const cheaper = both.filter((_, i) => ra[i] < ot[i] - 0.005).length;
      const costlier = both.filter((_, i) => ra[i] > ot[i] + 0.005).length;
      const saving = (mean(ot)! - mean(ra)!) / mean(ot)!;
      const fillRa = mean(both.map((c) => results.get("rassah")!.get(c.id)!.fill!))!;
      const fillOt = mean(both.map((c) => results.get(e.key)!.get(c.id)!.fill!))!;
      out(
        `- Cost vs ${e.label} on ${both.length} orders both packed validly: Rassah ${r2(mean(ra))} SAR vs ${r2(mean(ot))} SAR per order (${saving >= 0 ? "saves" : "costs"} ${pct(Math.abs(saving), 1)}); Rassah cheaper ${cheaper}, same ${both.length - cheaper - costlier}, costlier ${costlier}. Mean carton fill ${pct(fillRa, 1)} vs ${pct(fillOt, 1)}.`,
      );
      const onlyRassah = cs.filter((c) => results.get("rassah")!.get(c.id)!.valid && !results.get(e.key)!.get(c.id)!.valid).length;
      const onlyOther = cs.filter((c) => !results.get("rassah")!.get(c.id)!.valid && results.get(e.key)!.get(c.id)!.valid).length;
      out(`- Valid only with Rassah: ${onlyRassah}; valid only with ${e.label}: ${onlyOther}.`);
    }
    out();
  }

  out("## Rule violations found by the validator (feasible cases)");
  out();
  out("| Engine | Rules it cannot be told | Violations by rule (cases) |");
  out("|---|---|---|");
  for (const e of engines) {
    const counts: Record<string, number> = {};
    for (const c of cases.filter((x) => !x.impossible)) for (const v of results.get(e.key)!.get(c.id)!.violations) counts[v] = (counts[v] ?? 0) + 1;
    out(`| ${e.label} | ${e.unsupported.join(", ") || "—"} | ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ") || "none"} |`);
  }
  out();

  const imp = cases.filter((c) => c.impossible);
  out(`## Impossible fixtures — ${imp.length} cases (no single offered carton can hold the order)`);
  out();
  for (const e of engines) {
    const s = imp.map((c) => results.get(e.key)!.get(c.id)!);
    out(`- ${e.label}: false "fits in one box" claims that pass the validator ${s.filter((x) => x.outcome === "one_box" && x.valid).length}, invalid one-box claims ${s.filter((x) => x.outcome === "one_box" && !x.valid).length}, valid split into several boxes ${s.filter((x) => x.outcome === "multi_box" && x.valid).length}, invalid split ${s.filter((x) => x.outcome === "multi_box" && !x.valid).length}, said no ${s.filter((x) => x.outcome === "not_packed").length}.`);
  }
  out();

  // Data readiness: vendors need every size entered up front; Rassah reads them from the product page.
  const products = loadProducts();
  const groups = new Map(products.map((p) => [p.id, p.group]));
  const demo = loadOrders();
  const noManual = demo.filter((o) => o.items.every((i) => groups.get(i.productId) !== "C")).length;
  out("## Sizes missing from the store");
  out();
  out(`- Both vendor APIs require length, width, height and weight for every item in the request. With no sizes entered by the merchant they can pack 0/${demo.length} demo orders.`);
  out(`- Rassah reads sizes from the product page (${products.filter((p) => p.group === "A").length} products state them, ${products.filter((p) => p.group === "B").length} are estimated with a safety margin, ${products.filter((p) => p.group === "C").length} need measuring): ${noManual}/${demo.length} demo orders pack with no data entry, the rest after one measurement per product.`);
  out();
  for (const [k, xs] of vendorWall) out(`- ${k} round-trip wall time incl. network: p50 ${r2(percentile(xs, 50))} ms, p95 ${r2(percentile(xs, 95))} ms over ${xs.length} calls (cached calls report their first measurement).`);

  const report = lines.join("\n").trimEnd() + "\n";
  console.log("\n" + report);
  if (WRITE) {
    const date = new Date().toISOString().slice(0, 10);
    const dir = path.join(process.cwd(), "eval", "results");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `bench-${date}.md`), report);
    const raw = Object.fromEntries([...results].map(([k, m]) => [k, Object.fromEntries(m)]));
    fs.writeFileSync(path.join(dir, `bench-${date}.json`), JSON.stringify({ createdAt: new Date().toISOString(), seed: SEED, engines: engines.map((e) => e.key), results: raw }, null, 2) + "\n");
    console.log(`Wrote eval/results/bench-${date}.md and .json`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
