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
    return Response.json(trace);
  } catch (e) {
    log({ runId, stage: "trace", error: (e as Error).message });
    return jsonError(500, "Could not load the trace");
  }
}
