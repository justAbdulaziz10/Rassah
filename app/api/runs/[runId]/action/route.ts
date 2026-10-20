import { connection } from "next/server";
import { jsonError, log, readJson, repoOrError } from "@/lib/http";
import { applyRunAction, FactsError, RunActionSchema } from "@/lib/pipeline/facts";
import { refreshAlerts } from "@/lib/pipeline/pack";
import { appEnv } from "@/lib/env";

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request, ctx: RouteContext<"/api/runs/[runId]/action">) {
  await connection();
  const { runId } = await ctx.params;
  if (!UUID.test(runId)) return jsonError(400, "Invalid run id");

  const parsed = RunActionSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "Invalid action", { issues: parsed.error.issues.map((i) => i.message) });

  const repo = repoOrError();
  if (repo instanceof Response) return repo;

  try {
    const result = await applyRunAction(repo, runId, parsed.data);
    log({ runId, stage: "action", action: result.action, corrections: result.corrections.length });
    await refreshAlerts(repo, Date.now(), appEnv().ALERT_WEBHOOK_URL).catch(() => {});
    return Response.json(result);
  } catch (e) {
    if (e instanceof FactsError) return jsonError(e.httpStatus, e.message);
    return jsonError(500, "Could not save the action");
  }
}
