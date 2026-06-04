import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealIndividualTrackerSettingsService } from "../settings";

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FAKE_SETTINGS = { styleFlags: { teamColor: "eagle", colorMode: "observer" as const } };

describe("RealIndividualTrackerSettingsService", () => {
  let fetchSpy: MockInstance;
  let service: RealIndividualTrackerSettingsService;

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("gets settings with credentials included", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ settings: FAKE_SETTINGS }));
    service = new RealIndividualTrackerSettingsService({ apiHost: "https://api.example.com" });

    const result = await service.getSettings();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/settings",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(result).toEqual(FAKE_SETTINGS);
  });

  it("throws when getSettings returns a non-ok response", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));
    service = new RealIndividualTrackerSettingsService({ apiHost: "https://api.example.com" });

    await expect(service.getSettings()).rejects.toThrow("Unauthorized");
  });

  it("patches settings and returns the updated value", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ settings: FAKE_SETTINGS }));
    service = new RealIndividualTrackerSettingsService({ apiHost: "https://api.example.com" });

    const result = await service.updateSettings(FAKE_SETTINGS);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ settings: FAKE_SETTINGS });
    expect(result).toEqual(FAKE_SETTINGS);
  });

  it("throws when updateSettings returns a non-ok response", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 500 }));
    service = new RealIndividualTrackerSettingsService({ apiHost: "https://api.example.com" });

    await expect(service.updateSettings({})).rejects.toThrow("Request failed (500)");
  });
});
