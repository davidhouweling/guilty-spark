import type { TrackerProfile } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type { Tracker } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { RealIndividualTrackerService } from "../individual-tracker";

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FAKE_PROFILE: TrackerProfile = {
  profileId: "profile-1",
  activeIdentityId: "identity-1",
  name: "Spartan",
};

const FAKE_TRACKER: Tracker = {
  trackerId: "tracker-1",
  gamertag: "Master Chief",
  xuid: "2533274800000001",
  status: "active",
  isLive: true,
  state: null,
};

describe("RealIndividualTrackerService", () => {
  let fetchSpy: MockInstance;
  let service: RealIndividualTrackerService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealIndividualTrackerService({
      apiHost: "https://api.example.com",
      haloInfiniteClient: {} as unknown as HaloInfiniteClient,
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("gets the profile with credentials", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ profile: FAKE_PROFILE }));

    const result = await service.getProfile();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/profile",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
    expect(result).toEqual({ profile: FAKE_PROFILE });
  });

  it("patches the profile with a JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ profile: FAKE_PROFILE }));

    const result = await service.updateProfile({ profileId: "profile-1", name: "Spartan" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/profile",
      expect.objectContaining({
        credentials: "include",
        method: "PATCH",
        body: JSON.stringify({ profileId: "profile-1", name: "Spartan" }),
      }),
    );
    expect(result).toEqual({ profile: FAKE_PROFILE });
  });

  it("lists trackers with credentials", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ trackers: [FAKE_TRACKER] }));

    const result = await service.listTrackers();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/manage/trackers",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
    expect(result).toEqual({ trackers: [FAKE_TRACKER] });
  });

  it("starts a tracker with a JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ tracker: FAKE_TRACKER }));

    const result = await service.startTracker({ gamertag: "Master Chief" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/manage/start",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        body: JSON.stringify({ gamertag: "Master Chief" }),
      }),
    );
    expect(result).toEqual({ tracker: FAKE_TRACKER });
  });

  it("stops a tracker and returns void", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ success: true }));

    await expect(service.stopTracker("tracker 1")).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/tracker%201/stop",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("pauses a tracker with credentials", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ tracker: FAKE_TRACKER }));

    const result = await service.pauseTracker("tracker-1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/tracker-1/pause",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(result).toEqual({ tracker: FAKE_TRACKER });
  });

  it("resumes a tracker with credentials", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ tracker: FAKE_TRACKER }));

    const result = await service.resumeTracker("tracker-1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/tracker-1/resume",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(result).toEqual({ tracker: FAKE_TRACKER });
  });

  it("selects the active tracker with a JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ tracker: FAKE_TRACKER }));

    const result = await service.selectActive("tracker-1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/manage/select-active",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        body: JSON.stringify({ trackerId: "tracker-1" }),
      }),
    );
    expect(result).toEqual({ tracker: FAKE_TRACKER });
  });

  it("gets the tracker status with credentials", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ tracker: FAKE_TRACKER }));

    const result = await service.getTrackerStatus("tracker-1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/tracker-1/status",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
    expect(result).toEqual({ tracker: FAKE_TRACKER });
  });

  it("throws the error envelope message when a request fails", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "Failed to list trackers" }, 500));

    await expect(service.listTrackers()).rejects.toThrow("Failed to list trackers");
  });
});
