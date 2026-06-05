import { describe, beforeEach, it, expect, vi, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith } from "@guilty-spark/shared/halo/fakes/data";
import { type HaloInfiniteClient, type PlayerMatchHistory, type Stats } from "halo-infinite-api";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import { IndividualTrackerDO } from "../individual-tracker-do";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { Services } from "../../../services/install";
import type { UserTokenProvider } from "../../../services/halo/user-token-provider";
import { aFakeDurableObjectStateWith } from "../../../base/fakes/do.fake";
import type {
  IndividualTrackerInternalState,
  IndividualTrackerViewStateResponse,
} from "../types";
import {
  aFakeIndividualTrackerInternalStateWith,
  aFakeIndividualTrackerMatchSummaryWith,
} from "../fakes/individual-tracker-do.fake";

const aFakePlayerMatch = (matchId: string, startTime: string, outcome = 2): PlayerMatchHistory =>
  ({
    MatchId: matchId,
    Outcome: outcome,
    MatchInfo: {
      StartTime: startTime,
      EndTime: startTime,
      GameVariantCategory: 6,
      MapVariant: { AssetId: "map-asset", VersionId: "v1" },
      UgcGameVariant: { AssetId: "mode-asset", VersionId: "v1" },
    },
  }) as unknown as PlayerMatchHistory;

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

  const aMatchStatsForTrackedPlayer = (matchId: string, coreStatsOverrides?: Partial<Stats["CoreStats"]>): ReturnType<typeof aFakeMatchStatsWith> =>
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
                CoreStats: aFakeCoreStatsWith({ Kills: 10, Deaths: 5, Assists: 3, ShotsFired: 100, ShotsHit: 52, DamageDealt: 5000, DamageTaken: 3000, Spawns: 5, AverageLifeDuration: "PT30S", HeadshotKills: 4, ...coreStatsOverrides }),
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

  it("accumulates player stats from getMatchStats on alarm", async () => {
    ownerClient.getPlayerMatches.mockResolvedValue([
      aFakePlayerMatch("m1", "2024-11-26T11:30:00.000Z"),
    ]);
    ownerClient.getMatchStats.mockResolvedValue(aMatchStatsForTrackedPlayer("m1"));
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        startTime: "2024-11-26T12:00:00.000Z",
        searchStartTime: "2024-11-26T11:00:00.000Z",
      }),
    );

    await individualTrackerDO.alarm();

    const persisted = lastPersistedState(storagePutSpy);
    expect(persisted.accumulatedPlayerTotals).toBeDefined();
    expect(persisted.accumulatedPlayerTotals?.kills).toBe(10);
    expect(persisted.accumulatedPlayerTotals?.deaths).toBe(5);
    expect(persisted.accumulatedPlayerTotals?.assists).toBe(3);
    expect(persisted.accumulatedMatchIds).toContain("m1");
  });

  it("does not double-accumulate if a match is re-enriched on a later poll", async () => {
    ownerClient.getPlayerMatches.mockResolvedValue([
      aFakePlayerMatch("m1", "2024-11-26T11:30:00.000Z"),
    ]);
    ownerClient.getMatchStats
      .mockRejectedValueOnce(new Error("stats not ready"))
      .mockResolvedValue(aMatchStatsForTrackedPlayer("m1"));
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        startTime: "2024-11-26T12:00:00.000Z",
        searchStartTime: "2024-11-26T11:00:00.000Z",
      }),
    );

    await individualTrackerDO.alarm();
    const afterFirst = lastPersistedState(storagePutSpy);
    expect(afterFirst.accumulatedPlayerTotals).toBeUndefined();

    storageGetSpy.mockResolvedValue(afterFirst);
    await individualTrackerDO.alarm();

    const afterSecond = lastPersistedState(storagePutSpy);
    expect(afterSecond.accumulatedPlayerTotals?.kills).toBe(10);
    expect(afterSecond.accumulatedMatchIds).toHaveLength(1);
  });

  it("accumulates totals across multiple matches", async () => {
    ownerClient.getPlayerMatches.mockResolvedValueOnce([
      aFakePlayerMatch("m1", "2024-11-26T11:00:00.000Z"),
      aFakePlayerMatch("m2", "2024-11-26T11:30:00.000Z"),
    ]);
    ownerClient.getMatchStats
      .mockResolvedValueOnce(aMatchStatsForTrackedPlayer("m1", { Kills: 10, Deaths: 5 }))
      .mockResolvedValueOnce(aMatchStatsForTrackedPlayer("m2", { Kills: 15, Deaths: 7 }));
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        startTime: "2024-11-26T12:00:00.000Z",
        searchStartTime: "2024-11-26T11:00:00.000Z",
      }),
    );

    await individualTrackerDO.alarm();

    const persisted = lastPersistedState(storagePutSpy);
    expect(persisted.accumulatedPlayerTotals?.kills).toBe(25);
    expect(persisted.accumulatedPlayerTotals?.deaths).toBe(12);
  });

  it("returns topBarStats in handleViewState when topBarStatSlots provided", async () => {
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        xuid: trackedXuid,
        matchIds: ["m1"],
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
      aFakeIndividualTrackerInternalStateWith({ matchIds: ["m1"], discoveredMatches: { m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1" }) } }),
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
        kills: 5, deaths: 2, assists: 1, headshotKills: 1,
        shotsFired: 50, shotsHit: 25, damageDealt: 2000, damageTaken: 1000,
        totalLifeSeconds: 60, totalSpawns: 2,
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
        kills: 5, deaths: 2, assists: 1, headshotKills: 1,
        shotsFired: 50, shotsHit: 25, damageDealt: 2000, damageTaken: 1000,
        totalLifeSeconds: 60, totalSpawns: 2,
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
        kills: 15, deaths: 4, assists: 2, headshotKills: 2,
        shotsFired: 100, shotsHit: 50, damageDealt: 4000, damageTaken: 2000,
        totalLifeSeconds: 120, totalSpawns: 4,
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

  it("returns N/A for rank/esra slots (deferred to G4)", async () => {
    storageGetSpy.mockResolvedValue(
      aFakeIndividualTrackerInternalStateWith({
        matchIds: ["m1"],
        discoveredMatches: { m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1" }) },
      }),
    );

    const url = new URL("http://do/view-state");
    url.searchParams.set("topBarStatSlots", JSON.stringify(["current-rank", "esra"]));
    const response = await individualTrackerDO.fetch(new Request(url.toString(), { method: "GET" }));
    const body: IndividualTrackerViewStateResponse = await response.json();

    expect(body.state?.topBarStats?.[0]).toEqual({ label: "Current Rank", value: "N/A" });
    expect(body.state?.topBarStats?.[1]).toEqual({ label: "ESRA", value: "N/A" });
  });
});
