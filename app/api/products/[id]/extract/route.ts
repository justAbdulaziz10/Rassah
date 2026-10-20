import { connection } from "next/server";
import { getOrExtractFacts, serverExtractDeps } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { jsonError, log, repoOrError } from "@/lib/http";

export const maxDuration = 60;

/** Demo/admin control: force re-extraction of one product (never overwrites manual facts). */
export async function POST(_request: Request, ctx: RouteContext<"/api/products/[id]/extract">) {
  await connection();
  if (!appEnv().DEMO_MODE) return jsonError(404, "Not available");
  const { id } = await ctx.params;
  if (!/^p-\d{2,4}$/.test(id)) return jsonError(400, "Invalid product id");
  const repo = repoOrError();
  if (repo instanceof Response) return repo;

  const result = await getOrExtractFacts({
    repo,
    productIds: [id],
    deps: serverExtractDeps(),
    trigger: "admin",
    runId: null,
    force: true,
    concurrency: 1,
  });
  try {
    await repo.insertExtractionEvents(result.events);
  } catch {
    // reported below
  }
  log({ stage: "admin-extract", productId: id, events: result.events.map((e) => e.status) });
  if (result.missingProducts.length) return jsonError(404, "Product not found");
  return Response.json({ facts: result.facts.get(id) ?? null, events: result.events });
}
