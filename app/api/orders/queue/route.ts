import { connection } from "next/server";
import { jsonError, log, repoOrError } from "@/lib/http";
import { loadQueue } from "@/lib/orders/load";

// Read-only summary for the header badges and the "new order" notice. Polled by the browser.
export async function GET() {
  await connection();
  const repo = repoOrError();
  if (repo instanceof Response) return repo;
  try {
    const { entries, counts, alerts } = await loadQueue(repo);
    return Response.json(
      {
        counts,
        alertsOpen: alerts.length,
        newOrderIds: entries.filter((e) => e.state === "new").map((e) => e.order.id),
        attentionOrderIds: entries.filter((e) => e.state === "attention").map((e) => e.order.id),
        // Already in work order (problems, new, waiting), so the first one is what to open next.
        remainingOrderIds: entries.filter((e) => e.state !== "done").map((e) => e.order.id),
        done: entries.filter((e) => e.state === "done").map((e) => ({ id: e.order.id, at: e.confirmedAt })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    log({ stage: "queue", error: e instanceof Error ? e.message : String(e) });
    return jsonError(500, "Could not load the order queue");
  }
}
