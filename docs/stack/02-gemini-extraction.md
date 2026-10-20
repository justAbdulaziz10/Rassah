# Stack 02: Gemini AI Extraction

**Owner:** M1. **Reviewer:** M3.

## Role in the product

Gemini is the **AI core**. For each product it turns free-form page text into structured, labeled facts:

| Field | Type | Notes |
|---|---|---|
| `lengthCm`, `widthCm`, `heightCm` | number \| null | **Outer packaging** dimensions, not the bare product |
| `weightG` | number \| null | Shipping weight including packaging when stated |
| `dimsSource`, `weightSource` | `"page"` \| `"inferred"` \| `"unknown"` | Where each value came from |
| `fragile` | boolean | glass, crystal, ceramic, porcelain, mirrors, screens… |
| `liquid` | boolean | perfume, oil, honey, serums… (must stay upright) |
| `sensitive` | boolean | electronics, batteries, items needing extra padding |
| `confidence` | `"high"` \| `"medium"` \| `"low"` | Model's self-assessment, checked by the eval |
| `evidence` | string (short) | The phrase that justified the values, e.g. `"المقاس 30×20×10 سم"` or `"inferred from 100 مل"` |

Why an LLM: the same fact appears as "٣٠×٢٠×١٠ سم", "Dimensions: 12 × 8 × 4 in, 1.5 lbs", "الطول ٣٠ - العرض ٢٠", or only "عطر 100 مل". Arabic-Indic digits, inches/pounds, missing units and implicit fragility ("كريستال") defeat regex rules.

## SDK

Use Google's current official JavaScript SDK, **`@google/genai`**. The older `@google/generative-ai` package is legacy. Don't use it.

```ts
// lib/ai/client.ts
import "server-only";
import { GoogleGenAI } from "@google/genai";

export const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
export const MODEL = process.env.GEMINI_MODEL!; // choose a current Flash-tier id in AI Studio
```

> **Implemented and verified against `@google/genai` 2.30.0 typings** (`node_modules/@google/genai/dist/genai.d.ts`): `config.systemInstruction`, `temperature`, `responseMimeType: "application/json"`, `responseSchema` (built with the `Type` enum and `nullable`), `abortSignal`. The response gives `res.text`, `res.usageMetadata.{promptTokenCount, candidatesTokenCount, thoughtsTokenCount}`, `res.promptFeedback.blockReason` and `candidates[0].finishReason`. Errors are `ApiError` with `.status`.
> SDK retries are disabled (`httpOptions.retryOptions.attempts = 1`) so the extractor owns retries and every attempt is visible in events.
> A probe with a fake key confirmed the request shape: Google rejected only the key. Gemini answers an invalid key with **400** "API key not valid" (not 401), which we map to `config_error`.
>
> Code: `lib/ai/schema.ts` (Zod + Gemini schema from one field list), `lib/ai/prompt.ts` (`PROMPT_VERSION`), `lib/ai/extractor.ts` (injectable `generate`, retries, timeout, sanitize, cost), `lib/ai/gemini.ts` (real call + error mapping), `lib/ai/catalog.ts` (cache + bounded concurrency), `lib/ai/index.ts` (`serverExtractDeps()`). The sketch below shows the original intent.

```ts
// lib/ai/extractor.ts (sketch)
const res = await genai.models.generateContent({
  model: MODEL,
  contents: buildPrompt(product),          // system rules + product name + page text
  config: {
    temperature: 0,
    responseMimeType: "application/json",
    responseSchema: PRODUCT_FACTS_SCHEMA,  // see below
  },
});
const raw = res.text;                      // JSON string
const usage = res.usageMetadata;           // promptTokenCount, candidatesTokenCount, (thoughtsTokenCount)
const parsed = ProductFactsZod.safeParse(JSON.parse(raw ?? "null"));
```

**Always validate with Zod** even when a schema is sent. If validation fails, record `status = "parse_error"`, never pass partial data to the engine, and treat the product as `unknown`.

## Prompt (v1)

Stored in `lib/ai/prompt.ts` as a constant with `PROMPT_VERSION = "v1"`. Every change bumps the version, and every event stores it.

Key rules to include (write the prompt in English. Product text stays in its original language):

1. You extract shipping facts for a packing system. Wrong numbers cause broken or unshippable orders.
2. Return **outer packaging** dimensions in cm and weight in grams. Convert inches (×2.54), pounds (×453.6), kg, and Arabic-Indic digits.
3. If a value is **written** on the page, use it and set source `"page"`.
4. If it is **not written** but can be reasonably inferred from other facts on the page (volume in ml, page count, size label, a well-known product type), estimate it, set source `"inferred"`, and confidence at most `"medium"`.
5. If there is no basis, return `null` with source `"unknown"`. **Never invent a number to fill the field.**
6. `fragile = true` for glass, crystal, ceramic, porcelain, mirrors, screens, or when unsure whether the container is glass. *(Missing a fragile item is worse than over-padding.)*
7. `liquid = true` for any liquid, gel or cream in a container that can leak.
8. `evidence`: quote the shortest phrase you used, or say what you inferred from.
9. Return dimensions in the product's **natural upright orientation**: `heightCm` is the vertical side when the product stands as sold (a perfume box 6 × 6 × 15 has `heightCm = 15`). The engine sorts the other sides itself, but it needs the true height so liquids stay upright.

## Response schema

Define it once in Zod (`lib/ai/schema.ts`) and derive the Gemini schema object from the same field list so they can't drift apart. Enums: `source ∈ {page, inferred, unknown}`, `confidence ∈ {high, medium, low}`. Numbers are nullable.

Post-validation sanity checks (in code, after Zod):
- Any dimension ≤ 0 or > 150 cm → reject that value, set it to `unknown`.
- Weight ≤ 0 or > 30,000 g → set to `unknown`.
- `source = "page"` with `confidence = "low"` → downgrade source to `inferred` (inconsistent output).

## Fallback chain (F3)

```
page value ──► inferred estimate ──► manual measurement by packer
 (source=page)   (source=inferred)     (source=manual, origin=manual)
```

- `inferred` values get the safety margin in the engine (Stack 03).
- Any `unknown` dimension or weight → the order returns `needs_measurement`. The packer measures once, and the value is stored forever.
- Manufacturer-spec web lookup is **out of scope** for the MVP (roadmap item).

## Catalog cache (F4)

- `product_facts` is keyed by `product_id`. Extraction runs only on a cache miss, or when an admin forces a re-extract.
- Also store a hash of the product text: `source_hash = sha256(name + description)`. If the page text changes, the cached facts are stale and get re-extracted.
- Manual or corrected facts (`origin != "ai"`) are **never** overwritten by re-extraction.

## Reliability

| Concern | Handling |
|---|---|
| Rate limits (free tier) | Max **2** concurrent Gemini calls per request. On HTTP 429/503, retry up to 2 times with exponential backoff (1 s, 3 s) plus jitter. |
| Timeouts | Abort a single extraction after ~20 s and record `status = "timeout"`. |
| Missing key | `status = "config_error"`. The health endpoint reports it. |
| Safety block / empty response | `status = "blocked"` or `"empty"`. Treated as `unknown`. |
| Demo fault injection | If `DEMO_MODE=true` and the request asks for it, throw before calling Gemini with `error_code = "simulated_outage"` (Stack 06). |

Every attempt writes **one** `extraction_events` row: status, latency, tokens (input/output/thinking), computed USD cost, model, prompt version, source, confidence, error code. Details in Stack 06.

## Cost estimate

`cost_usd = input_tokens × PRICE_INPUT / 1e6 + (output_tokens + thinking_tokens) × PRICE_OUTPUT / 1e6`. Prices come from env vars. Copy them from Google's official Gemini pricing page on the day you set them up, and record the date in the report. Because of the cache, the cost per *order* drops toward zero for repeat products. The dashboard shows both.

## Testing (no network)

- Unit-test `buildPrompt`, Zod parsing, unit/digit sanity checks, and the fallback logic with **recorded fixture responses** (JSON files in `tests/fixtures/gemini/`).
- Inject the Gemini call as a function parameter (`extractFacts(product, { generate })`) so tests pass a fake.
- The real model is exercised only by `scripts/eval-extraction.ts` (Stack 07).

## Getting a key (Phase 0, T2)

1. Google AI Studio → *Get API key* → create the key in a new project.
2. Put it in `.env.local` (local) and in Vercel project env vars (Preview + Production).
3. Note the free-tier limits shown in AI Studio for the chosen model. They decide the concurrency limit above.
