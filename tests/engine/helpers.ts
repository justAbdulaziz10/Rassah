import { ENGINE_CONFIG } from "@/lib/engine/config";
import type { Carton, Placement, ProductFacts, ShippingRates, Unit } from "@/lib/engine/types";

export const CFG = { ...ENGINE_CONFIG };
export const VOPTS = { minSupport: CFG.minSupport, eps: CFG.eps };
export const RATES: ShippingRates = { baseSar: 18, perKgSar: 3, volumetricDivisor: 5000 };

export function unit(
  id: string,
  dims: [number, number, number],
  opts: Partial<Pick<Unit, "weightG" | "fragile" | "liquid" | "sensitive" | "estimated" | "uprightHeight">> = {},
): Unit {
  const sorted = [...dims].sort((a, b) => b - a) as [number, number, number];
  return {
    unitId: id,
    productId: id.split("#")[0],
    name: id,
    dims: sorted,
    baseDims: sorted,
    weightG: opts.weightG ?? 100,
    fragile: opts.fragile ?? false,
    liquid: opts.liquid ?? false,
    sensitive: opts.sensitive ?? false,
    estimated: opts.estimated ?? false,
    uprightHeight: opts.uprightHeight ?? null,
  };
}

export function carton(id: string, inner: [number, number, number], maxWeightG = 10_000, costSar = 1, tareG = 0): Carton {
  return { id, name: id, inner, maxWeightG, tareG, costSar };
}

export function place(unitId: string, x: number, y: number, z: number, dx: number, dy: number, dz: number): Placement {
  return { unitId, x, y, z, dx, dy, dz };
}

export function facts(productId: string, f: Partial<ProductFacts> = {}): ProductFacts {
  return {
    productId,
    lengthCm: 10,
    widthCm: 10,
    heightCm: 10,
    weightG: 200,
    dimsSource: "page",
    weightSource: "page",
    fragile: false,
    liquid: false,
    sensitive: false,
    confidence: "high",
    ...f,
  };
}

/** Small deterministic PRNG (mulberry32) for reproducible random tests. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
