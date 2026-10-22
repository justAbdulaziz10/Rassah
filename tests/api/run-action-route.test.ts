// Route-level tests for POST /api/runs/[runId]/action: which runs may be confirmed, and the
// 409 answers (with their Arabic wording on screen) for the ones that may not.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/db/memory";
import { fmtApiError } from "@/lib/ui/format";
import { run } from "../monitoring/fixtures";

vi.mock("next/server", () => ({ connection: async () => {}, after: () => {} }));

let repo: MemoryRepo;
vi.mock("@/lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http")>();
  return { ...actual, repoOrError: () => repo, log: () => {} };
});

const { POST } = await import("@/app/api/runs/[runId]/action/route");

const OLD = "00000000-0000-4000-8000-000000000001";
const NEW = "00000000-0000-4000-8000-000000000002";

function call(runId: string, body: unknown = { action: "confirm" }) {
  const request = new Request(`http://localhost/api/runs/${runId}/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ runId }) } as RouteContext<"/api/runs/[runId]/action">);
}

beforeEach(() => {
  repo = new MemoryRepo();
});

describe("POST /api/runs/[runId]/action — confirm", () => {
  it("confirms the order's latest run that chose a carton", async () => {
    repo.orderRuns.push(run({ id: OLD, minutesAgo: 10 }), run({ id: NEW, minutesAgo: 1 }));
    const res = await call(NEW);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ action: "confirmed" });
    expect(repo.orderRuns[1].employeeAction).toBe("confirmed");
  });

  it("answers 409 for an older run of the order, shown as «refresh the page»", async () => {
    repo.orderRuns.push(run({ id: OLD, minutesAgo: 10 }), run({ id: NEW, minutesAgo: 1 }));
    const res = await call(OLD);
    expect(res.status).toBe(409);
    const { error } = await res.json();
    expect(fmtApiError(error)).toBe("هذا الترتيب لم يعد الأحدث لهذا الطلب. حدّث الصفحة.");
    expect(repo.orderRuns[0].employeeAction).toBe("pending");
  });

  it("answers 409 for a run that chose no carton", async () => {
    repo.orderRuns.push(run({ id: NEW, status: "needs_measurement", cartonId: null, strategy: null }));
    const res = await call(NEW);
    expect(res.status).toBe(409);
    const { error } = await res.json();
    expect(fmtApiError(error)).toBe("لا يُؤكَّد إلا طلب اختيرت له كراتين.");
    expect(repo.orderRuns[0].employeeAction).toBe("pending");
  });

  it("confirms a split into several cartons", async () => {
    repo.orderRuns.push(run({ id: NEW, status: "no_box", cartonId: null, strategy: "split_2" }));
    expect((await call(NEW)).status).toBe(200);
    expect(repo.orderRuns[0].employeeAction).toBe("confirmed");
  });

  it("answers 200 again for a confirmed run without moving its confirmation time", async () => {
    repo.orderRuns.push(run({ id: NEW }));
    expect((await call(NEW)).status).toBe(200);
    const first = repo.orderRuns[0].actionAt;
    expect((await call(NEW)).status).toBe(200);
    expect(repo.orderRuns[0].actionAt).toBe(first);
  });

  it("answers 404 for an unknown run", async () => {
    expect((await call(OLD)).status).toBe(404);
  });
});
