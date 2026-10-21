// Public interface of the packing engine. Pure: no network, no database, no framework imports.

import { ENGINE_CONFIG, type EngineConfig } from "./config";
import { buildInstructions, type InstructionStep } from "./instructions";
import { packUnits } from "./packer";
import { prepareUnits } from "./prepare";
import { splitPack, type SplitPlan } from "./split";
import type { Carton, OrderLine, PackResult, ProductFacts, ShippingRates } from "./types";

export { ENGINE_CONFIG } from "./config";
export type { EngineConfig } from "./config";
export type { InstructionStep } from "./instructions";
export * from "./types";

export type PackOrderResult =
  | (PackResult & { instructions?: InstructionStep[]; split?: SplitPlan | null })
  | { status: "invalid_input"; message: string };

/** Facts + order lines + cartons → validated carton choice, layout and instructions. */
export function packOrder(
  lines: OrderLine[],
  facts: Map<string, ProductFacts>,
  cartons: Carton[],
  rates: ShippingRates,
  config: EngineConfig = ENGINE_CONFIG,
  now?: () => number,
): PackOrderResult {
  const prepared = prepareUnits(lines, facts, config);
  if (!prepared.ok) {
    return prepared.kind === "needs_measurement"
      ? { status: "needs_measurement", productIds: prepared.productIds }
      : { status: "invalid_input", message: prepared.message };
  }
  const result = packUnits(prepared.units, cartons, { config, rates, now });
  // No single carton fits: suggest the cheapest split into several cartons, each one validated.
  if (result.status !== "box_found") return { ...result, split: splitPack(prepared.units, cartons, { config, rates, now }) };
  return {
    ...result,
    instructions: buildInstructions(result.carton, result.placements, result.units, config.paddingCm),
  };
}
