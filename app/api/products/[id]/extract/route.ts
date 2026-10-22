import { connection } from "next/server";
import { getOrExtractFacts, serverExtractDeps } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { jsonError, log, repoOrError } from "@/lib/http";
import { isProductId } from "@/lib/ids";
import { extractLimiter, rateLimitOrNull } from "@/lib/rate-limit";

export const maxDuration = 60;

/** Demo/admin control: force re-extraction of one product (never overwrites manual facts). */
export async function POST(request: Request, ctx: RouteContext<"/api/products/[id]/extract">) {
  await connection();
  if (!appEnv().DEMO_MODE) return jsonError(404, "Not available");
  const limited = rateLimitOrNull(extractLimiter, request);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isProductId(id)) return jsonError(400, "Invalid product id");
  const repo = repoOrError();
  if (repo instanceof Response) return repo;

  const deps = serverExtractDeps();
  let result: Awaited<ReturnType<typeof getOrExtractFacts>>;
  try {
    result = await getOrExtractFacts({
      repo,
      productIds: [id],
      deps,
      trigger: "admin",
      runId: null,
      force: true,
      concurrency: 1,
    });
  } catch {
    return jsonError(503, "Could not read the product from the database");
  }
  // The read itself is the answer; a monitoring write that failed is reported, not hidden.
  let saved = true;
  try {
    await repo.insertExtractionEvents(result.events);
  } catch {
    saved = false;
  }
  const monitoring = { saved, degraded: result.degraded };
  log({ stage: "admin-extract", productId: id, events: result.events.map((e) => e.status), ...monitoring });
  if (result.missingProducts.length) return jsonError(404, "Product not found");
  const failed = result.events.find((e) => e.status !== "ok");
  if (failed) {
    // A missing or invalid Gemini setting is a service problem (503); any other failed read is upstream (502).
    const status = failed.status === "config_error" ? 503 : 502;
    return jsonError(status, `Could not read the product page (${failed.status})`, { events: result.events, monitoring });
  }
  return Response.json({ facts: result.facts.get(id) ?? null, events: result.events, monitoring });
}
