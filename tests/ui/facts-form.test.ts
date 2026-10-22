// What the facts form sends, and what the server and engine make of it: correcting one side of
// an AI estimate keeps the other two as guesses (with the safety margin); all three makes it measured.
import { describe, expect, it } from "vitest";
import { factChanges, toFormValues, type FactsFormValues } from "@/components/FactsForm";
import { MemoryRepo } from "@/lib/db/memory";
import type { StoredFacts } from "@/lib/db/types";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import { prepareUnits } from "@/lib/engine/prepare";
import { FactChangesSchema, updateProductFacts } from "@/lib/pipeline/facts";

const ESTIMATE: StoredFacts = {
  productId: "p-02",
  lengthCm: 15,
  widthCm: 9,
  heightCm: 6,
  weightG: 300,
  dimsSource: "inferred",
  weightSource: "inferred",
  fragile: false,
  liquid: false,
  sensitive: false,
  confidence: "medium",
  evidence: null,
  origin: "ai",
  sourceHash: "h-p-02",
  model: "m",
  promptVersion: "v1",
  extractedAt: null,
  updatedAt: "2026-10-21T00:00:00Z",
};

function changesOf(values: FactsFormValues, initial: FactsFormValues, mode: "edit" | "measure") {
  const r = factChanges(values, initial, mode);
  if ("error" in r) throw new Error(r.error);
  return r.changes;
}

async function save(changes: Partial<FactsFormValues>) {
  const repo = new MemoryRepo();
  repo.products.set("p-02", { id: "p-02", name: "علبة", description: "", url: null, category: null, sourceHash: "h-p-02" });
  repo.facts.set("p-02", ESTIMATE);
  // Parsed as the API route parses the request body.
  const { facts } = await updateProductFacts({ repo, productId: "p-02", changes: FactChangesSchema.parse(changes), runId: null });
  const prepared = prepareUnits([{ productId: "p-02", name: "علبة", qty: 1 }], new Map([["p-02", facts]]), ENGINE_CONFIG);
  if (!prepared.ok) throw new Error("not packable");
  return { facts, unit: prepared.units[0] };
}

describe("factChanges (edit)", () => {
  const initial = toFormValues(ESTIMATE);

  it("sends only the side that changed", () => {
    expect(changesOf({ ...initial, heightCm: 7 }, initial, "edit")).toEqual({ heightCm: 7 });
  });

  it("an estimate 15×9×6 corrected only in height stays a guess, with the margin", async () => {
    const { facts, unit } = await save(changesOf({ ...initial, heightCm: 7 }, initial, "edit"));
    expect(facts).toMatchObject({ lengthCm: 15, widthCm: 9, heightCm: 7, dimsSource: "inferred" });
    expect(unit.estimated).toBe(true);
    expect(unit.dims[0]).toBeCloseTo(15 * (1 + ENGINE_CONFIG.marginInferred), 2);
  });

  it("all three sides corrected → measured, no margin", async () => {
    const { facts, unit } = await save(changesOf({ ...initial, lengthCm: 16, widthCm: 10, heightCm: 7 }, initial, "edit"));
    expect(facts.dimsSource).toBe("manual");
    expect(unit.estimated).toBe(false);
    expect(unit.dims).toEqual([16, 10, 7]);
  });

  it("sends a changed flag alone, and refuses an unchanged form", () => {
    expect(changesOf({ ...initial, fragile: true }, initial, "edit")).toEqual({ fragile: true });
    expect(factChanges(initial, initial, "edit")).toEqual({ error: "لم تغيّر أي قيمة" });
  });
});

describe("factChanges (measure)", () => {
  it("sends every number, even one equal to the stored guess", () => {
    const initial = toFormValues(ESTIMATE);
    expect(changesOf({ ...initial, heightCm: 7 }, initial, "measure")).toEqual({ lengthCm: 15, widthCm: 9, heightCm: 7, weightG: 300 });
  });

  it("asks for all four numbers", () => {
    const initial = toFormValues({ ...ESTIMATE, weightG: null });
    expect("error" in factChanges(initial, initial, "measure")).toBe(true);
  });
});
