import "server-only";
// The real Gemini call, adapted to the GenerateFn interface used by the extractor.
// Server-only: imported by route handlers (via lib/ai/catalog) and by scripts. Scripts run under
// `tsx --conditions=react-server`, which resolves `server-only` to its no-op build.

import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { GenerateError, type GenerateFn } from "./extractor";
import { GEMINI_RESPONSE_SCHEMA } from "./schema";

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export function makeGeminiGenerate(cfg: GeminiConfig): GenerateFn {
  // SDK-level retries are disabled: the extractor owns retries so every attempt is visible in events.
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey, httpOptions: { retryOptions: { attempts: 1 } } });

  return async ({ system, user, signal }) => {
    try {
      const res = await ai.models.generateContent({
        model: cfg.model,
        contents: user,
        config: {
          systemInstruction: system,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          abortSignal: signal,
        },
      });
      const usage = res.usageMetadata;
      const blocked =
        Boolean(res.promptFeedback?.blockReason) ||
        res.candidates?.[0]?.finishReason === FinishReason.SAFETY ||
        res.candidates?.[0]?.finishReason === FinishReason.PROHIBITED_CONTENT;
      return {
        text: res.text,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        thinkingTokens: usage?.thoughtsTokenCount ?? 0,
        blocked,
      };
    } catch (err) {
      if (signal.aborted) throw err; // the extractor reports this as a timeout
      if (err instanceof ApiError) {
        if (err.status === 429) throw new GenerateError(err.message, "rate_limited", "http_429", true);
        if (err.status === 500 || err.status === 502 || err.status === 503 || err.status === 504) {
          throw new GenerateError(err.message, "api_error", `http_${err.status}`, true);
        }
        // Gemini answers an invalid key with 400 INVALID_ARGUMENT ("API key not valid"), not 401.
        if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(err.message))) {
          throw new GenerateError("Gemini rejected the API key", "config_error", `http_${err.status}`, false);
        }
        throw new GenerateError(err.message, "api_error", `http_${err.status}`, false);
      }
      throw new GenerateError((err as Error)?.message ?? "network error", "api_error", "network", true);
    }
  };
}
