import { after, connection } from "next/server";
import { z } from "zod";
import { serverExtractDeps } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { jsonError, log, readJson, repoOrError } from "@/lib/http";
import { isOrderId } from "@/lib/ids";
import { makeStoreOrderFetcher, storeIntegrationConfig } from "@/lib/integrations/store";
import { runPack, type PackResponse } from "@/lib/pipeline/pack";
import { packLimiter, rateLimitOrNull } from "@/lib/rate-limit";

// Uncached orders call Gemini (bounded concurrency + per-call timeout). Keep within the Vercel plan limit.
export const maxDuration = 60;

const BodySchema = z.object({ simulateOutage: z.boolean().optional() }).strict();

export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/pack">) {
  await connection();
  const limited = rateLimitOrNull(packLimiter, request);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isOrderId(id)) return jsonError(400, "Order number must be digits only");

  const body = BodySchema.safeParse(await readJson(request));
  if (!body.success) return jsonError(400, "Invalid request body");

  const repo = repoOrError();
  if (repo instanceof Response) return repo;

  const env = appEnv();
  // Fault injection is a demo control: ignored unless DEMO_MODE=true.
  const simulateOutage = env.DEMO_MODE && body.data.simulateOutage === true;
  const runId = crypto.randomUUID();
  const storeCfg = storeIntegrationConfig();
  let deps: ReturnType<typeof serverExtractDeps>;
  try {
    deps = serverExtractDeps({ simulateOutage });
  } catch {
    return jsonError(503, "The AI settings on the server are invalid");
  }

  const result = await runPack({
    repo,
    orderId: id,
    runId,
    deps,
    engineVersion: env.ENGINE_VERSION,
    promptVersion: env.PROMPT_VERSION,
    webhookUrl: env.ALERT_WEBHOOK_URL,
    // Connected store (read-only). Off unless STORE_API_URL and STORE_API_KEY are set.
    externalOrders: storeCfg ? makeStoreOrderFetcher(storeCfg) : undefined,
    // The alert check (several reads, maybe writes) runs after the packer already has the answer.
    defer: after,
  });

  log({ runId, stage: "pack", orderId: id, status: result.status, ...result.timings, cache: result.cache, saved: result.monitoring.saved });

  return Response.json(result, { status: packHttpStatus(result) });
}

/** The body always carries the outcome; the status code tells logs an input or upstream problem from a server fault. */
function packHttpStatus(result: PackResponse): number {
  if (result.status === "not_found") return 404;
  if (result.status !== "error") return 200;
  if (result.errorCode === "product_not_in_catalog" || result.errorCode === "invalid_input") return 422;
  if (result.errorCode === "store_unreachable") return 502;
  return 500;
}
