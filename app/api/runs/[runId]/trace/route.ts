import { connection } from "next/server";
import { jsonError, repoOrError } from "@/lib/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[runId]/trace">) {
  await connection();
  const { runId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return jsonError(400, "Invalid run id");
  const repo = repoOrError();
  if (repo instanceof Response) return repo;
  const trace = await repo.getRunTrace(runId);
  if (!trace.run) return jsonError(404, "Run not found");
  return Response.json(trace);
}
