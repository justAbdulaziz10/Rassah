// One field list → both the Zod validator and the Gemini response schema, so they can't drift apart.

import { Type, type Schema } from "@google/genai";
import { z } from "zod";

const SOURCES = ["page", "inferred", "unknown"] as const;
const CONFIDENCES = ["high", "medium", "low"] as const;

/** What the model must return for one product. Dimensions are outer packaging, natural upright orientation. */
export const ModelFactsSchema = z.object({
  lengthCm: z.number().nullable(),
  widthCm: z.number().nullable(),
  heightCm: z.number().nullable(),
  weightG: z.number().nullable(),
  dimsSource: z.enum(SOURCES),
  weightSource: z.enum(SOURCES),
  fragile: z.boolean(),
  liquid: z.boolean(),
  sensitive: z.boolean(),
  confidence: z.enum(CONFIDENCES),
  evidence: z.string(),
});
export type ModelFacts = z.infer<typeof ModelFactsSchema>;

const nullableNumber = (description: string): Schema => ({ type: Type.NUMBER, nullable: true, description });

export const GEMINI_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    lengthCm: nullableNumber("Outer packaging length in cm, or null if unknown"),
    widthCm: nullableNumber("Outer packaging width in cm, or null if unknown"),
    heightCm: nullableNumber("Outer packaging height in cm (vertical side when the product stands as sold), or null"),
    weightG: nullableNumber("Shipping weight in grams, or null if unknown"),
    dimsSource: { type: Type.STRING, enum: [...SOURCES], description: "Where the dimensions came from" },
    weightSource: { type: Type.STRING, enum: [...SOURCES], description: "Where the weight came from" },
    fragile: { type: Type.BOOLEAN, description: "Glass, crystal, ceramic, porcelain, mirror, screen, or unsure if glass" },
    liquid: { type: Type.BOOLEAN, description: "Liquid, gel or cream in a container that can leak" },
    sensitive: { type: Type.BOOLEAN, description: "Electronics or batteries that need extra padding" },
    confidence: { type: Type.STRING, enum: [...CONFIDENCES] },
    evidence: { type: Type.STRING, description: "Shortest phrase used, or what the estimate was inferred from" },
  },
  required: [
    "lengthCm", "widthCm", "heightCm", "weightG", "dimsSource", "weightSource",
    "fragile", "liquid", "sensitive", "confidence", "evidence",
  ],
  propertyOrdering: [
    "evidence", "dimsSource", "lengthCm", "widthCm", "heightCm", "weightSource", "weightG",
    "fragile", "liquid", "sensitive", "confidence",
  ],
};
