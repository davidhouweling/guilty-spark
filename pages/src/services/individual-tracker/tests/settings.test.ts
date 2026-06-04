import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealIndividualTrackerSettingsService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("gets settings with credentials included", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ settings: FAKE_SETTINGS }));

    const result = await service.getSettings();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/settings",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(result).toEqual(FAKE_SETTINGS);
  });

  it("throws when getSettings returns a non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));

    await expect(service.getSettings()).rejects.toThrow("Unauthorized");
  });

  it("patches settings with the correct method, credentials, content-type, and wrapped body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ settings: FAKE_SETTINGS }));

    const result = await service.updateSettings(FAKE_SETTINGS);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/settings",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ settings: FAKE_SETTINGS });
    expect(result).toEqual(FAKE_SETTINGS);
  });

  it("throws when updateSettings returns a non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(service.updateSettings({})).rejects.toThrow("Request failed (500)");
  });
});
