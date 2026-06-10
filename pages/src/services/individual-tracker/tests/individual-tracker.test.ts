import type { TrackerProfile } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type { Tracker } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { HaloInfiniteClient, PlaylistCsr, PlaylistCsrContainer, ResultContainer } from "halo-infinite-api";
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

function aFakePlaylistCsr(overrides: Partial<PlaylistCsr> = {}): PlaylistCsr {
  return {
    Value: 1200,
    MeasurementMatchesRemaining: 0,
    Tier: "Gold",
    TierStart: 1100,
    SubTier: 4,
    NextTier: "Platinum",
    NextTierStart: 1300,
    NextSubTier: 0,
    InitialMeasurementMatches: 10,
    DemotionProtectionMatchesRemaining: 0,
    InitialDemotionProtectionMatches: 0,
    ...overrides,
  };
}

function aFakePlaylistCsrContainer(overrides: Partial<PlaylistCsrContainer> = {}): PlaylistCsrContainer {
  return {
    Current: aFakePlaylistCsr(),
    SeasonMax: aFakePlaylistCsr({ Value: 1250, Tier: "Gold", SubTier: 5 }),
    AllTimeMax: aFakePlaylistCsr({ Value: 1300, Tier: "Platinum", SubTier: 0 }),
    ...overrides,
  };
}

function aFakeCsrResult(container: PlaylistCsrContainer): ResultContainer<PlaylistCsrContainer>[] {
  return [{ Result: container } as unknown as ResultContainer<PlaylistCsrContainer>];
}

describe("RealIndividualTrackerService", () => {
  let fetchSpy: MockInstance;
  let haloInfiniteClient: HaloInfiniteClient;
  let service: RealIndividualTrackerService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    haloInfiniteClient = {
      getUser: vi.fn(),
      getPlaylistCsr: vi.fn(),
      getPlayerMatchCount: vi.fn(),
    } as unknown as HaloInfiniteClient;
    service = new RealIndividualTrackerService({
      apiHost: "https://api.example.com",
      haloInfiniteClient,
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

  describe("searchGamertag", () => {
    it("returns null for an empty query", async () => {
      const result = await service.searchGamertag("   ");

      expect(result).toBeNull();
      expect(haloInfiniteClient.getUser).not.toHaveBeenCalled();
    });

    it("returns null when getUser throws (gamertag not found)", async () => {
      vi.mocked(haloInfiniteClient.getUser).mockRejectedValueOnce(new Error("Not found"));

      const result = await service.searchGamertag("UnknownSpartan");

      expect(result).toBeNull();
    });

    it("returns result with rank fields when CSR call succeeds", async () => {
      vi.mocked(haloInfiniteClient.getUser).mockResolvedValueOnce({
        gamertag: "Master Chief",
        xuid: "2533274800000001",
      } as unknown as Awaited<ReturnType<HaloInfiniteClient["getUser"]>>);
      vi.mocked(haloInfiniteClient.getPlaylistCsr).mockResolvedValueOnce(aFakeCsrResult(aFakePlaylistCsrContainer()));
      vi.mocked(haloInfiniteClient.getPlayerMatchCount).mockResolvedValueOnce({
        MatchmadeMatchesPlayedCount: 50,
        CustomMatchesPlayedCount: 5,
      } as unknown as Awaited<ReturnType<HaloInfiniteClient["getPlayerMatchCount"]>>);

      const result = await service.searchGamertag("Master Chief");

      expect(result).not.toBeNull();
      expect(result?.gamertag).toBe("Master Chief");
      expect(result?.xuid).toBe("2533274800000001");
      expect(result?.rankLabel).toBe("Gold 5");
      expect(result?.csrLabel).toBe("1200");
      expect(result?.matchmadeMatchCount).toBe(50);
      expect(result?.customMatchCount).toBe(5);
    });

    it("returns result with null rank fields when CSR call fails", async () => {
      vi.mocked(haloInfiniteClient.getUser).mockResolvedValueOnce({
        gamertag: "Master Chief",
        xuid: "2533274800000001",
      } as unknown as Awaited<ReturnType<HaloInfiniteClient["getUser"]>>);
      vi.mocked(haloInfiniteClient.getPlaylistCsr).mockRejectedValueOnce(new Error("CSR unavailable"));
      vi.mocked(haloInfiniteClient.getPlayerMatchCount).mockResolvedValueOnce({
        MatchmadeMatchesPlayedCount: 10,
        CustomMatchesPlayedCount: 2,
      } as unknown as Awaited<ReturnType<HaloInfiniteClient["getPlayerMatchCount"]>>);

      const result = await service.searchGamertag("Master Chief");

      expect(result).not.toBeNull();
      expect(result?.rankLabel).toBeNull();
      expect(result?.csrLabel).toBeNull();
      expect(result?.currentRankTier).toBeNull();
      expect(result?.matchmadeMatchCount).toBe(10);
    });

    it("returns result with null match counts when count call fails", async () => {
      vi.mocked(haloInfiniteClient.getUser).mockResolvedValueOnce({
        gamertag: "Master Chief",
        xuid: "2533274800000001",
      } as unknown as Awaited<ReturnType<HaloInfiniteClient["getUser"]>>);
      vi.mocked(haloInfiniteClient.getPlaylistCsr).mockResolvedValueOnce(aFakeCsrResult(aFakePlaylistCsrContainer()));
      vi.mocked(haloInfiniteClient.getPlayerMatchCount).mockRejectedValueOnce(new Error("Count unavailable"));

      const result = await service.searchGamertag("Master Chief");

      expect(result).not.toBeNull();
      expect(result?.rankLabel).toBe("Gold 5");
      expect(result?.matchmadeMatchCount).toBeNull();
      expect(result?.customMatchCount).toBeNull();
    });
  });

  it("sends a PATCH request to edit a series", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ success: true }));
    await service.editSeries("tracker-1", { titleOverride: "New Title", teams: [] });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/individual-tracker/manage/tracker-1/series"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("sends a POST request to resume a series", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 200 }));
    await service.resumeSeries("tracker-1");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/individual-tracker/manage/tracker-1/resume-series"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
