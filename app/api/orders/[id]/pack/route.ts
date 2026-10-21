import { connection } from "next/server";
import { z } from "zod";
import { serverExtractDeps } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { jsonError, log, readJson, repoOrError } from "@/lib/http";
import { makeStoreOrderFetcher, storeIntegrationConfig } from "@/lib/integrations/store";
import { runPack } from "@/lib/pipeline/pack";
import { packLimiter, rateLimitOrNull } from "@/lib/rate-limit";

// Uncached orders call Gemini (bounded concurrency + per-call timeout). Keep within the Vercel plan limit.
export const maxDuration = 60;

const BodySchema = z.object({ simulateOutage: z.boolean().optional() }).strict();

export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/pack">) {
  await connection();
  const limited = rateLimitOrNull(packLimiter, request);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!/^\d{1,10}$/.test(id)) return jsonError(400, "Order number must be digits only");

  const body = BodySchema.safeParse(await readJson(request));
  if (!body.success) return jsonError(400, "Invalid request body");

  const repo = repoOrError();
  if (repo instanceof Response) return repo;

  const env = appEnv();
  // Fault injection is a demo control: ignored unless DEMO_MODE=true.
  const simulateOutage = env.DEMO_MODE && body.data.simulateOutage === true;
  const runId = crypto.randomUUID();
  const storeCfg = storeIntegrationConfig();

  const result = await runPack({
    repo,
    orderId: id,
    runId,
    deps: serverExtractDeps({ simulateOutage }),
    engineVersion: env.ENGINE_VERSION,
    promptVersion: env.PROMPT_VERSION,
    webhookUrl: env.ALERT_WEBHOOK_URL,
    // Connected store (read-only). Off unless STORE_API_URL and STORE_API_KEY are set.
    externalOrders: storeCfg ? makeStoreOrderFetcher(storeCfg) : undefined,
  });

  log({ runId, stage: "pack", orderId: id, status: result.status, ...result.timings, cache: result.cache, saved: result.monitoring.saved });

  const status = result.status === "not_found" ? 404 : result.status === "error" ? 500 : 200;
  return Response.json(result, { status });
}
