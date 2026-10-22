import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFacts, sanitize, type GenerateFn } from "@/lib/ai/extractor";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/ai/prompt";
import type { ModelFacts } from "@/lib/ai/schema";

// tests/fixtures/gemini/recorded.json holds REAL Gemini responses (model + date inside each entry),
// recorded once with the production prompt and response schema. No network here.
interface Recorded {
  productId: string;
  name: string;
  description: string;
  model: string;
  promptVersion: string;
  recordedAt: string;
  responseText: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  blocked: boolean;
}
const RECORDED: Recorded[] = JSON.parse(readFileSync(join(__dirname, "../fixtures/gemini/recorded.json"), "utf8"));
const byId = (id: string) => RECORDED.find((r) => r.productId === id)!;

async function run(r: Recorded) {
  const generate: GenerateFn = async () => ({
    text: r.responseText,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    thinkingTokens: r.thinkingTokens,
    blocked: r.blocked,
  });
  return extractFacts(
    { id: r.productId, name: r.name, description: r.description },
    { generate, model: r.model, promptVersion: r.promptVersion, priceInputPerM: 0, priceOutputPerM: 0 },
  );
}

describe("recorded Gemini responses", () => {
  it("has 6+ fixtures with provenance and no secrets", () => {
    expect(RECORDED.length).toBeGreaterThanOrEqual(6);
    for (const r of RECORDED) {
      expect(r.model).toBeTruthy();
      expect(r.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(JSON.stringify(r)).not.toMatch(/AIza|api[_-]?key/i);
    }
  });

  it("every fixture parses through the extractor with status ok", async () => {
    for (const r of RECORDED) expect((await run(r)).event.status).toBe("ok");
  });

  it("page-sourced dims and weight are kept (Latin digits)", async () => {
    const { facts } = await run(byId("p-02"));
    expect(facts).toMatchObject({ dimsSource: "page", weightSource: "page", weightG: 350, confidence: "high" });
  });

  it("estimates are inferred; no basis is unknown with null values", async () => {
    expect((await run(byId("p-16"))).facts).toMatchObject({ dimsSource: "inferred", confidence: "medium", fragile: true, liquid: true });
    expect((await run(byId("p-29"))).facts).toMatchObject({
      dimsSource: "unknown", weightSource: "unknown", lengthCm: null, widthCm: null, heightCm: null, weightG: null,
    });
  });

  it("fragile + liquid flags survive (honey in a glass jar)", async () => {
    expect((await run(byId("p-07"))).facts).toMatchObject({ fragile: true, liquid: true });
  });
});

describe("unit conversion: inches and pounds", () => {
  it("the prompt asks for the conversion factors", () => {
    expect(SYSTEM_PROMPT).toContain("x 2.54");
    expect(SYSTEM_PROMPT).toContain("x 453.6");
  });

  it("p-05 (4 x 4 x 5 in, 1.1 lb) comes back in cm/g", async () => {
    const r = byId("p-05");
    expect(r.description).toMatch(/4 x 4 x 5 in, weight 1\.1 lb/);
    expect(buildUserPrompt(r)).toContain("1.1 lb");
    const { facts } = await run(r);
    expect(facts).toMatchObject({ lengthCm: 10.16, widthCm: 10.16, heightCm: 12.7, dimsSource: "page", weightSource: "page" });
    expect(facts!.weightG).toBeCloseTo(1.1 * 453.6, 1);
  });

  it("p-10 (3.5 x 3.5 x 12 in, 3.3 lb) comes back in cm/g", async () => {
    const r = byId("p-10");
    expect(r.description).toMatch(/3\.5 x 3\.5 x 12 in, 3\.3 lb/);
    const { facts } = await run(r);
    expect(facts).toMatchObject({ lengthCm: 8.89, widthCm: 8.89, heightCm: 30.48 });
    expect(facts!.weightG).toBeCloseTo(3.3 * 453.6, 1);
  });

  it("SYNTHETIC: sanitize rounds float noise from a conversion to 2 decimals", () => {
    const m: ModelFacts = {
      lengthCm: 4 * 2.54, widthCm: 3.5 * 2.54, heightCm: 12 * 2.54, weightG: 1.1 * 453.6,
      dimsSource: "page", weightSource: "page", fragile: false, liquid: false, sensitive: false,
      confidence: "high", evidence: "synthetic",
    };
    expect(sanitize("syn", m)).toMatchObject({ lengthCm: 10.16, widthCm: 8.89, heightCm: 30.48, weightG: 498.96 });
  });

  it("SYNTHETIC: a model that forgot to convert (raw inches/lb) is still accepted in range, but a pound value read as grams is a tiny weight", () => {
    const m: ModelFacts = {
      lengthCm: 4, widthCm: 4, heightCm: 5, weightG: 1.1,
      dimsSource: "page", weightSource: "page", fragile: false, liquid: false, sensitive: false,
      confidence: "high", evidence: "synthetic",
    };
    // Documents current behaviour: range checks cannot catch unconverted units, only the prompt and the eval do.
    expect(sanitize("syn", m).weightG).toBe(1.1);
  });
});

describe("Arabic-Indic digits", () => {
  it("p-03 and p-07 descriptions use Arabic-Indic digits and are read as normal numbers", async () => {
    const p03 = byId("p-03");
    const p07 = byId("p-07");
    expect(p03.description).toMatch(/[٠-٩]/);
    expect(p07.description).toMatch(/[٠-٩]/);
    expect(SYSTEM_PROMPT).toContain("٠١٢٣٤٥٦٧٨٩");
    expect((await run(p03)).facts).toMatchObject({ lengthCm: 18, widthCm: 12, heightCm: 22, weightG: 1200, dimsSource: "page" });
    expect((await run(p07)).facts).toMatchObject({ lengthCm: 9, widthCm: 9, heightCm: 13, weightG: 850, dimsSource: "page" });
  });
});
