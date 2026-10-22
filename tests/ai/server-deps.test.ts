import { afterEach, describe, expect, it, vi } from "vitest";
import { serverExtractDeps } from "@/lib/ai";
import { appEnv, geminiEnv } from "@/lib/env";

afterEach(() => vi.unstubAllEnvs());

describe("server extraction settings", () => {
  it("an invalid Gemini setting records config_error instead of failing the request", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    vi.stubEnv("GEMINI_MODEL", "gemini-test");
    vi.stubEnv("GEMINI_PRICE_INPUT_PER_M", "0.30$");
    const deps = serverExtractDeps();
    await expect(deps.generate({ system: "", user: "", schema: {} } as never)).rejects.toMatchObject({ status: "config_error", code: "invalid_config" });
    expect(deps.maxAttempts).toBe(1);
  });

  it("a missing key records config_error", async () => {
    vi.stubEnv("GEMINI_API_KEY", "  ");
    const deps = serverExtractDeps();
    await expect(deps.generate({ system: "", user: "", schema: {} } as never)).rejects.toMatchObject({ status: "config_error", code: "missing_key" });
  });

  it("trims pasted keys and model names", () => {
    vi.stubEnv("GEMINI_API_KEY", "AIzaKEY\n");
    vi.stubEnv("GEMINI_MODEL", "gemini-test ");
    expect(geminiEnv()).toMatchObject({ GEMINI_API_KEY: "AIzaKEY", GEMINI_MODEL: "gemini-test" });
  });

  it("DEMO_MODE accepts true in any case and 1", () => {
    for (const [v, want] of [["true", true], ["TRUE", true], ["1", true], ["false", false], ["", false]] as const) {
      vi.stubEnv("DEMO_MODE", v);
      expect(appEnv().DEMO_MODE).toBe(want);
    }
  });
});
