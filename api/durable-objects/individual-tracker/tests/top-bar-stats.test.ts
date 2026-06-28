import { describe, beforeEach, it, expect, vi, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith } from "@guilty-spark/shared/halo/fakes/data";
import { type HaloInfiniteClient, type PlaylistCsrContainer, type Stats } from "halo-infinite-api";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import { IndividualTrackerDO } from "../individual-tracker-do";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { Services } from "../../../services/install";
import type { UserTokenProvider } from "../../../services/halo/user-token-provider";
import { aFakeDurableObjectStateWith } from "../../../base/fakes/do.fake";
import type { IndividualTrackerInternalState, IndividualTrackerViewStateResponse } from "../types";
import {
  aFakeIndividualTrackerInternalStateWith,
  aFakeIndividualTrackerMatchSummaryWith,
} from "../fakes/individual-tracker-do.fake";

const lastPersistedState = (
  spy: MockInstance<(key: string, value: IndividualTrackerInternalState) => Promise<void>>,
): IndividualTrackerInternalState => {
  const lastCall = spy.mock.calls.at(-1);
  if (lastCall == null) {
    throw new Error("expected state to be persisted");
  }
  return lastCall[1];
};

describe("topBarStats", () => {
  let individualTrackerDO: IndividualTrackerDO;
  let mockState: DurableObjectState;
  let mockStorage: DurableObjectStorage;
  let services: Services;
  let env: Env;
  let storageGetSpy: MockInstance<(key: string) => Promise<IndividualTrackerInternalState | null>>;
  let storagePutSpy: MockInstance<(key: string, value: IndividualTrackerInternalState) => Promise<void>>;
  let ownerClient: MockProxy<HaloInfiniteClient>;
  let getClientForUser: MockInstance<UserTokenProvider["getClientForUser"]>;
  let userTokenProvider: UserTokenProvider;

  const trackedXuid = "9999999999";

  const aMatchStatsForTrackedPlayer = (
    matchId: string,
    coreStatsOverrides?: Partial<Stats["CoreStats"]>,
  ): ReturnType<typeof aFakeMatchStatsWith> =>
    aFakeMatchStatsWith({
      MatchId: matchId,
      Players: [
        ...aFakeMatchStatsWith().Players,
        aFakePlayerWith({
          PlayerId: `xuid(${trackedXuid})`,
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith({
                  Kills: 10,
                  Deaths: 5,
                  Assists: 3,
                  ShotsFired: 100,
                  ShotsHit: 52,
                  DamageDealt: 5000,
                  DamageTaken: 3000,
                  Spawns: 5,
                  AverageLifeDuration: "PT30S",
                  HeadshotKills: 4,
                  ...coreStatsOverrides,
                }),
                PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2 },
              },
            },
          ],
        }),
      ],
    });

  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date("2024-11-26T12:00:00.000Z"),
    });

    mockState = aFakeDurableObjectStateWith();
    mockStorage = mockState.storage;

    ownerClient = mock<HaloInfiniteClient>();
    ownerClient.getPlayerMatches.mockResolvedValue([]);
    ownerClient.getMatchStats.mockResolvedValue(aFakeMatchStatsWith());
    getClientForUser = vi.fn<UserTokenProvider["getClientForUser"]>().mockResolvedValue(ownerClient);
    userTokenProvider = { getClientForUser } as unknown as UserTokenProvider;

    services = installFakeServicesWith({ userTokenProvider });
    env = aFakeEnvWith();

    storageGetSpy = vi.spyOn(mockStorage, "get");
    storagePutSpy = vi.spyOn(mockStorage, "put");

    individualTrackerDO = new IndividualTrackerDO(mockState, env, () => services);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("recomputes accumulated totals from selectedMatchIds when they differ from accumulatedMatchIds", async () => {
    ownerClient.getPlayerMatches.mockResolvedValue([]);
    ownerClient.getMatchStats.mockResolvedValue(aMatchStatsForTrackedPlayer("m1"));
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        startTime: "2024-11-26T12:00:00.000Z",
        searchStartTime: "2024-11-26T11:00:00.000Z",
        matchIds: ["m1"],
        selectedMatchIds: ["m1"],
        discoveredMatches: {
          m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1", teamOutcomes: [2, 3] }),
        },
        accumulatedMatchIds: [],
      }),
    );

    await individualTrackerDO.alarm();

    const persisted = lastPersistedState(storagePutSpy);
    expect(persisted.accumulatedPlayerTotals).toBeDefined();
    expect(persisted.accumulatedPlayerTotals?.kills).toBe(10);
    expect(persisted.accumulatedPlayerTotals?.deaths).toBe(5);
    expect(persisted.accumulatedPlayerTotals?.assists).toBe(3);
    expect(persisted.accumulatedMatchIds).toEqual(["m1"]);
  });

  it("skips recompute when selectedMatchIds equals accumulatedMatchIds", async () => {
    ownerClient.getPlayerMatches.mockResolvedValue([]);
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        startTime: "2024-11-26T12:00:00.000Z",
        matchIds: ["m1"],
        selectedMatchIds: ["m1"],
        discoveredMatches: {
          m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1", teamOutcomes: [2, 3] }),
        },
        accumulatedMatchIds: ["m1"],
        accumulatedPlayerTotals: {
          kills: 10,
          deaths: 5,
          assists: 3,
          headshotKills: 4,
          shotsFired: 100,
          shotsHit: 52,
          damageDealt: 5000,
          damageTaken: 3000,
          totalLifeSeconds: 150,
          totalSpawns: 5,
          totalLifeSpawns: 5,
        },
      }),
    );

    await individualTrackerDO.alarm();

    expect(ownerClient.getMatchStats).not.toHaveBeenCalled();
    const persisted = lastPersistedState(storagePutSpy);
    expect(persisted.accumulatedPlayerTotals?.kills).toBe(10);
  });

  it("recomputes accumulated totals across multiple selected matches", async () => {
    ownerClient.getPlayerMatches.mockResolvedValue([]);
    ownerClient.getMatchStats
      .mockResolvedValueOnce(aMatchStatsForTrackedPlayer("m1", { Kills: 10, Deaths: 5 }))
      .mockResolvedValueOnce(aMatchStatsForTrackedPlayer("m2", { Kills: 15, Deaths: 7 }));
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        startTime: "2024-11-26T12:00:00.000Z",
        matchIds: ["m1", "m2"],
        selectedMatchIds: ["m1", "m2"],
        discoveredMatches: {
          m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1", teamOutcomes: [2, 3] }),
          m2: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m2", teamOutcomes: [2, 3] }),
        },
        accumulatedMatchIds: [],
      }),
    );

    await individualTrackerDO.alarm();

    const persisted = lastPersistedState(storagePutSpy);
    expect(persisted.accumulatedPlayerTotals?.kills).toBe(25);
    expect(persisted.accumulatedPlayerTotals?.deaths).toBe(12);
  });

  it("keeps totalSpawns but skips totalLifeSpawns for a match with malformed AverageLifeDuration", async () => {
    ownerClient.getPlayerMatches.mockResolvedValue([]);
    ownerClient.getMatchStats
      .mockResolvedValueOnce(aMatchStatsForTrackedPlayer("m1", { Spawns: 5, AverageLifeDuration: "NOT_VALID" }))
      .mockResolvedValueOnce(aMatchStatsForTrackedPlayer("m2", { Spawns: 3, AverageLifeDuration: "PT30S" }));
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        startTime: "2024-11-26T12:00:00.000Z",
        matchIds: ["m1", "m2"],
        selectedMatchIds: ["m1", "m2"],
        discoveredMatches: {
          m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1", teamOutcomes: [2, 3] }),
          m2: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m2", teamOutcomes: [2, 3] }),
        },
        accumulatedMatchIds: [],
      }),
    );

    await individualTrackerDO.alarm();

    const persisted = lastPersistedState(storagePutSpy);
    expect(persisted.accumulatedPlayerTotals?.totalSpawns).toBe(8);
    expect(persisted.accumulatedPlayerTotals?.totalLifeSpawns).toBe(3);
  });

  it("returns topBarStats in handleViewState when topBarStatSlots provided", async () => {
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        matchIds: ["m1"],
        selectedMatchIds: ["m1"],
        discoveredMatches: {
          m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1", outcome: "Win", isMatchmaking: true }),
        },
        accumulatedPlayerTotals: {
          kills: 20,
          deaths: 10,
          assists: 5,
          headshotKills: 8,
          shotsFired: 200,
          shotsHit: 100,
          damageDealt: 10000,
          damageTaken: 6000,
          totalLifeSeconds: 300,
          totalSpawns: 10,
          totalLifeSpawns: 10,
        },
        accumulatedMatchIds: ["m1"],
      }),
    );

    const url = new URL("http://do/view-state");
    url.searchParams.set("topBarStatSlots", JSON.stringify(["matches-win-loss", "kills", "deaths", "accuracy"]));
    const response = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
    const body: IndividualTrackerViewStateResponse = await response.json();

    expect(body.state?.topBarStats).toHaveLength(4);
    expect(body.state?.topBarStats?.[0]).toEqual({ label: "Won:Loss", value: "1:0" });
    expect(body.state?.topBarStats?.[1]).toEqual({ label: "Kills", value: "20" });
    expect(body.state?.topBarStats?.[2]).toEqual({ label: "Deaths", value: "10" });
    const accuracyStat = body.state?.topBarStats?.[3];
    expect(accuracyStat?.label).toBe("Accuracy");
    expect(accuracyStat?.value).toContain("%");
  });

  it("returns undefined topBarStats when topBarStatSlots is empty", async () => {
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        matchIds: ["m1"],
        discoveredMatches: { m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1" }) },
      }),
    );

    const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));
    const body: IndividualTrackerViewStateResponse = await response.json();

    expect(body.state?.topBarStats).toBeUndefined();
  });

  it("uses in-memory cache when match ID and slots are unchanged", async () => {
    const state = aFakeIndividualTrackerInternalStateWith({
      xuid: trackedXuid,
      matchIds: ["m1"],
      discoveredMatches: { m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1", outcome: "Win" }) },
      accumulatedPlayerTotals: {
        kills: 5,
        deaths: 2,
        assists: 1,
        headshotKills: 1,
        shotsFired: 50,
        shotsHit: 25,
        damageDealt: 2000,
        damageTaken: 1000,
        totalLifeSeconds: 60,
        totalSpawns: 2,
        totalLifeSpawns: 2,
      },
      accumulatedMatchIds: ["m1"],
    });
    storageGetSpy.mockResolvedValue(state);

    const url = new URL("http://do/view-state");
    url.searchParams.set("topBarStatSlots", JSON.stringify(["kills"]));

    const r1 = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
    const r2 = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));

    const b1: IndividualTrackerViewStateResponse = await r1.json();
    const b2: IndividualTrackerViewStateResponse = await r2.json();

    expect(b1.state?.topBarStats).toEqual(b2.state?.topBarStats);
  });

  it("recomputes topBarStats when accumulatedMatchIds grows (re-enrichment of older match)", async () => {
    const baseState = aFakeIndividualTrackerInternalStateWith({
      xuid: trackedXuid,
      matchIds: ["m1", "m2"],
      discoveredMatches: {
        m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1", outcome: "Win" }),
        m2: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m2", outcome: "Win" }),
      },
      accumulatedPlayerTotals: {
        kills: 5,
        deaths: 2,
        assists: 1,
        headshotKills: 1,
        shotsFired: 50,
        shotsHit: 25,
        damageDealt: 2000,
        damageTaken: 1000,
        totalLifeSeconds: 60,
        totalSpawns: 2,
        totalLifeSpawns: 2,
      },
      accumulatedMatchIds: ["m2"],
    });
    storageGetSpy.mockResolvedValue(baseState);

    const url = new URL("http://do/view-state");
    url.searchParams.set("topBarStatSlots", JSON.stringify(["kills"]));

    const r1 = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
    const b1: IndividualTrackerViewStateResponse = await r1.json();
    expect(b1.state?.topBarStats?.[0]).toEqual({ label: "Kills", value: "5" });

    const updatedState = aFakeIndividualTrackerInternalStateWith({
      ...baseState,
      accumulatedPlayerTotals: {
        kills: 15,
        deaths: 4,
        assists: 2,
        headshotKills: 2,
        shotsFired: 100,
        shotsHit: 50,
        damageDealt: 4000,
        damageTaken: 2000,
        totalLifeSeconds: 120,
        totalSpawns: 4,
        totalLifeSpawns: 4,
      },
      accumulatedMatchIds: ["m2", "m1"],
    });
    storageGetSpy.mockResolvedValue(updatedState);

    const r2 = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
    const b2: IndividualTrackerViewStateResponse = await r2.json();
    expect(b2.state?.topBarStats?.[0]).toEqual({ label: "Kills", value: "15" });
  });

  it("computes series-win-loss from sorted match groupings", async () => {
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        matchIds: ["m2", "m1"],
        selectedMatchIds: ["m1", "m2"],
        discoveredMatches: {
          m1: aFakeIndividualTrackerMatchSummaryWith({
            matchId: "m1",
            startTime: "2024-11-26T11:00:00.000Z",
            outcome: "Win",
            isMatchmaking: false,
            teamRosterSignature: "0:1|1:2",
          }),
          m2: aFakeIndividualTrackerMatchSummaryWith({
            matchId: "m2",
            startTime: "2024-11-26T11:30:00.000Z",
            outcome: "Win",
            isMatchmaking: false,
            teamRosterSignature: "0:1|1:2",
          }),
        },
      }),
    );

    const url = new URL("http://do/view-state");
    url.searchParams.set("topBarStatSlots", JSON.stringify(["series-win-loss"]));
    const response = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
    const body: IndividualTrackerViewStateResponse = await response.json();

    expect(body.state?.topBarStats?.[0]).toEqual({ label: "Series Won:Loss", value: "1:0" });
  });

  describe("rank/ESRA slots", () => {
    const fakeCsr = {
      Value: 1567,
      Tier: "Onyx",
      SubTier: 0,
      MeasurementMatchesRemaining: 0,
      TierStart: 1500,
      NextTier: "Onyx",
      NextTierStart: 1600,
      InitialMeasurementMatches: 10,
      DemotionProtectionMatchesRemaining: 0,
      InitialDemotionProtectionMatches: 5,
      NextSubTier: 0,
    };
    const fakeCsrContainer: PlaylistCsrContainer = {
      Current: { ...fakeCsr, Value: 1567 },
      SeasonMax: { ...fakeCsr, Value: 1450 },
      AllTimeMax: { ...fakeCsr, Value: 1600 },
    };

    beforeEach(() => {
      vi.spyOn(services.haloService, "withUserClient").mockReturnValue(services.haloService);
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          xuid: trackedXuid,
          matchIds: ["m1"],
          discoveredMatches: { m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1" }) },
        }),
      );
    });

    it("returns formatted CSR for current-rank, season-peak, all-time-peak slots", async () => {
      vi.spyOn(services.haloService, "getRankedArenaCsrs").mockResolvedValue(
        new Map([[trackedXuid, fakeCsrContainer]]),
      );

      const url = new URL("http://do/view-state");
      url.searchParams.set("topBarStatSlots", JSON.stringify(["current-rank", "season-peak", "all-time-peak"]));
      const response = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.topBarStats?.[0]).toEqual({
        label: "Current Rank",
        value: "1,567",
        rankIcon: {
          rankTier: "Onyx",
          subTier: 0,
          measurementMatchesRemaining: 0,
          initialMeasurementMatches: 10,
        },
      });
      expect(body.state?.topBarStats?.[1]).toEqual({
        label: "Season Peak",
        value: "1,450",
        rankIcon: {
          rankTier: "Onyx",
          subTier: 0,
          measurementMatchesRemaining: null,
          initialMeasurementMatches: null,
        },
      });
      expect(body.state?.topBarStats?.[2]).toEqual({
        label: "All Time Peak",
        value: "1,600",
        rankIcon: {
          rankTier: "Onyx",
          subTier: 0,
          measurementMatchesRemaining: null,
          initialMeasurementMatches: null,
        },
      });
    });

    it("returns formatted ESRA for esra slot", async () => {
      vi.spyOn(services.haloService, "getPlayerEsra").mockResolvedValue({
        esra: 1234.7,
        lastRankedGamePlayed: null,
      });

      const url = new URL("http://do/view-state");
      url.searchParams.set("topBarStatSlots", JSON.stringify(["esra"]));
      const response = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.topBarStats?.[0]).toEqual({
        label: "ESRA",
        value: "1,235",
        rankIcon: {
          rankTier: "Diamond",
          subTier: 0,
          measurementMatchesRemaining: null,
          initialMeasurementMatches: null,
        },
      });
    });

    it("returns – when getRankedArenaCsrs throws (graceful degradation)", async () => {
      vi.spyOn(services.haloService, "getRankedArenaCsrs").mockRejectedValue(new Error("CSR fetch failed"));

      const url = new URL("http://do/view-state");
      url.searchParams.set("topBarStatSlots", JSON.stringify(["current-rank", "season-peak"]));
      const response = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.topBarStats?.[0]).toEqual({ label: "Current Rank", value: "–" });
      expect(body.state?.topBarStats?.[1]).toEqual({ label: "Season Peak", value: "–" });
    });

    it("returns – when getPlayerEsra throws (graceful degradation)", async () => {
      vi.spyOn(services.haloService, "getPlayerEsra").mockRejectedValue(new Error("ESRA fetch failed"));

      const url = new URL("http://do/view-state");
      url.searchParams.set("topBarStatSlots", JSON.stringify(["esra"]));
      const response = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.topBarStats?.[0]).toEqual({ label: "ESRA", value: "–" });
    });

    it("returns – when no CSR found for xuid (player not ranked)", async () => {
      vi.spyOn(services.haloService, "getRankedArenaCsrs").mockResolvedValue(new Map());

      const url = new URL("http://do/view-state");
      url.searchParams.set("topBarStatSlots", JSON.stringify(["current-rank"]));
      const response = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.topBarStats?.[0]).toEqual({ label: "Current Rank", value: "–" });
    });

    it("returns – for CSR slots when Value is 0 (placement/unranked sentinel)", async () => {
      const unrankedCsr = { ...fakeCsr, Value: 0, Tier: "", MeasurementMatchesRemaining: 3 };
      vi.spyOn(services.haloService, "getRankedArenaCsrs").mockResolvedValue(
        new Map([[trackedXuid, { Current: unrankedCsr, SeasonMax: unrankedCsr, AllTimeMax: unrankedCsr }]]),
      );

      const url = new URL("http://do/view-state");
      url.searchParams.set("topBarStatSlots", JSON.stringify(["current-rank", "season-peak", "all-time-peak"]));
      const response = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.topBarStats?.[0]).toEqual({
        label: "Current Rank",
        value: "–",
        rankIcon: {
          rankTier: null,
          subTier: 0,
          measurementMatchesRemaining: 3,
          initialMeasurementMatches: 10,
        },
      });
      expect(body.state?.topBarStats?.[1]).toEqual({ label: "Season Peak", value: "–" });
      expect(body.state?.topBarStats?.[2]).toEqual({ label: "All Time Peak", value: "–" });
    });

    it("does not call getRankedArenaCsrs or getPlayerEsra when those slots are not requested", async () => {
      const csrSpy = vi.spyOn(services.haloService, "getRankedArenaCsrs");
      const esraSpy = vi.spyOn(services.haloService, "getPlayerEsra");

      const url = new URL("http://do/view-state");
      url.searchParams.set("topBarStatSlots", JSON.stringify(["kills", "deaths"]));
      await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));

      expect(csrSpy).not.toHaveBeenCalled();
      expect(esraSpy).not.toHaveBeenCalled();
    });
  });

  describe("selectedMatchIds selection behaviour", () => {
    it("cache key changes when selection changes", async () => {
      const baseState = aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        matchIds: ["m1"],
        selectedMatchIds: [],
        discoveredMatches: { m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1", outcome: "Win" }) },
        accumulatedMatchIds: ["m1"],
      });

      storageGetSpy.mockResolvedValue(baseState);
      const url = new URL("http://do/view-state");
      url.searchParams.set("topBarStatSlots", JSON.stringify(["matches-win-loss"]));

      const r1 = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
      const b1: IndividualTrackerViewStateResponse = await r1.json();
      expect(b1.state?.topBarStats?.[0]).toEqual({ label: "Won:Loss", value: "0:0" });

      storageGetSpy.mockResolvedValue({ ...baseState, selectedMatchIds: ["m1"] });

      const r2 = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
      const b2: IndividualTrackerViewStateResponse = await r2.json();
      expect(b2.state?.topBarStats?.[0]).toEqual({ label: "Won:Loss", value: "1:0" });
    });
  });
});
