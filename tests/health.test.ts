import { describe, expect, it } from "vitest";
import { evaluateHealth, type HealthInput } from "@/lib/health";

const base: HealthInput = {
  backend: "supabase",
  database: "ok",
  geminiKeyPresent: true,
  seededFacts: 0,
  demoMode: true,
  engineVersion: "engine-0.1",
  promptVersion: "v1",
};

describe("evaluateHealth", () => {
  it("supabase mode, all configured: 200 ok", () => {
    const { httpStatus, body } = evaluateHealth(base);
    expect(httpStatus).toBe(200);
    expect(body).toMatchObject({ status: "ok", offline: false, degraded: [] });
  });

  it("supabase mode keeps 503 for a missing key or a database failure", () => {
    expect(evaluateHealth({ ...base, geminiKeyPresent: false }).httpStatus).toBe(503);
    expect(evaluateHealth({ ...base, database: "error" }).httpStatus).toBe(503);
    expect(evaluateHealth({ ...base, database: "not_configured" }).body.status).toBe("error");
  });

  it("memory mode without a key: 200 degraded with reasons", () => {
    const { httpStatus, body } = evaluateHealth({ ...base, backend: "memory", geminiKeyPresent: false, seededFacts: 27 });
    expect(httpStatus).toBe(200);
    expect(body).toMatchObject({ status: "degraded", offline: true, backend: "memory", seededFacts: 27, geminiKeyPresent: false });
    expect(body.degraded).toEqual(["offline_memory_backend", "gemini_key_missing", "seeded_facts_in_use"]);
  });

  it("memory mode still returns 503 when the database fails", () => {
    expect(evaluateHealth({ ...base, backend: "memory", database: "error" }).httpStatus).toBe(503);
  });

  it("never exposes secret values (only presence flags)", () => {
    const json = JSON.stringify(evaluateHealth({ ...base, backend: "memory", geminiKeyPresent: false }).body);
    expect(json).not.toMatch(/key"\s*:\s*"/i);
    expect(Object.keys(evaluateHealth(base).body).sort()).toEqual(
      ["app", "backend", "database", "degraded", "demoMode", "engineVersion", "geminiKeyPresent", "offline", "promptVersion", "seededFacts", "status"].sort(),
    );
  });
});
