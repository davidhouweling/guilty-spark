import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealIndividualTrackerViewService } from "../view";

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FAKE_VIEW: TrackerViewState = {
  trackerId: "tracker-1",
  gamertag: "Master Chief",
  status: "active",
  matches: [],
  series: [],
  lastUpdateTime: "2100-01-01T00:00:00.000Z",
  lastMatchDiscoveredAt: null,
  isLive: true,
};

describe("RealIndividualTrackerViewService", () => {
  let fetchSpy: MockInstance;
  let service: RealIndividualTrackerViewService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealIndividualTrackerViewService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("gets the view with credentials included", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ view: FAKE_VIEW }));

    const result = await service.getView("tracker 1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/tracker%201/view",
      expect.objectContaining({ method: "GET" }),
    );
    const [firstCall] = fetchSpy.mock.calls;
    const [, init] = firstCall;
    expect(init).toHaveProperty("credentials", "include");
    expect(result).toEqual({ view: FAKE_VIEW });
  });

  it("throws the error envelope message when the request fails", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "Tracker not found" }, 404));

    await expect(service.getView("tracker-1")).rejects.toThrow("Tracker not found");
  });

  it("throws a status-based error when the body is empty", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(service.getView("tracker-1")).rejects.toThrow("Request failed (500)");
  });
});
