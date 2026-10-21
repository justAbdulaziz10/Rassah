import { describe, expect, it, vi } from "vitest";
import { extractFacts, GenerateError, type ExtractDeps, type GenerateFn } from "@/lib/ai/extractor";
import { RESPONSES } from "../fixtures/gemini/responses";

const product = { id: "p-01", name: "عطر", description: "عطر 100 مل" };

function ok(body: unknown, tokens = { in: 400, out: 120, think: 0 }): GenerateFn {
  return async () => ({
    text: typeof body === "string" ? body : JSON.stringify(body),
    inputTokens: tokens.in,
    outputTokens: tokens.out,
    thinkingTokens: tokens.think,
    blocked: false,
  });
}

function deps(generate: GenerateFn, extra: Partial<ExtractDeps> = {}): ExtractDeps {
  let t = 0;
  return {
    generate,
    model: "test-model",
    promptVersion: "v1",
    priceInputPerM: 1,
    priceOutputPerM: 4,
    sleep: async () => {},
    now: () => (t += 10),
    random: () => 0,
    ...extra,
  };
}

describe("extractFacts: parsing", () => {
  it("parses an explicit-dimension response", async () => {
    const r = await extractFacts(product, deps(ok(RESPONSES.explicitPerfume)));
    expect(r.event.status).toBe("ok");
    expect(r.facts).toMatchObject({ lengthCm: 7, widthCm: 7, heightCm: 16, weightG: 420, dimsSource: "page", fragile: true, liquid: true });
    expect(r.event).toMatchObject({ dimsSource: "page", confidence: "high", fragile: true, liquid: true });
  });

  it("keeps inferred values as inferred", async () => {
    const r = await extractFacts(product, deps(ok(RESPONSES.inferredPerfume)));
    expect(r.facts).toMatchObject({ dimsSource: "inferred", weightSource: "inferred", heightCm: 12 });
  });

  it("returns unknown (null values) when the page has no information", async () => {
    const r = await extractFacts(product, deps(ok(RESPONSES.noInfo)));
    expect(r.event.status).toBe("ok");
    expect(r.facts).toMatchObject({ lengthCm: null, weightG: null, dimsSource: "unknown", weightSource: "unknown" });
  });

  it("malformed JSON → parse_error and no facts", async () => {
    const r = await extractFacts(product, deps(ok("{not json")));
    expect(r.facts).toBeNull();
    expect(r.event).toMatchObject({ status: "parse_error", errorCode: "invalid_json" });
  });

  it("valid JSON with the wrong shape → parse_error (schema_mismatch)", async () => {
    const r = await extractFacts(product, deps(ok({ lengthCm: "seven" })));
    expect(r.facts).toBeNull();
    expect(r.event).toMatchObject({ status: "parse_error", errorCode: "schema_mismatch" });
  });

  it("empty and blocked responses are recorded, not crashed on", async () => {
    const empty = await extractFacts(product, deps(ok("")));
    expect(empty.event.status).toBe("empty");
    const blocked = await extractFacts(
      product,
      deps(async () => ({ text: undefined, inputTokens: 10, outputTokens: 0, thinkingTokens: 0, blocked: true })),
    );
    expect(blocked.event.status).toBe("blocked");
    expect(blocked.facts).toBeNull();
  });
});

describe("extractFacts: sanity rules", () => {
  it("out-of-range values become unknown", async () => {
    const r = await extractFacts(product, deps(ok(RESPONSES.outOfRange)));
    expect(r.facts).toMatchObject({ lengthCm: null, widthCm: null, heightCm: null, dimsSource: "unknown", weightG: null, weightSource: "unknown" });
  });

  it("'page' with low confidence is downgraded to 'inferred'", async () => {
    const r = await extractFacts(product, deps(ok(RESPONSES.pageButLowConfidence)));
    expect(r.facts).toMatchObject({ dimsSource: "inferred", weightSource: "inferred" });
  });

  it("an 'unknown' source never carries a value", async () => {
    const r = await extractFacts(product, deps(ok(RESPONSES.unknownWithValue)));
    expect(r.facts).toMatchObject({ lengthCm: null, weightG: null });
  });
});

describe("extractFacts: reliability", () => {
  it("retries a rate limit and then succeeds", async () => {
    const generate = vi
      .fn<GenerateFn>()
      .mockRejectedValueOnce(new GenerateError("429", "rate_limited", "http_429", true))
      .mockImplementation(ok(RESPONSES.explicitPerfume));
    const sleep = vi.fn(async () => {});
    const r = await extractFacts(product, deps(generate, { sleep }));
    expect(r.event.status).toBe("ok");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("gives up after 3 rate-limited attempts with status rate_limited", async () => {
    const generate = vi.fn<GenerateFn>().mockRejectedValue(new GenerateError("429", "rate_limited", "http_429", true));
    const r = await extractFacts(product, deps(generate));
    expect(generate).toHaveBeenCalledTimes(3);
    expect(r.event).toMatchObject({ status: "rate_limited", errorCode: "http_429" });
    expect(r.facts).toBeNull();
  });

  it("does not retry non-retryable errors (bad key)", async () => {
    const generate = vi.fn<GenerateFn>().mockRejectedValue(new GenerateError("bad key", "config_error", "http_401", false));
    const r = await extractFacts(product, deps(generate));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(r.event.status).toBe("config_error");
  });

  it("times out a hanging call", async () => {
    const hang: GenerateFn = ({ signal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const r = await extractFacts(product, deps(hang, { timeoutMs: 5 }));
    expect(r.event.status).toBe("timeout");
  });

  it("a shared deadline shortens the call and stops retries that would not fit", async () => {
    const limited = vi.fn<GenerateFn>().mockRejectedValue(new GenerateError("429", "rate_limited", "http_429", true));
    // The fake clock advances 10 ms per read: 500 ms left is less than the 1 s backoff, so no retry.
    const r = await extractFacts(product, deps(limited, { deadlineAt: 500 }));
    expect(limited).toHaveBeenCalledTimes(1);
    expect(r.event.status).toBe("rate_limited");

    const hang: GenerateFn = ({ signal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const started = performance.now();
    const slow = await extractFacts(product, deps(hang, { now: () => performance.now(), deadlineAt: started + 30 }));
    expect(slow.event.status).toBe("timeout");
    expect(performance.now() - started).toBeLessThan(1000); // not the 20 s per-call default
  });

  it("makes no call once the deadline has passed", async () => {
    const generate = vi.fn<GenerateFn>();
    const r = await extractFacts(product, deps(generate, { deadlineAt: 0 }));
    expect(generate).not.toHaveBeenCalled();
    expect(r.event).toMatchObject({ status: "timeout", errorCode: "timeout" });
  });

  it("simulated outage fails before any network call", async () => {
    const generate = vi.fn<GenerateFn>();
    const r = await extractFacts(product, deps(generate, { simulateOutage: true }));
    expect(generate).not.toHaveBeenCalled();
    expect(r.event).toMatchObject({ status: "simulated_outage", errorCode: "simulated_outage" });
  });
});

describe("extractFacts: cost", () => {
  it("prices input and output (+thinking) tokens", async () => {
    const r = await extractFacts(product, deps(ok(RESPONSES.explicitPerfume, { in: 1_000_000, out: 200_000, think: 50_000 })));
    // 1M input × $1/M + (200k + 50k) output × $4/M = 1 + 1 = 2
    expect(r.event.costUsd).toBeCloseTo(2, 6);
    expect(r.event).toMatchObject({ inputTokens: 1_000_000, outputTokens: 200_000, thinkingTokens: 50_000 });
  });
});
