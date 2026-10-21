// Estimated packaging + shipping cost. All rates are synthetic demo values and labeled as estimates.

import { round2 } from "./geometry";
import type { Carton, CostEstimate, ShippingRates, Unit } from "./types";

export function estimateCost(carton: Carton, units: Unit[], rates: ShippingRates, wallCm: number): CostEstimate {
  const outerCm = carton.inner.map((d) => round2(d + 2 * wallCm)) as [number, number, number];
  const actualKg = (units.reduce((s, u) => s + u.weightG, 0) + carton.tareG) / 1000;
  // Couriers bill the larger of actual and volumetric weight.
  const volumetricKg = (outerCm[0] * outerCm[1] * outerCm[2]) / rates.volumetricDivisor;
  const chargeableKg = Math.max(actualKg, volumetricKg);
  // Base fee covers the first kg; each additional *started* kg is charged.
  const extraKg = Math.max(0, Math.ceil(chargeableKg - 1e-9) - 1);
  const shippingSar = rates.baseSar + rates.perKgSar * extraKg;
  return {
    cartonSar: carton.costSar,
    outerCm,
    actualKg: round2(actualKg),
    volumetricKg: round2(volumetricKg),
    chargeableKg: round2(chargeableKg),
    shippingSar: round2(shippingSar),
    totalSar: round2(carton.costSar + shippingSar),
    estimated: true,
  };
}
