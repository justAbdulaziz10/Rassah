// Loads and validates the synthetic dataset from data/. For scripts (seed, evals, validation),
// not for request-time app code, which reads from Supabase.

import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import {
  CartonsFileSchema,
  GroundTruthFileSchema,
  OrdersFileSchema,
  PackingFixturesFileSchema,
  ProductsFileSchema,
} from "./schemas";

const DATA_DIR = path.join(process.cwd(), "data");

function load<T>(file: string, schema: z.ZodType<T>): T {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`data/${file} is invalid:\n  ${issues}`);
  }
  return parsed.data;
}

export const loadProducts = () => load("products.json", ProductsFileSchema).products;
export const loadGroundTruth = () => load("ground_truth.json", GroundTruthFileSchema).items;
export const loadCartons = () => load("cartons.json", CartonsFileSchema);
export const loadOrders = () => load("orders.json", OrdersFileSchema).orders;
export const loadPackingFixtures = () => load("packing_fixtures.json", PackingFixturesFileSchema);
