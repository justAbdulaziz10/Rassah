import { connection } from "next/server";
import { appEnv } from "@/lib/env";
import { jsonError, repoOrError } from "@/lib/http";
import { loadDashboard } from "@/lib/monitoring/dashboard";
import { WINDOWS, type MetricWindow } from "@/lib/monitoring/metrics";

export async function GET(request: Request) {
  await connection();
  const window = (new URL(request.url).searchParams.get("window") ?? "24h") as MetricWindow;
  if (!WINDOWS.includes(window)) return jsonError(400, "window must be one of 1h, 24h, 7d, all");
  const repo = repoOrError();
  if (repo instanceof Response) return repo;
  return Response.json(await loadDashboard(repo, window, Date.now(), appEnv().ALERT_WEBHOOK_URL));
}
