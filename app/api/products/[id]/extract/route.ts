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

  let deps: ReturnType<typeof serverExtractDeps>;
  try {
    deps = serverExtractDeps();
  } catch {
    return jsonError(503, "The AI settings on the server are invalid");
  }
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
  try {
    await repo.insertExtractionEvents(result.events);
  } catch {
    // reported below
  }
  log({ stage: "admin-extract", productId: id, events: result.events.map((e) => e.status) });
  if (result.missingProducts.length) return jsonError(404, "Product not found");
  return Response.json({ facts: result.facts.get(id) ?? null, events: result.events });
}
