// Core extraction logic. The network call is injected (`generate`), so this file is fully
// unit-testable with recorded responses. lib/ai/gemini.ts provides the real Gemini call.

import type { ExtractionEvent, ExtractionStatus } from "@/lib/db/types";
import type { ProductFacts } from "@/lib/engine/types";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { ModelFactsSchema, type ModelFacts } from "./schema";

export interface GenerateRequest {
  system: string;
  user: string;
  signal: AbortSignal;
}

export interface GenerateResponse {
  text: string | undefined;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  blocked: boolean;
}

export type GenerateFn = (req: GenerateRequest) => Promise<GenerateResponse>;

/** Error thrown by a GenerateFn. `retryable` marks rate limits and transient server errors. */
export class GenerateError extends Error {
  constructor(
    message: string,
    readonly status: ExtractionStatus,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GenerateError";
  }
}

export interface ExtractDeps {
  generate: GenerateFn;
  model: string;
  promptVersion: string;
  priceInputPerM: number;
  priceOutputPerM: number;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Demo fault injection: fail before any network call. */
  simulateOutage?: boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export interface ExtractedFacts extends ProductFacts {
  evidence: string;
}

export type ExtractionEventBody = Omit<ExtractionEvent, "runId" | "trigger">;

export interface ExtractOutcome {
  /** null when the call failed; the product is then treated as unknown. */
  facts: ExtractedFacts | null;
  event: ExtractionEventBody;
}

const MAX_DIM_CM = 150;
const MAX_WEIGHT_G = 30_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Post-validation rules applied after Zod (see docs/stack/02):
 * - out-of-range values become unknown
 * - a source of page/inferred with a missing value becomes unknown
 * - a source of unknown never carries a value (honesty)
 * - "page" with "low" confidence is inconsistent, so it is downgraded to "inferred"
 */
export function sanitize(productId: string, m: ModelFacts): ExtractedFacts {
  let dims = [m.lengthCm, m.widthCm, m.heightCm];
  let dimsSource = m.dimsSource;
  if (dims.some((d) => d === null || !(d > 0) || d > MAX_DIM_CM)) {
    dims = [null, null, null];
    dimsSource = "unknown";
  }
  if (dimsSource === "unknown") dims = [null, null, null];

  let weightG = m.weightG;
  let weightSource = m.weightSource;
  if (weightG === null || !(weightG > 0) || weightG > MAX_WEIGHT_G) {
    weightG = null;
    weightSource = "unknown";
  }
  if (weightSource === "unknown") weightG = null;

  if (m.confidence === "low") {
    if (dimsSource === "page") dimsSource = "inferred";
    if (weightSource === "page") weightSource = "inferred";
  }

  return {
    productId,
    lengthCm: dims[0] === null ? null : round2(dims[0]),
    widthCm: dims[1] === null ? null : round2(dims[1]),
    heightCm: dims[2] === null ? null : round2(dims[2]),
    weightG: weightG === null ? null : round2(weightG),
    dimsSource,
    weightSource,
    fragile: m.fragile,
    liquid: m.liquid,
    sensitive: m.sensitive,
    confidence: m.confidence,
    evidence: m.evidence.slice(0, 300),
  };
}

function baseEvent(productId: string, deps: ExtractDeps): ExtractionEventBody {
  return {
    productId,
    status: "ok",
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    costUsd: 0,
    model: deps.model,
    promptVersion: deps.promptVersion,
    dimsSource: null,
    weightSource: null,
    confidence: null,
    fragile: null,
    liquid: null,
    errorCode: null,
    errorMessage: null,
  };
}

export async function extractFacts(
  product: { id: string; name: string; description: string },
  deps: ExtractDeps,
): Promise<ExtractOutcome> {
  const now = deps.now ?? (() => performance.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;
  const maxAttempts = deps.maxAttempts ?? 3;
  const timeoutMs = deps.timeoutMs ?? 20_000;
  const event = baseEvent(product.id, deps);
  const start = now();

  if (deps.simulateOutage) {
    event.status = "simulated_outage";
    event.errorCode = "simulated_outage";
    event.errorMessage = "Demo fault injection: Gemini call skipped";
    return { facts: null, event };
  }

  let response: GenerateResponse | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await deps.generate({ system: SYSTEM_PROMPT, user: buildUserPrompt(product), signal: controller.signal });
      break;
    } catch (err) {
      const aborted = controller.signal.aborted;
      const ge = err instanceof GenerateError ? err : null;
      if (!aborted && ge?.retryable && attempt < maxAttempts) {
        // Exponential backoff with jitter: ~1 s, then ~3 s.
        await sleep((attempt === 1 ? 1000 : 3000) + Math.floor(random() * 300));
        continue;
      }
      event.latencyMs = now() - start;
      if (aborted) {
        event.status = "timeout";
        event.errorCode = "timeout";
        event.errorMessage = `No response within ${timeoutMs} ms`;
      } else if (ge) {
        event.status = ge.status;
        event.errorCode = ge.code;
        event.errorMessage = ge.message.slice(0, 300);
      } else {
        event.status = "api_error";
        event.errorCode = "unexpected";
        event.errorMessage = (err as Error)?.message?.slice(0, 300) ?? "unknown error";
      }
      return { facts: null, event };
    } finally {
      clearTimeout(timer);
    }
  }

  // response is set here: the loop either breaks with a response or returns.
  const res = response!;
  event.latencyMs = now() - start;
  event.inputTokens = res.inputTokens;
  event.outputTokens = res.outputTokens;
  event.thinkingTokens = res.thinkingTokens;
  event.costUsd =
    (res.inputTokens * deps.priceInputPerM) / 1e6 + ((res.outputTokens + res.thinkingTokens) * deps.priceOutputPerM) / 1e6;

  if (res.blocked) {
    event.status = "blocked";
    event.errorCode = "blocked";
    return { facts: null, event };
  }
  if (!res.text || res.text.trim() === "") {
    event.status = "empty";
    event.errorCode = "empty";
    return { facts: null, event };
  }

  let json: unknown;
  try {
    json = JSON.parse(res.text);
  } catch {
    event.status = "parse_error";
    event.errorCode = "invalid_json";
    event.errorMessage = res.text.slice(0, 200);
    return { facts: null, event };
  }
  const parsed = ModelFactsSchema.safeParse(json);
  if (!parsed.success) {
    event.status = "parse_error";
    event.errorCode = "schema_mismatch";
    event.errorMessage = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 300);
    return { facts: null, event };
  }

  const facts = sanitize(product.id, parsed.data);
  event.dimsSource = facts.dimsSource;
  event.weightSource = facts.weightSource;
  event.confidence = facts.confidence;
  event.fragile = facts.fragile;
  event.liquid = facts.liquid;
  return { facts, event };
}
