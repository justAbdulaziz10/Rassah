// Turns product facts + order lines into placeable units.

import type { EngineConfig } from "./config";
import { sortDesc } from "./geometry";
import type { OrderLine, ProductFacts, Unit } from "./types";

export type PrepareResult =
  | { ok: true; units: Unit[] }
  | { ok: false; kind: "needs_measurement"; productIds: string[] }
  | { ok: false; kind: "invalid_input"; message: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function prepareUnits(
  lines: OrderLine[],
  facts: Map<string, ProductFacts>,
  config: EngineConfig,
): PrepareResult {
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  if (totalUnits < 1) return { ok: false, kind: "invalid_input", message: "order has no items" };
  if (totalUnits > config.maxUnits) {
    return { ok: false, kind: "invalid_input", message: `order has ${totalUnits} units, maximum is ${config.maxUnits}` };
  }

  // Unknown values block packing: we never run the engine on guesses we could not make.
  const needs = new Set<string>();
  for (const line of lines) {
    const f = facts.get(line.productId);
    if (
      !f ||
      f.dimsSource === "unknown" ||
      f.weightSource === "unknown" ||
      !(f.lengthCm! > 0 && f.widthCm! > 0 && f.heightCm! > 0 && f.weightG! > 0)
    ) {
      needs.add(line.productId);
    }
  }
  if (needs.size > 0) return { ok: false, kind: "needs_measurement", productIds: [...needs] };

  const units: Unit[] = [];
  for (const line of lines) {
    const f = facts.get(line.productId)!;
    const estimated = f.dimsSource === "inferred";
    // Inferred sizes get a safety margin so a slightly-too-small estimate still fits.
    const margin = estimated ? 1 + config.marginInferred : 1;
    // Fragile and sensitive items get protective padding on every side.
    const pad = f.fragile || f.sensitive ? 2 * config.paddingCm : 0;
    const grow = (d: number) => round2(d * margin + pad);

    const upright = grow(f.heightCm!); // height is the vertical side when the product stands as sold
    const dims = sortDesc([grow(f.lengthCm!), grow(f.widthCm!), upright]);
    const baseDims = sortDesc([f.lengthCm!, f.widthCm!, f.heightCm!]);

    for (let i = 1; i <= line.qty; i++) {
      units.push({
        unitId: `${line.productId}#${i}`,
        productId: line.productId,
        name: line.name,
        dims,
        baseDims,
        weightG: f.weightG!,
        fragile: f.fragile,
        liquid: f.liquid,
        sensitive: f.sensitive,
        estimated,
        uprightHeight: f.liquid ? upright : null,
      });
    }
  }
  return { ok: true, units };
}
