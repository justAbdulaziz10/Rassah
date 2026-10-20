import "server-only";
import { geminiEnv, hasGeminiKey } from "@/lib/env";
import { GenerateError, type ExtractDeps } from "./extractor";
import { makeGeminiGenerate } from "./gemini";
import { PROMPT_VERSION } from "./prompt";

export { extractFacts, GenerateError, sanitize } from "./extractor";
export type { ExtractDeps, ExtractOutcome, ExtractedFacts, GenerateFn } from "./extractor";
export { getOrExtractFacts } from "./catalog";
export { PROMPT_VERSION } from "./prompt";

/**
 * Extraction dependencies for request-time use. When the Gemini key is missing, extraction
 * fails with a recorded `config_error` event instead of crashing the request.
 */
export function serverExtractDeps(opts: { simulateOutage?: boolean } = {}): ExtractDeps {
  if (!hasGeminiKey()) {
    return {
      model: process.env.GEMINI_MODEL ?? "unset",
      promptVersion: PROMPT_VERSION,
      priceInputPerM: 0,
      priceOutputPerM: 0,
      simulateOutage: opts.simulateOutage,
      maxAttempts: 1,
      generate: async () => {
        throw new GenerateError("GEMINI_API_KEY is not configured", "config_error", "missing_key", false);
      },
    };
  }
  const env = geminiEnv();
  return {
    generate: makeGeminiGenerate({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }),
    model: env.GEMINI_MODEL,
    promptVersion: PROMPT_VERSION,
    priceInputPerM: env.GEMINI_PRICE_INPUT_PER_M,
    priceOutputPerM: env.GEMINI_PRICE_OUTPUT_PER_M,
    simulateOutage: opts.simulateOutage,
  };
}
