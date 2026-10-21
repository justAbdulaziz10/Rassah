import { connection } from "next/server";
import { isUuid, jsonError, log, repoOrError } from "@/lib/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[runId]/trace">) {
  await connection();
  const { runId } = await ctx.params;
  if (!isUuid(runId)) return jsonError(400, "Invalid run id");
  const repo = repoOrError();
  if (repo instanceof Response) return repo;
  try {
    const trace = await repo.getRunTrace(runId);
    if (!trace.run) return jsonError(404, "Run not found");
    // Product names, so the details read "عطر 50 مل" instead of "p-16".
    const ids = [...new Set([...trace.run.aiProducts, ...trace.extractions.map((e) => e.productId), ...trace.corrections.map((c) => c.productId)])];
    const names = Object.fromEntries((await repo.getProducts(ids)).map((p) => [p.id, p.name]));
    return Response.json({ ...trace, names });
  } catch (e) {
    log({ runId, stage: "trace", error: (e as Error).message });
    return jsonError(500, "Could not load the trace");
  }
}
