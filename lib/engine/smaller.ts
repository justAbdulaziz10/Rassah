// Why each carton smaller than the chosen one was not used, in terms a packer can check by hand.
// Reads the packer's attempts; it never searches again.

import { rotations, volume } from "./geometry";
import type { Carton, CartonAttempt, Unit } from "./types";

export type SmallerReason =
  /** One item does not fit in any allowed orientation; `overCm` is how much its best side is too long. */
  | { kind: "too_long"; unitName: string; overCm: number }
  /** The items weigh more than the carton carries (its limit less its own weight). */
  | { kind: "too_heavy"; itemsKg: number; maxKg: number }
  /** The items together take more space than the carton has. */
  | { kind: "too_full"; itemsLitres: number; cartonLitres: number }
  /** Size, weight and volume allow it, but no arrangement passed every safety rule. */
  | { kind: "no_layout" }
  /** It holds the order, but costs more with shipping. */
  | { kind: "pricier" }
  /** The search ran out of time before trying it fully. */
  | { kind: "timeout" };

export interface SmallerCarton {
  id: string;
  name: string;
  innerCm: [number, number, number];
  reason: SmallerReason;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** How far `unit` overhangs `inner` in its best orientation (≤ 0 when it fits). */
function overhang(unit: Unit, inner: readonly [number, number, number]): number {
  return Math.min(...rotations(unit).map((d) => Math.max(d[0] - inner[0], d[1] - inner[1], d[2] - inner[2])));
}

function reasonFor(carton: Carton, attempt: CartonAttempt | undefined, units: Unit[]): SmallerReason {
  switch (attempt?.outcome) {
    case "oversize": {
      let worst = units[0];
      for (const u of units) if (overhang(u, carton.inner) > overhang(worst, carton.inner)) worst = u;
      return { kind: "too_long", unitName: worst.name, overCm: Math.max(0.1, round1(overhang(worst, carton.inner))) };
    }
    case "overweight":
      return {
        kind: "too_heavy",
        itemsKg: round1(units.reduce((s, u) => s + u.weightG, 0) / 1000),
        maxKg: round1((carton.maxWeightG - carton.tareG) / 1000),
      };
    case "packed":
    case "not_needed":
      return { kind: "pricier" };
    case "search_budget":
      return { kind: "timeout" };
    default: {
      const itemsCm3 = units.reduce((s, u) => s + volume(u.dims), 0);
      const cartonCm3 = volume(carton.inner);
      return itemsCm3 > cartonCm3
        ? { kind: "too_full", itemsLitres: round1(itemsCm3 / 1000), cartonLitres: round1(cartonCm3 / 1000) }
        : { kind: "no_layout" };
    }
  }
}

/** Cartons with less inside space than `chosen`, nearest in size first, each with why it was not used. */
export function smallerCartons(chosen: Carton, cartons: Carton[], units: Unit[], attempts: CartonAttempt[]): SmallerCarton[] {
  const byId = new Map(attempts.map((a) => [a.cartonId, a]));
  return cartons
    .filter((c) => c.id !== chosen.id && volume(c.inner) < volume(chosen.inner))
    .sort((a, b) => volume(b.inner) - volume(a.inner))
    .map((c) => ({ id: c.id, name: c.name, innerCm: c.inner, reason: reasonFor(c, byId.get(c.id), units) }));
}
