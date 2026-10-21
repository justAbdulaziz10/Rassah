// Packing evaluation (docs/stack/07 §3): engine vs naive baseline on 60 fixed fixtures.
// No network. Prints the summary. With --write it also writes
// eval/results/packing-<date>-<engine>.json (tracked in git, so only on purpose).
// Stores eval_runs/eval_results in Supabase when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are set.
// Usage: npm run eval:packing            (read-only run)
//        npm run eval:packing -- --write (also write the results file)

import fs from "node:fs";
import path from "node:path";
import { loadCartons, loadPackingFixtures } from "../lib/data/load";
import { baselinePack } from "../lib/engine/baseline";
import { ENGINE_CONFIG, ENGINE_VERSION as DEFAULT_ENGINE_VERSION } from "../lib/engine/config";
import { estimateCost } from "../lib/engine/cost";
import { packUnits } from "../lib/engine/packer";
import type { Unit, ViolationCode } from "../lib/engine/types";
import { validateLayout } from "../lib/engine/validator";
import { percentile } from "../lib/math";
import { hasSupabaseEnv, must, scriptSupabase } from "./_supabase";

const ENGINE_VERSION = process.env.ENGINE_VERSION?.trim() || DEFAULT_ENGINE_VERSION;
const WRITE = process.argv.includes("--write");
const VOPTS = { minSupport: ENGINE_CONFIG.minSupport, eps: ENGINE_CONFIG.eps };

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

async function main() {
  const { fixtures, seed } = loadPackingFixtures();
  const { cartons: allCartons, shipping } = loadCartons();
  const results: Array<{ caseId: string; passed: boolean | null; details: Record<string, unknown> }> = [];

  let engineLayouts = 0;
  let engineValid = 0;
  let feasibleFound = 0;
  let impossibleClaims = 0;
  let baselineLayouts = 0;
  let baselineInvalid = 0;
  const baselineByCode: Partial<Record<ViolationCode, number>> = {};
  const engineMs: number[] = [];
  const costDeltas: number[] = [];
  let engineOnlyValid = 0;
  let jointlyValidSingleCarton = 0;
  const emptyBucket = () => ({ sameCost: 0, engineCheaper: 0, engineCostlier: 0 });
  const vsBaseline = { baselineValid: emptyBucket(), baselineInvalid: emptyBucket() };

  for (const f of fixtures) {
    const cartons = allCartons.filter((c) => f.cartonIds.includes(c.id));
    const units: Unit[] = f.units.map((u) => ({
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
    }));

    const t0 = performance.now();
    const engine = packUnits(units, cartons, { config: ENGINE_CONFIG, rates: shipping });
    const ms = performance.now() - t0;
    engineMs.push(ms);

    let engineOk: boolean | null = null;
    if (engine.status === "box_found") {
      engineLayouts++;
      engineOk = validateLayout(units, engine.carton, engine.placements, VOPTS).valid;
      if (engineOk) engineValid++;
    }

    const base = baselinePack(units, cartons);
    let baseOk: boolean | null = null;
    let baseCodes: ViolationCode[] = [];
    if (base) {
      baselineLayouts++;
      const check = validateLayout(units, base.carton, base.placements, VOPTS);
      baseOk = check.valid;
      if (!check.valid) {
        baselineInvalid++;
        baseCodes = [...new Set(check.violations.map((v) => v.code))];
        for (const c of baseCodes) baselineByCode[c] = (baselineByCode[c] ?? 0) + 1;
      }
    }

    // Fair cost comparison only where BOTH produced a validated layout.
    let costDelta: number | null = null;
    if (engine.status === "box_found" && engineOk && base && baseOk) {
      const baseCost = estimateCost(base.carton, units, shipping, ENGINE_CONFIG.wallCm).totalSar;
      costDelta = round(baseCost - engine.cost.totalSar, 2);
      costDeltas.push(costDelta);
      if (cartons.length === 1) jointlyValidSingleCarton++;
    } else if (engine.status === "box_found" && engineOk && !(base && baseOk)) {
      engineOnlyValid++;
    }
    // Carton price comparison wherever both returned a layout, split by baseline validity.
    // Where the baseline is invalid, a cheaper baseline carton is the price of the rules it broke.
    if (engine.status === "box_found" && engineOk && base) {
      const d = estimateCost(base.carton, units, shipping, ENGINE_CONFIG.wallCm).totalSar - engine.cost.totalSar;
      const bucket = vsBaseline[baseOk ? "baselineValid" : "baselineInvalid"];
      bucket[d > 0.005 ? "engineCheaper" : d < -0.005 ? "engineCostlier" : "sameCost"]++;
    }

    let passed: boolean | null = null;
    if (f.group === "known_feasible") {
      const found = engine.status === "box_found" && engineOk === true;
      if (found) feasibleFound++;
      passed = found;
    } else if (f.group === "impossible") {
      const claimed = engine.status === "box_found";
      if (claimed) impossibleClaims++;
      passed = !claimed;
    } else {
      passed = engine.status === "box_found" ? engineOk : null; // random: only validity is judged
    }

    results.push({
      caseId: f.id,
      passed,
      details: {
        group: f.group,
        units: units.length,
        engine: engine.status === "box_found"
          ? { status: engine.status, carton: engine.carton.id, strategy: engine.strategy, valid: engineOk, totalSar: engine.cost.totalSar }
          : { status: engine.status, attempts: engine.attempts },
        baseline: base ? { carton: base.carton.id, valid: baseOk, violations: baseCodes } : { status: "no_layout" },
        costDeltaSar: costDelta,
        ms: round(ms, 1),
        impossibleReason: f.impossibleReason ?? null,
      },
    });
  }

  const feasibleTotal = fixtures.filter((f) => f.group === "known_feasible").length;
  const impossibleTotal = fixtures.filter((f) => f.group === "impossible").length;
  const summary = {
    fixtures: fixtures.length,
    seed,
    engineVersion: ENGINE_VERSION,
    engineValidity: engineLayouts ? round(engineValid / engineLayouts) : null,
    engineLayouts,
    knownFeasibleRecall: round(feasibleFound / feasibleTotal),
    knownFeasibleFound: feasibleFound,
    knownFeasibleTotal: feasibleTotal,
    impossibleFalseClaims: impossibleClaims,
    impossibleTotal,
    baselineLayouts,
    baselineInvalid,
    baselineInvalidRate: baselineLayouts ? round(baselineInvalid / baselineLayouts) : null,
    baselineInvalidByCode: baselineByCode,
    jointlyValid: costDeltas.length,
    meanCostSavingSar: costDeltas.length ? round(costDeltas.reduce((s, v) => s + v, 0) / costDeltas.length, 2) : null,
    jointlyValidSingleCarton,
    cartonCostVsBaseline: vsBaseline,
    engineOnlyValid,
    runtimeP50Ms: round(percentile(engineMs, 50) ?? 0, 1),
    runtimeP95Ms: round(percentile(engineMs, 95) ?? 0, 1),
  };

  const fmt = (b: ReturnType<typeof emptyBucket>) =>
    `same ${b.sameCost}, engine cheaper ${b.engineCheaper}, engine costlier ${b.engineCostlier}`;
  console.log(`\nPacking evaluation (${ENGINE_VERSION})`);
  console.table({
    "Engine layout validity (must be 100%)": `${engineValid}/${engineLayouts}`,
    "Known-feasible recall": `${feasibleFound}/${feasibleTotal}`,
    "Impossible false claims (must be 0)": `${impossibleClaims}/${impossibleTotal}`,
    "Baseline layouts failing the validator": `${baselineInvalid}/${baselineLayouts}`,
    "Baseline violations by code": JSON.stringify(baselineByCode),
    "Mean cost saving vs baseline (jointly valid)": `${summary.meanCostSavingSar} SAR over ${costDeltas.length} fixtures (${jointlyValidSingleCarton} offer one carton only)`,
    "Carton cost vs valid baseline": fmt(vsBaseline.baselineValid),
    "Carton cost vs invalid baseline": fmt(vsBaseline.baselineInvalid),
    "Engine valid where baseline was not": engineOnlyValid,
    "Engine runtime p50 / p95": `${summary.runtimeP50Ms} / ${summary.runtimeP95Ms} ms`,
  });

  if (WRITE) {
    const date = new Date().toISOString().slice(0, 10);
    const outDir = path.join(process.cwd(), "eval", "results");
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `packing-${date}-${ENGINE_VERSION}.json`);
    fs.writeFileSync(file, JSON.stringify({ kind: "packing", createdAt: new Date().toISOString(), summary, results }, null, 2) + "\n");
    console.log(`Wrote ${path.relative(process.cwd(), file)}`);
  } else {
    console.log("Read-only run: pass --write to save eval/results/packing-<date>-<engine>.json.");
  }

  if (hasSupabaseEnv()) {
    const db = scriptSupabase();
    const run = must(
      "eval_runs",
      await db.from("eval_runs").insert({ kind: "packing", engine_version: ENGINE_VERSION, summary }).select("id"),
    ) as Array<{ id: string }>;
    must(
      "eval_results",
      await db.from("eval_results").insert(results.map((r) => ({ eval_run_id: run[0].id, case_id: r.caseId, passed: r.passed, details: r.details }))),
    );
    console.log(`Stored eval run ${run[0].id} in Supabase.`);
  } else {
    console.log("Supabase not configured: nothing stored in the database.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
