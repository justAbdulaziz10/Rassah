// Zod schemas for every file in data/. Used by scripts/validate-data.ts, the seed and the evals.

import { z } from "zod";

const positive = z.number().positive();
const dims3 = z.tuple([positive, positive, positive]);

export const ProductSchema = z.object({
  id: z.string().regex(/^p-\d{2}$/),
  group: z.enum(["A", "B", "C"]),
  name: z.string().min(1),
  category: z.string().min(1),
  url: z.url(),
  description: z.string().min(10),
});
export const ProductsFileSchema = z.object({ _note: z.string(), products: z.array(ProductSchema).min(1) });

export const GroundTruthItemSchema = z.object({
  productId: z.string(),
  lengthCm: positive.nullable(),
  widthCm: positive.nullable(),
  heightCm: positive.nullable(),
  weightG: positive.nullable(),
  fragile: z.boolean(),
  liquid: z.boolean(),
  sensitive: z.boolean(),
  expectedDimsSource: z.enum(["page", "inferred", "unknown"]),
  holdout: z.boolean(),
});
export const GroundTruthFileSchema = z.object({ _note: z.string(), items: z.array(GroundTruthItemSchema) });

export const CartonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inner: dims3,
  maxWeightG: positive,
  tareG: z.number().nonnegative(),
  costSar: z.number().nonnegative(),
});
export const CartonsFileSchema = z.object({
  _note: z.string(),
  shipping: z.object({ baseSar: z.number().nonnegative(), perKgSar: z.number().nonnegative(), volumetricDivisor: positive }),
  cartons: z.array(CartonSchema).min(1),
});

export const OrderSchema = z.object({
  id: z.string().regex(/^\d{4}$/),
  demo: z.string().optional(),
  expect: z.string(),
  items: z.array(z.object({ productId: z.string(), qty: z.number().int().min(1).max(12) })).min(1),
});
export const OrdersFileSchema = z.object({ _note: z.string(), orders: z.array(OrderSchema).min(1) });

const FixtureUnitSchema = z.object({
  unitId: z.string(),
  dims: dims3,
  weightG: positive,
  fragile: z.boolean(),
  liquid: z.boolean(),
  uprightHeight: positive.nullable(),
});
const FixturePlacementSchema = z.object({
  unitId: z.string(),
  x: z.number(), y: z.number(), z: z.number(),
  dx: positive, dy: positive, dz: positive,
});
export const PackingFixtureSchema = z.object({
  id: z.string(),
  group: z.enum(["known_feasible", "impossible", "random"]),
  cartonIds: z.array(z.string()).min(1),
  units: z.array(FixtureUnitSchema).min(1),
  witness: z.object({ cartonId: z.string(), placements: z.array(FixturePlacementSchema) }).optional(),
  impossibleReason: z.enum(["oversize", "overweight", "liquid_too_tall"]).optional(),
});
export const PackingFixturesFileSchema = z.object({
  _note: z.string(),
  seed: z.number(),
  fixtures: z.array(PackingFixtureSchema),
});

export type ProductRow = z.infer<typeof ProductSchema>;
export type GroundTruthItem = z.infer<typeof GroundTruthItemSchema>;
export type CartonRow = z.infer<typeof CartonSchema>;
export type CartonsFile = z.infer<typeof CartonsFileSchema>;
export type OrderRow = z.infer<typeof OrderSchema>;
export type PackingFixture = z.infer<typeof PackingFixtureSchema>;
