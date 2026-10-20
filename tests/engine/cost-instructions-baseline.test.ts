import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { baselinePack } from "@/lib/engine/baseline";
import { estimateCost } from "@/lib/engine/cost";
import { buildInstructions } from "@/lib/engine/instructions";
import { validateLayout } from "@/lib/engine/validator";
import { RATES, VOPTS, carton, place, unit } from "./helpers";

describe("estimateCost", () => {
  it("bills volumetric weight when the box is big and light", () => {
    const c = carton("L", [40, 30, 25], 15000, 2.6); // outer 41x31x26 = 33046 cm3 → 6.61 kg volumetric
    const cost = estimateCost(c, [unit("a#1", [10, 10, 10], { weightG: 500 })], RATES, 0.5);
    expect(cost.volumetricKg).toBeCloseTo(6.61, 2);
    expect(cost.chargeableKg).toBeCloseTo(6.61, 2);
    expect(cost.shippingSar).toBe(18 + 3 * 6); // first kg in base, then 6 started kgs (2..7)
    expect(cost.estimated).toBe(true);
  });

  it("bills actual weight when the box is small and heavy", () => {
    const c = carton("S", [20, 15, 10], 3000, 0.9); // outer 21x16x11 → 0.74 kg volumetric
    const cost = estimateCost(c, [unit("a#1", [10, 10, 10], { weightG: 2500 })], RATES, 0.5);
    expect(cost.chargeableKg).toBe(2.5);
    expect(cost.shippingSar).toBe(18 + 3 * 2);
  });

  it("does not charge an extra kg at an exact boundary", () => {
    const c = carton("S", [5, 5, 5], 3000, 1);
    const cost = estimateCost(c, [unit("a#1", [1, 1, 1], { weightG: 2000 })], RATES, 0);
    expect(cost.shippingSar).toBe(18 + 3 * 1);
  });
});

describe("buildInstructions", () => {
  const c = carton("M", [30, 20, 15]);
  const units = [
    unit("book#1", [20, 15, 3]),
    unit("perfume#1", [8, 8, 15], { fragile: true, liquid: true, uprightHeight: 15, estimated: true }),
  ];
  const placements = [place("book#1", 0, 0, 0, 20, 15, 3), place("perfume#1", 20, 0, 0, 8, 8, 15)];
  const steps = buildInstructions(c, placements, units, 1.5);

  it("starts with the carton and ends with void fill + this side up", () => {
    expect(steps[0].text).toContain("M");
    expect(steps.at(-2)!.text).toContain("حشو");
    expect(steps.at(-1)!.text).toContain("للأعلى");
  });

  it("adds fragile, liquid and estimated notes only where they apply", () => {
    const perfume = steps.find((s) => s.unitId === "perfume#1")!;
    const book = steps.find((s) => s.unitId === "book#1")!;
    expect(perfume.notes.join(" ")).toMatch(/قابل للكسر/);
    expect(perfume.notes.join(" ")).toMatch(/سائل/);
    expect(perfume.notes.join(" ")).toMatch(/تقديري/);
    expect(book.notes).toEqual([]);
  });
});

describe("naive baseline", () => {
  it("can produce layouts that break real-world rules (this is why the validator exists)", () => {
    // The glass is bigger, so the volume-first baseline places it first and stacks the book on it.
    const units = [unit("glass#1", [20, 15, 6], { fragile: true }), unit("book#1", [20, 15, 4])];
    const r = baselinePack(units, [carton("S", [20, 15, 10])]);
    expect(r).not.toBeNull();
    const check = validateLayout(units, r!.carton, r!.placements, VOPTS);
    expect(check.valid).toBe(false);
    expect(check.violations.map((v) => v.code)).toContain("on_fragile");
  });
});

describe("module boundaries", () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), "lib/engine", f), "utf8");

  it("validator imports nothing from the packer or its geometry helpers", () => {
    const src = read("validator.ts");
    expect(src).not.toMatch(/from\s+["']\.\/(packer|geometry|baseline)["']/);
  });

  it("engine has no network, database, AI or framework imports", () => {
    for (const f of fs.readdirSync(path.join(process.cwd(), "lib/engine"))) {
      const src = read(f);
      expect(src, f).not.toMatch(/from\s+["'](next|@supabase|@google|@\/lib\/(db|ai|monitoring))/);
    }
  });

  it("baseline is not imported by app code", () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      );
    for (const f of walk(path.join(process.cwd(), "app"))) {
      expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/engine\/baseline/);
    }
  });
});
