import { connection } from "next/server";
import { z } from "zod";
import { appEnv } from "@/lib/env";
import { jsonError, log, readJson, repoOrError } from "@/lib/http";
import { isProductId } from "@/lib/ids";
import { FactChangesSchema, FactsError, updateProductFacts } from "@/lib/pipeline/facts";
import { extractLimiter, rateLimitOrNull } from "@/lib/rate-limit";

const BodySchema = z.object({ changes: FactChangesSchema, runId: z.uuid().nullable().optional() }).strict();

/** Manual measurement or correction by a packer. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/products/[id]/facts">) {
  await connection();
  const { id } = await ctx.params;
  if (!isProductId(id)) return jsonError(400, "Invalid product id");
  const parsed = BodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "Invalid changes", { issues: parsed.error.issues.map((i) => i.message) });

  const repo = repoOrError();
  if (repo instanceof Response) return repo;
  try {
    const result = await updateProductFacts({ repo, productId: id, changes: parsed.data.changes, runId: parsed.data.runId ?? null });
    log({ stage: "facts", productId: id, corrections: result.corrections.length, runId: parsed.data.runId ?? null });
    return Response.json(result);
  } catch (e) {
    if (e instanceof FactsError) return jsonError(e.httpStatus, e.message);
    return jsonError(500, "Could not save the measurement");
  }
}

/** Demo control: clear a product's cached facts so the next order re-extracts it.
 * Shares the extract limiter: every clear leads to a Gemini call on the next order. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/products/[id]/facts">) {
  await connection();
  if (!appEnv().DEMO_MODE) return jsonError(404, "Not available");
  const limited = rateLimitOrNull(extractLimiter, request);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isProductId(id)) return jsonError(400, "Invalid product id");
  const repo = repoOrError();
  if (repo instanceof Response) return repo;
  try {
    await repo.deleteFacts(id);
  } catch {
    return jsonError(503, "Could not clear the product's data");
  }
  log({ stage: "clear-facts", productId: id });
  return Response.json({ cleared: id });
}
