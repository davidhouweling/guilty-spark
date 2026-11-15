import { MatchOutcome } from "halo-infinite-api";
import { condensedMatchHistoryPageContract } from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import type { TrackerProfile } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type { Tracker } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { HaloInfiniteClient, PlaylistCsr, PlaylistCsrContainer, ResultContainer } from "halo-infinite-api";
import { aFakeMatchStatsWith } from "@guilty-spark/shared/halo/fakes/data";
import { aFakeCondensedMatchHistoryEntryWith } from "../fakes/individual-tracker.fake";
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
      getPlayerMatches: vi.fn(),
      getMatchStats: vi.fn(),
      getUsers: vi.fn(),
      getSpecificAssetVersion: vi.fn(),
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

    const result = await service.startTracker({ gamertag: "Master Chief", xuid: "xuid_master_chief" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/manage/start",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        body: JSON.stringify({ gamertag: "Master Chief", xuid: "xuid_master_chief" }),
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
      const csrContainer = aFakePlaylistCsrContainer();
      vi.mocked(haloInfiniteClient.getPlaylistCsr).mockResolvedValueOnce(aFakeCsrResult(csrContainer));
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
      expect(result?.rawCsrContainer).toEqual(csrContainer);
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

  describe("getMatchHistory", () => {
    it("includes the raw match stats on each returned entry", async () => {
      const matchStats = aFakeMatchStatsWith({ MatchId: "match-1" });
      const asset = {
        PublicName: "Test Asset",
        Files: { Prefix: "https://cdn.example.com/", FileRelativePaths: ["thumbnail.png"] },
      } as unknown as Awaited<ReturnType<HaloInfiniteClient["getSpecificAssetVersion"]>>;

      vi.mocked(haloInfiniteClient.getPlayerMatches).mockResolvedValueOnce([
        {
          MatchId: matchStats.MatchId,
          LastTeamId: 0,
          Outcome: MatchOutcome.Win,
          Rank: 1,
          PresentAtEndOfMatch: true,
          MatchInfo: matchStats.MatchInfo,
        },
      ]);
      vi.mocked(haloInfiniteClient.getMatchStats).mockResolvedValueOnce(matchStats);
      vi.mocked(haloInfiniteClient.getUsers).mockResolvedValue([]);
      vi.mocked(haloInfiniteClient.getSpecificAssetVersion).mockResolvedValue(asset);

      const result = await service.getMatchHistory("2533274800000001", 0, 25);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.rawMatchStats).toEqual(matchStats);
    });

    describe("getCondensedMatchHistory", () => {
      it.each(["https://api.example.com", "https://api.example.com/"])(
        "requests a bounded custom page with credentials and an encoded owner selector from %s",
        async (apiHost) => {
          service = new RealIndividualTrackerService({ apiHost, haloInfiniteClient });
          const match = aFakeCondensedMatchHistoryEntryWith();
          fetchSpy.mockResolvedValueOnce(
            condensedMatchHistoryPageContract.toResponse({ matches: [match], suggestedGroupings: [["a", "b"]] }),
          );

          const page = await service.getCondensedMatchHistory({
            xuid: "123",
            start: 25,
            count: 10,
            category: "custom",
            gamertag: "Player + One",
          });

          expect(fetchSpy).toHaveBeenCalledWith(
            "https://api.example.com/api/individual-tracker/search/123/matches?start=25&count=10&category=custom&gamertag=Player+%2B+One",
            { credentials: "include" },
          );
          expect(page.suggestedGroupings).toEqual([["a", "b"]]);
          expect(page.matches[0]).toMatchObject({
            ...match,
            duration: "10m",
            scoreDisplay: "50:42",
            resultString: "Win - 50:42",
          });
          expect(page.matches[0]).not.toHaveProperty("rawMatchStats");
        },
      );

      it("defaults to all categories and preserves an empty page", async () => {
        fetchSpy.mockResolvedValueOnce(
          condensedMatchHistoryPageContract.toResponse({ matches: [], suggestedGroupings: [] }),
        );
        await expect(service.getCondensedMatchHistory({ xuid: "123", start: 0, count: 25 })).resolves.toEqual({
          matches: [],
          suggestedGroupings: [],
        });
        expect(fetchSpy).toHaveBeenCalledWith(
          "https://api.example.com/api/individual-tracker/search/123/matches?start=0&count=25&category=all",
          { credentials: "include" },
        );
      });

      it.each([
        { matches: [] },
        {
          matches: [{ ...aFakeCondensedMatchHistoryEntryWith(), score: { scores: ["50"], roundsWon: null } }],
          suggestedGroupings: [],
        },
        {
          matches: [{ ...aFakeCondensedMatchHistoryEntryWith(), highlightContribution: undefined }],
          suggestedGroupings: [],
        },
      ])("rejects malformed or incomplete condensed responses", async (response) => {
        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response)));
        await expect(service.getCondensedMatchHistory({ xuid: "123", start: 0, count: 25 })).rejects.toThrow();
      });

      it("rejects an HTTP failure even if its body resembles a valid page", async () => {
        fetchSpy.mockResolvedValueOnce(
          condensedMatchHistoryPageContract.toResponse({ matches: [], suggestedGroupings: [] }, { status: 503 }),
        );
        await expect(service.getCondensedMatchHistory({ xuid: "123", start: 0, count: 25 })).rejects.toThrow(
          "Failed to fetch match history (503)",
        );
      });

      it("keeps unavailable details null and zero numeric contributions intact", async () => {
        const missing = aFakeCondensedMatchHistoryEntryWith({
          score: null,
          teamCount: null,
          teamRosterSignature: null,
          trackedPlayerSummary: null,
          highlightContribution: null,
          teams: [],
          outcome: "Unknown",
        });
        const zero = aFakeCondensedMatchHistoryEntryWith({
          matchId: "zero",
          score: { scores: [0, 0], roundsWon: [0, 0] },
          trackedPlayerSummary: { kills: 0, deaths: 0, assists: 0, damageDealt: 0, damageTaken: 0 },
        });
        fetchSpy.mockResolvedValueOnce(
          condensedMatchHistoryPageContract.toResponse({ matches: [missing, zero], suggestedGroupings: [] }),
        );
        const page = await service.getCondensedMatchHistory({ xuid: "123", start: 0, count: 25 });

        expect(page.matches[0]).toMatchObject({ ...missing, scoreDisplay: null, resultString: "Unknown" });
        expect(page.matches[1]).toMatchObject({
          ...zero,
          scoreDisplay: "0:0 (0:0)",
          resultString: "Win - 0:0",
        });
      });

      it("formats ISO times in the browser locale and timezone", async () => {
        const { DateTimeFormat } = Intl;
        vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
          return new DateTimeFormat(locales ?? "de-DE", { ...options, timeZone: "America/Los_Angeles" });
        });
        vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number, locales, options) {
          return new Intl.NumberFormat(locales ?? "de-DE", options).format(this);
        });
        fetchSpy.mockResolvedValueOnce(
          condensedMatchHistoryPageContract.toResponse({
            matches: [
              aFakeCondensedMatchHistoryEntryWith({
                durationIso: "PT10M5S",
                score: { scores: [1234, 1000], roundsWon: [2, 1] },
              }),
            ],
            suggestedGroupings: [],
          }),
        );

        const page = await service.getCondensedMatchHistory({ xuid: "123", start: 0, count: 25 });

        expect(page.matches[0]).toMatchObject({
          startTime: "1.1.2026, 5:00:00 PM",
          endTime: "1.1.2026, 5:10:00 PM",
          duration: "10m 5s",
          scoreDisplay: "2:1 (1.234:1.000)",
          resultString: "Win - 1.234:1.000",
        });
      });
    });
  });

  it("sends a PATCH request to edit a series", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ success: true }));
    await service.editSeries("tracker-1", { titleOverride: "New Title" });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/individual-tracker/manage/tracker-1/series"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("generates maps through the tracker map-generation endpoint", async () => {
    const maps = [
      { mode: "Slayer", map: "Live Fire" },
      { mode: "Oddball", map: "Streets" },
    ];
    fetchSpy.mockResolvedValueOnce(jsonResponse({ maps }));

    await expect(
      service.generateMaps({ trackerId: "tracker-1", playlist: "C", format: "H", count: 3 }),
    ).resolves.toEqual(maps);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/individual-tracker/tracker-1/generate-maps"),
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        body: JSON.stringify({ playlist: "C", format: "H", count: 3 }),
      }),
    );
  });

  it("includes planned maps when starting a series", async () => {
    const plannedMaps = [{ mode: "Oddball", map: "Streets" }];
    fetchSpy.mockResolvedValueOnce(jsonResponse({ success: true }));

    await service.startSeries({
      trackerId: "tracker-1",
      titleOverride: "Series",
      subtitleOverride: "Best of 3",
      teams: [],
      plannedMaps,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/individual-tracker/tracker-1/start-series"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          titleOverride: "Series",
          subtitleOverride: "Best of 3",
          teams: [],
          plannedMaps,
        }),
      }),
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

  it("sends a POST request to refresh a tracker", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ success: true }));
    await service.refreshTracker("tracker-1");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/individual-tracker/manage/tracker-1/refresh"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });
});
