import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats, getMedalsMetadata } from "../../../../../api/services/halo/fakes/data";
import { RealIndividualTrackerService } from "../individual-tracker";
import type { IndividualTrackerState } from "../types";

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("RealIndividualTrackerService", () => {
  let fetchSpy: MockInstance;
  let service: RealIndividualTrackerService;
  let getMedalsMetadataFileSpy: MockInstance;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    getMedalsMetadataFileSpy = vi.fn(async () => Promise.resolve(getMedalsMetadata()));
    service = new RealIndividualTrackerService({
      apiHost: "https://api.example.com",
      haloInfiniteClient: {
        getMedalsMetadataFile: getMedalsMetadataFileSpy,
      } as never,
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("posts grouped-series labels to the series-groups-update endpoint", async () => {
    const state = {
      trackerId: "tracker-1",
      seriesGroups: [
        {
          matchIds: ["m1", "m2"],
          titleOverride: "Dog Crew",
          subtitleOverride: "Queue #777",
        },
      ],
    } as Partial<IndividualTrackerState> as IndividualTrackerState;

    fetchSpy.mockResolvedValueOnce(jsonResponse({ success: true, state }));

    const response = await service.updateSeriesGroup({
      trackerId: "tracker-1",
      matchIds: ["m1", "m2"],
      titleOverride: "Dog Crew",
      subtitleOverride: "Queue #777",
    });

    expect(response).toEqual(state);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/tracker-1/series-groups-update",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchIds: ["m1", "m2"],
          titleOverride: "Dog Crew",
          subtitleOverride: "Queue #777",
        }),
      },
    );
  });

  it("caches the medals metadata file when resolving medal metadata", async () => {
    const match = Preconditions.checkExists(getMatchStats("32b4cddf-5451-4d83-bcf6-000land-grab"));

    const first = await service.getMedalMetadata([match]);
    const second = await service.getMedalMetadata([match]);

    expect(first[3334154676]).toEqual({
      name: "Guardian Angel",
      sortingWeight: 50,
    });
    expect(second[3334154676]).toEqual({
      name: "Guardian Angel",
      sortingWeight: 50,
    });
    expect(getMedalsMetadataFileSpy).toHaveBeenCalledTimes(1);
  });

  it("posts manual refresh requests to the tracker refresh endpoint", async () => {
    const state = {
      trackerId: "tracker-1",
      gamertag: "Chief",
      userId: "user-1",
      xuid: "xuid-1",
      status: "active",
      isPaused: false,
      startTime: "2026-01-01T00:00:00.000Z",
      lastUpdateTime: "2026-01-01T00:03:00.000Z",
      searchStartTime: "2026-01-01T00:00:00.000Z",
      lastMatchDiscoveredAt: "2026-01-01T00:03:00.000Z",
      checkCount: 1,
      idleTimeoutHours: 1,
      discoveredMatches: {},
      matchIds: [],
      matchGroupings: [],
      seriesGroups: [],
      excludedMatchIds: [],
      errorState: {
        consecutiveErrors: 0,
        backoffMinutes: 3,
        lastSuccessTime: "2026-01-01T00:00:00.000Z",
      },
      refreshInProgress: undefined,
      refreshStartedAt: undefined,
    } as IndividualTrackerState;

    fetchSpy.mockResolvedValueOnce(jsonResponse({ success: true, state }));

    const response = await service.refreshTracker("tracker-1");

    expect(response).toEqual({ success: true, state });
    expect(fetchSpy).toHaveBeenCalledWith("https://api.example.com/api/individual-tracker/tracker-1/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  });

  it("formats zero-indexed non-Onyx subtiers as one-based rank labels", async () => {
    service = new RealIndividualTrackerService({
      apiHost: "https://api.example.com",
      haloInfiniteClient: {
        getMedalsMetadataFile: getMedalsMetadataFileSpy,
        getUser: vi.fn(
          async () =>
            await Promise.resolve({
              gamertag: "Chief",
              xuid: "xuid-1",
            }),
        ),
        getPlayerMatchCount: vi.fn(
          async () =>
            await Promise.resolve({
              MatchmadeMatchesPlayedCount: 10,
              CustomMatchesPlayedCount: 0,
              LocalMatchesPlayedCount: 0,
            }),
        ),
        getPlaylistCsr: vi.fn(
          async () =>
            await Promise.resolve([
              {
                Id: "playlist-1",
                Result: {
                  Current: {
                    Tier: "Diamond",
                    SubTier: 2,
                    Value: 1234,
                    MeasurementMatchesRemaining: 0,
                  },
                  SeasonMax: {
                    Tier: "Diamond",
                    SubTier: 1,
                    Value: 1200,
                  },
                  AllTimeMax: {
                    Tier: "Diamond",
                    SubTier: 2,
                    Value: 1234,
                  },
                },
              },
            ]),
        ),
      } as never,
    });

    const result = await service.searchGamertag("Chief");

    expect(result?.rankLabel).toBe("Diamond 3");
    expect(result?.allTimePeakRankLabel).toBe("Diamond 3");
    expect(result?.csrLabel).toBe("1234");
  });
});
