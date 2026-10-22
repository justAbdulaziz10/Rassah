import "server-only";
import { geminiEnv, hasGeminiKey } from "@/lib/env";
import { GenerateError, type ExtractDeps } from "./extractor";
import { makeGeminiGenerate } from "./gemini";
import { PROMPT_VERSION } from "./prompt";

export type { ExtractDeps } from "./extractor";
export { getOrExtractFacts } from "./catalog";

/**
 * Extraction dependencies for request-time use. When the Gemini key is missing or a Gemini setting
 * is invalid, extraction fails with a recorded `config_error` event instead of failing the request,
 * so orders whose products are already known still pack.
 */
export function serverExtractDeps(opts: { simulateOutage?: boolean } = {}): ExtractDeps {
  const unavailable = (message: string, code: string): ExtractDeps => ({
    model: process.env.GEMINI_MODEL?.trim() || "unset",
    promptVersion: PROMPT_VERSION,
    priceInputPerM: 0,
    priceOutputPerM: 0,
    simulateOutage: opts.simulateOutage,
    maxAttempts: 1,
    generate: async () => {
      throw new GenerateError(message, "config_error", code, false);
    },
  });
  if (!hasGeminiKey()) return unavailable("GEMINI_API_KEY is not configured", "missing_key");
  let env: ReturnType<typeof geminiEnv>;
  try {
    env = geminiEnv();
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : "Invalid Gemini settings", "invalid_config");
  }
  return {
    generate: makeGeminiGenerate({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }),
    model: env.GEMINI_MODEL,
    promptVersion: PROMPT_VERSION,
    priceInputPerM: env.GEMINI_PRICE_INPUT_PER_M,
    priceOutputPerM: env.GEMINI_PRICE_OUTPUT_PER_M,
    simulateOutage: opts.simulateOutage,
  };
}
