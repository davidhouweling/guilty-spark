import { describe, beforeEach, it, expect, vi, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { trackerViewMessageContract } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith, aFakeTeamWith } from "@guilty-spark/shared/halo/fakes/data";
import { type HaloInfiniteClient, type PlayerMatchHistory, RequestError } from "halo-infinite-api";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import { IndividualTrackerDO } from "../individual-tracker-do";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { Services } from "../../../services/install";
import type { UserTokenProvider } from "../../../services/halo/user-token-provider";
import { aFakeDurableObjectStateWith, aFakeWebSocket } from "../../../base/fakes/do.fake";
import {
  aFakeWebSocketHibernationAdapter,
  type FakeWebSocketHibernationAdapter,
} from "../../../base/fakes/websocket-hibernation-adapter.fake";
import type {
  IndividualTrackerStartRequest,
  IndividualTrackerInternalState,
  IndividualTrackerStartResponse,
  IndividualTrackerPauseResponse,
  IndividualTrackerResumeResponse,
  IndividualTrackerStatusResponse,
  IndividualTrackerViewStateResponse,
} from "../types";
import {
  aFakeIndividualTrackerInternalStateWith,
  aFakeIndividualTrackerMatchSummaryWith,
} from "../fakes/individual-tracker-do.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";

const aFakeWinMatchStats = (): ReturnType<typeof aFakeMatchStatsWith> =>
  aFakeMatchStatsWith({
    MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: 6 },
    Teams: [
      aFakeTeamWith({
        TeamId: 0,
        Stats: { CoreStats: aFakeCoreStatsWith({ Score: 50 }), PvpStats: { Kills: 0, Deaths: 0, Assists: 0, KDA: 0 } },
      }),
      aFakeTeamWith({
        TeamId: 1,
        Stats: { CoreStats: aFakeCoreStatsWith({ Score: 42 }), PvpStats: { Kills: 0, Deaths: 0, Assists: 0, KDA: 0 } },
      }),
    ],
  });

const createMockStartRequest = (
  overrides: Partial<IndividualTrackerStartRequest> = {},
): IndividualTrackerStartRequest => ({
  userId: "test-user-id",
  trackerId: "test-tracker-id",
  xuid: "test-xuid",
  gamertag: "TestGamertag",
  searchStartTime: new Date().toISOString(),
  idleTimeoutHours: 6,
  ...overrides,
});

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

describe("IndividualTrackerDO", () => {
  let individualTrackerDO: IndividualTrackerDO;
  let mockState: DurableObjectState;
  let mockStorage: DurableObjectStorage;
  let services: Services;
  let env: Env;
  let storageGetSpy: MockInstance<(key: string) => Promise<IndividualTrackerInternalState | null>>;
  let storagePutSpy: MockInstance<(key: string, value: IndividualTrackerInternalState) => Promise<void>>;
  let storageDeleteSpy: MockInstance<typeof mockStorage.delete>;
  let storageSetAlarmSpy: MockInstance<typeof mockStorage.setAlarm>;
  let storageDeleteAlarmSpy: MockInstance<typeof mockStorage.deleteAlarm>;
  let ownerClient: MockProxy<HaloInfiniteClient>;
  let getClientForUser: MockInstance<UserTokenProvider["getClientForUser"]>;
  let userTokenProvider: UserTokenProvider;

  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date("2024-11-26T12:00:00.000Z"),
    });

    mockState = aFakeDurableObjectStateWith();
    mockStorage = mockState.storage;

    ownerClient = mock<HaloInfiniteClient>();
    ownerClient.getPlayerMatches.mockResolvedValue([]);
    ownerClient.getMatchStats.mockResolvedValue(aFakeWinMatchStats());
    getClientForUser = vi.fn<UserTokenProvider["getClientForUser"]>().mockResolvedValue(ownerClient);
    userTokenProvider = { getClientForUser } as unknown as UserTokenProvider;

    services = installFakeServicesWith({ userTokenProvider });
    env = aFakeEnvWith();

    storageGetSpy = vi.spyOn(mockStorage, "get");
    storagePutSpy = vi.spyOn(mockStorage, "put");
    storageDeleteSpy = vi.spyOn(mockStorage, "delete");
    storageSetAlarmSpy = vi.spyOn(mockStorage, "setAlarm");
    storageDeleteAlarmSpy = vi.spyOn(mockStorage, "deleteAlarm");

    individualTrackerDO = new IndividualTrackerDO(mockState, env, () => services);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("initializes services correctly", () => {
      expect(individualTrackerDO).toBeInstanceOf(IndividualTrackerDO);
    });
  });

  describe("fetch()", () => {
    it("returns 404 for unknown endpoints", async () => {
      const response = await individualTrackerDO.fetch(new Request("http://do/unknown", { method: "GET" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns 500 when storage throws", async () => {
      storageGetSpy.mockRejectedValue(new Error("Storage error"));

      const response = await individualTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).toBe("Internal Server Error");
    });
  });

  describe("handleStart()", () => {
    it("initializes state to active and returns sanitized state", async () => {
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(createMockStartRequest()),
      });

      const response = await individualTrackerDO.fetch(request);

      expect(response.status).toBe(200);
      const body: IndividualTrackerStartResponse = await response.json();
      expect(body.success).toBe(true);
      expect(body.state.status).toBe("active");
      expect(body.state.isPaused).toBe(false);
      expect(body.state.gamertag).toBe("TestGamertag");
      expect(body.state.idleTimeoutHours).toBe(6);
    });

    it("persists initial state with active status and zero check count", async () => {
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(createMockStartRequest()),
      });

      await individualTrackerDO.fetch(request);

      expect(storagePutSpy).toHaveBeenCalledWith(
        "individualTrackerState",
        expect.objectContaining({ status: "active", isPaused: false, checkCount: 0 }),
      );
    });

    it("schedules an alarm", async () => {
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(createMockStartRequest()),
      });

      await individualTrackerDO.fetch(request);

      expect(storageSetAlarmSpy).toHaveBeenCalled();
    });

    it("does not include internal-only fields in the returned state", async () => {
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(createMockStartRequest()),
      });

      const response = await individualTrackerDO.fetch(request);
      const body: IndividualTrackerStartResponse = await response.json();

      expect(Object.keys(body.state).sort()).toEqual(
        [
          "gamertag",
          "idleTimeoutHours",
          "isPaused",
          "lastUpdateTime",
          "startTime",
          "status",
          "trackerId",
          "userId",
          "xuid",
        ].sort(),
      );
    });
  });

  describe("handlePause()", () => {
    it("sets state to paused and persists", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith());

      const response = await individualTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerPauseResponse = await response.json();
      expect(body.state.status).toBe("paused");
      expect(body.state.isPaused).toBe(true);
      expect(storagePutSpy).toHaveBeenCalledWith(
        "individualTrackerState",
        expect.objectContaining({ status: "paused", isPaused: true }),
      );
    });

    it("clears the alarm", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith());

      await individualTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(storageDeleteAlarmSpy).toHaveBeenCalled();
    });

    it("returns 404 when no state exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await individualTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(404);
    });
  });

  describe("handleResume()", () => {
    it("sets state to active and persists", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ status: "paused", isPaused: true }));

      const response = await individualTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerResumeResponse = await response.json();
      expect(body.state.status).toBe("active");
      expect(body.state.isPaused).toBe(false);
    });

    it("schedules an alarm", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ status: "paused", isPaused: true }));

      await individualTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(storageSetAlarmSpy).toHaveBeenCalled();
    });

    it("returns 404 when no state exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await individualTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(404);
    });
  });

  describe("handleStop()", () => {
    it("deletes the persisted state and clears the alarm", async () => {
      const response = await individualTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(response.status).toBe(200);
      expect(storageDeleteSpy).toHaveBeenCalledWith("individualTrackerState");
      expect(storageDeleteAlarmSpy).toHaveBeenCalled();
    });
  });

  describe("handleStatus()", () => {
    it("returns sanitized state when present", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith());

      const response = await individualTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerStatusResponse = await response.json();
      expect(body.state?.gamertag).toBe("FakeGamertag");
    });

    it("returns null state when absent", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await individualTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerStatusResponse = await response.json();
      expect(body.state).toBeNull();
    });

    it("excludes internal-only fields from the returned state", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith());

      const response = await individualTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));
      const body: IndividualTrackerStatusResponse = await response.json();

      expect.assertions(5);
      if (body.state != null) {
        expect(body.state).not.toHaveProperty("errorState");
        expect(body.state).not.toHaveProperty("searchStartTime");
        expect(body.state).not.toHaveProperty("checkCount");
        expect(body.state).not.toHaveProperty("lastMatchDiscoveredAt");
        expect(Object.keys(body.state)).toHaveLength(9);
      }
    });
  });

  describe("handleViewState()", () => {
    it("returns the allowlisted projection with matches ordered chronologically", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          gamertag: "ViewTag",
          status: "active",
          lastUpdateTime: "2024-11-26T12:00:00.000Z",
          lastMatchDiscoveredAt: "2024-11-26T11:55:00.000Z",
          matchIds: ["match-2", "match-1"],
          discoveredMatches: {
            "match-1": aFakeIndividualTrackerMatchSummaryWith({
              matchId: "match-1",
              startTime: "2024-11-26T11:00:00.000Z",
              endTime: "2024-11-26T11:10:00.000Z",
              mapAssetId: "map-1",
              mapVersionId: "map-v-1",
              mapName: "Aquarius",
              modeAssetId: "mode-1",
              gameVariantCategory: 6,
              outcome: "Win",
              score: "50:42",
            }),
            "match-2": aFakeIndividualTrackerMatchSummaryWith({
              matchId: "match-2",
              startTime: "2024-11-26T11:30:00.000Z",
              endTime: "2024-11-26T11:40:00.000Z",
              mapAssetId: "map-2",
              mapVersionId: "map-v-2",
              mapName: "Live Fire",
              modeAssetId: "mode-2",
              gameVariantCategory: 7,
              outcome: "Loss",
              score: "42:50",
            }),
          },
        }),
      );

      const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerViewStateResponse = await response.json();
      expect(body.state?.gamertag).toBe("ViewTag");
      expect(body.state?.status).toBe("active");
      expect(body.state?.lastMatchDiscoveredAt).toBe("2024-11-26T11:55:00.000Z");
      expect(body.state?.matches.map((match) => match.matchId)).toEqual(["match-1", "match-2"]);
    });

    it("returns lastMatchDiscoveredAt as null when no match has been discovered", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ lastMatchDiscoveredAt: undefined }));

      const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.lastMatchDiscoveredAt).toBeNull();
    });

    it("returns null state when absent", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerViewStateResponse = await response.json();
      expect(body.state).toBeNull();
    });

    it("excludes internal-only fields from the projection", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith());

      const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect.assertions(7);
      if (body.state != null) {
        expect(body.state).not.toHaveProperty("errorState");
        expect(body.state).not.toHaveProperty("checkCount");
        expect(body.state).not.toHaveProperty("searchStartTime");
        expect(body.state).not.toHaveProperty("idleTimeoutHours");
        expect(body.state).not.toHaveProperty("isPaused");
        expect(body.state).not.toHaveProperty("userId");
        expect(Object.keys(body.state).sort()).toEqual(
          ["gamertag", "lastMatchDiscoveredAt", "lastUpdateTime", "matches", "series", "status", "trackerId"].sort(),
        );
      }
    });

    it("excludes the internal grouping fields from the public matches", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          matchIds: ["m1"],
          discoveredMatches: {
            m1: aFakeIndividualTrackerMatchSummaryWith({
              matchId: "m1",
              isMatchmaking: true,
              teamRosterSignature: "0:1|1:2",
              teamOutcomes: [2, 3],
            }),
          },
        }),
      );

      const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();
      const match = body.state?.matches[0];

      expect(match).not.toHaveProperty("isMatchmaking");
      expect(match).not.toHaveProperty("teamRosterSignature");
      expect(match).not.toHaveProperty("teamOutcomes");
      expect(Object.keys(match ?? {}).sort()).toEqual(
        [
          "matchId",
          "startTime",
          "endTime",
          "mapAssetId",
          "mapVersionId",
          "mapName",
          "modeAssetId",
          "gameVariantCategory",
          "outcome",
          "score",
        ].sort(),
      );
    });

    it("emits a series group for consecutive same-roster custom matches", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          matchIds: ["m1", "m2"],
          discoveredMatches: {
            m1: aFakeIndividualTrackerMatchSummaryWith({
              matchId: "m1",
              startTime: "2024-11-26T11:00:00.000Z",
              mapAssetId: "map-a",
              mapVersionId: "ver-a",
              gameVariantCategory: 6,
              outcome: "Win",
              isMatchmaking: false,
              teamRosterSignature: "0:1|1:2",
              teamOutcomes: [2, 3],
            }),
            m2: aFakeIndividualTrackerMatchSummaryWith({
              matchId: "m2",
              startTime: "2024-11-26T11:30:00.000Z",
              mapAssetId: "map-b",
              mapVersionId: "ver-b",
              gameVariantCategory: 6,
              outcome: "Loss",
              isMatchmaking: false,
              teamRosterSignature: "0:1|1:2",
              teamOutcomes: [3, 2],
            }),
          },
        }),
      );

      const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.series).toHaveLength(1);
      const series = body.state?.series[0];
      expect(series?.matchIds).toEqual(["m1", "m2"]);
      expect(series?.id).toBe("series:m1:m2");
      expect(series?.score).toBe("1:1");
      expect(series?.title).toBe("Eagle vs Cobra");
      expect(series?.subtitle).toBe("Best of 3");
    });

    it("orders matches chronologically and groups time-adjacent matches regardless of discovery order", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          matchIds: ["m2", "m1", "m3"],
          discoveredMatches: {
            m1: aFakeIndividualTrackerMatchSummaryWith({
              matchId: "m1",
              startTime: "2024-11-26T11:00:00.000Z",
              outcome: "Win",
              isMatchmaking: false,
              teamRosterSignature: "0:1|1:2",
              teamOutcomes: [2, 3],
            }),
            m2: aFakeIndividualTrackerMatchSummaryWith({
              matchId: "m2",
              startTime: "2024-11-26T11:30:00.000Z",
              outcome: "Loss",
              isMatchmaking: false,
              teamRosterSignature: "0:1|1:2",
              teamOutcomes: [3, 2],
            }),
            m3: aFakeIndividualTrackerMatchSummaryWith({
              matchId: "m3",
              startTime: "2024-11-26T12:00:00.000Z",
              outcome: "Win",
              isMatchmaking: false,
              teamRosterSignature: "0:1|1:2",
              teamOutcomes: [2, 3],
            }),
          },
        }),
      );

      const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.matches.map((match) => match.matchId)).toEqual(["m1", "m2", "m3"]);
      expect(body.state?.series).toHaveLength(1);
      expect(body.state?.series[0]?.matchIds).toEqual(["m1", "m2", "m3"]);
    });

    it("does not group matchmaking matches into a series", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          matchIds: ["m1", "m2"],
          discoveredMatches: {
            m1: aFakeIndividualTrackerMatchSummaryWith({
              matchId: "m1",
              isMatchmaking: true,
              teamRosterSignature: "0:1|1:2",
              teamOutcomes: [2, 3],
            }),
            m2: aFakeIndividualTrackerMatchSummaryWith({
              matchId: "m2",
              isMatchmaking: true,
              teamRosterSignature: "0:1|1:2",
              teamOutcomes: [3, 2],
            }),
          },
        }),
      );

      const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));
      const body: IndividualTrackerViewStateResponse = await response.json();

      expect(body.state?.series).toEqual([]);
    });
  });

  describe("alarm()", () => {
    const NORMAL_INTERVAL_MS = 3 * 60 * 1000 - 8 * 1000;
    const now = new Date("2024-11-26T12:00:00.000Z");

    it("bumps check count and reschedules at the normal interval on success", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({ checkCount: 2, startTime: now.toISOString() }),
      );

      await individualTrackerDO.alarm();

      expect(storagePutSpy).toHaveBeenCalledWith("individualTrackerState", expect.objectContaining({ checkCount: 3 }));
      expect(storageSetAlarmSpy).toHaveBeenCalledWith(now.getTime() + NORMAL_INTERVAL_MS);
    });

    it("polls getPlayerMatches and appends only genuinely-new matches at/after searchStartTime", async () => {
      const searchStartTime = "2024-11-26T11:00:00.000Z";
      ownerClient.getPlayerMatches.mockResolvedValue([
        aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z"),
        aFakePlayerMatch("match-existing", "2024-11-26T11:40:00.000Z"),
        aFakePlayerMatch("match-too-old", "2024-11-26T10:00:00.000Z"),
      ]);
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          startTime: now.toISOString(),
          searchStartTime,
          matchIds: ["match-existing"],
          discoveredMatches: {
            "match-existing": aFakeIndividualTrackerMatchSummaryWith({
              matchId: "match-existing",
              startTime: "2024-11-26T11:40:00.000Z",
              endTime: "2024-11-26T11:40:00.000Z",
              mapAssetId: "map-asset",
              mapVersionId: "v1",
              mapName: "Recharge",
              modeAssetId: "mode-asset",
              gameVariantCategory: 6,
              outcome: "Win",
              score: "50:42",
            }),
          },
        }),
      );

      await individualTrackerDO.alarm();

      expect(ownerClient.getPlayerMatches).toHaveBeenCalledWith("fake-xuid", 0, 25);
      const persisted = lastPersistedState(storagePutSpy);
      expect(persisted.matchIds).toEqual(["match-existing", "match-new"]);
      expect(persisted.discoveredMatches["match-new"]).toMatchObject({
        matchId: "match-new",
        mapAssetId: "map-asset",
        mapVersionId: "v1",
        modeAssetId: "mode-asset",
        gameVariantCategory: 6,
        outcome: "Win",
        score: "50:42",
      });
      expect(persisted.discoveredMatches).not.toHaveProperty("match-too-old");
    });

    it("stores outcome, score, and the resolved map name for a newly discovered match", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z", 3)]);
      const getMapNameSpy = vi.spyOn(services.haloService, "getMapName").mockResolvedValue("Aquarius");
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          startTime: now.toISOString(),
          searchStartTime: "2024-11-26T11:00:00.000Z",
          matchIds: [],
          discoveredMatches: {},
        }),
      );

      await individualTrackerDO.alarm();

      const persisted = lastPersistedState(storagePutSpy);
      expect(persisted.discoveredMatches["match-new"]?.outcome).toBe("Loss");
      expect(persisted.discoveredMatches["match-new"]?.score).toBe("50:42");
      expect(persisted.discoveredMatches["match-new"]?.mapName).toBe("Aquarius");
      expect(getMapNameSpy).toHaveBeenCalledWith("map-asset", "v1");
      expect(ownerClient.getMatchStats).toHaveBeenCalledWith("match-new");
    });

    it("stores the team roster signature and team outcomes from getMatchStats", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z", 2)]);
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          startTime: now.toISOString(),
          searchStartTime: "2024-11-26T11:00:00.000Z",
          matchIds: [],
          discoveredMatches: {},
        }),
      );

      await individualTrackerDO.alarm();

      const persisted = lastPersistedState(storagePutSpy);
      const summary = persisted.discoveredMatches["match-new"];
      expect(summary?.teamRosterSignature).toBe("0:1111111111,2222222222|1:3333333333,4444444444");
      expect(summary?.teamOutcomes).toEqual([2, 2]);
      expect(summary?.isMatchmaking).toBe(false);
    });

    it("falls back to an empty score and re-enriches on the next poll when getMatchStats fails", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z", 2)]);
      ownerClient.getMatchStats.mockRejectedValueOnce(new Error("stats not ready"));
      const state = aFakeIndividualTrackerInternalStateWith({
        startTime: now.toISOString(),
        searchStartTime: "2024-11-26T11:00:00.000Z",
        matchIds: [],
        discoveredMatches: {},
      });
      storageGetSpy.mockResolvedValue(state);

      await individualTrackerDO.alarm();

      const afterFirst = lastPersistedState(storagePutSpy);
      expect(afterFirst.discoveredMatches["match-new"]?.outcome).toBe("Win");
      expect(afterFirst.discoveredMatches["match-new"]?.score).toBe("");

      await individualTrackerDO.alarm();

      const afterSecond = lastPersistedState(storagePutSpy);
      expect(afterSecond.discoveredMatches["match-new"]?.score).toBe("50:42");
    });

    it("does not re-fetch stats every poll for an enriched match whose stats have no teams", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z", 2)]);
      ownerClient.getMatchStats.mockResolvedValue(
        aFakeMatchStatsWith({ MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: 6 }, Teams: [] }),
      );
      const state = aFakeIndividualTrackerInternalStateWith({
        startTime: now.toISOString(),
        searchStartTime: "2024-11-26T11:00:00.000Z",
        matchIds: [],
        discoveredMatches: {},
      });
      storageGetSpy.mockResolvedValue(state);

      await individualTrackerDO.alarm();
      await individualTrackerDO.alarm();

      expect(state.discoveredMatches["match-new"]?.score).toBe("");
      expect(state.discoveredMatches["match-new"]?.teamOutcomes).toEqual([]);
      expect(ownerClient.getMatchStats).toHaveBeenCalledTimes(1);
    });

    it("retries map-name resolution on a later poll when it initially fails", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z", 2)]);
      vi.spyOn(services.haloService, "getMapName")
        .mockRejectedValueOnce(new Error("asset blip"))
        .mockResolvedValue("Aquarius");
      const state = aFakeIndividualTrackerInternalStateWith({
        startTime: now.toISOString(),
        searchStartTime: "2024-11-26T11:00:00.000Z",
        matchIds: [],
        discoveredMatches: {},
      });
      storageGetSpy.mockResolvedValue(state);

      await individualTrackerDO.alarm();
      expect(state.discoveredMatches["match-new"]?.mapName).toBe("");

      await individualTrackerDO.alarm();
      expect(state.discoveredMatches["match-new"]?.mapName).toBe("Aquarius");
    });

    it("clears the cached client and backs off when getMatchStats throws an auth error", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z", 2)]);
      ownerClient.getMatchStats.mockRejectedValue(new Error("401 Unauthorized: spartan token expired"));
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          startTime: now.toISOString(),
          searchStartTime: "2024-11-26T11:00:00.000Z",
          matchIds: [],
          discoveredMatches: {},
          errorState: { consecutiveErrors: 0, backoffMinutes: 3, lastSuccessTime: "old" },
        }),
      );

      await expect(individualTrackerDO.alarm()).resolves.toBeUndefined();

      const persisted = lastPersistedState(storagePutSpy);
      expect(persisted.errorState.consecutiveErrors).toBe(1);
    });

    it("treats a typed RequestError 401 as an auth error and clears the cached client", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z", 2)]);
      ownerClient.getMatchStats.mockRejectedValue(
        new RequestError(new URL("https://halo"), new Response(null, { status: 401 })),
      );
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          startTime: now.toISOString(),
          searchStartTime: "2024-11-26T11:00:00.000Z",
          matchIds: [],
          discoveredMatches: {},
          errorState: { consecutiveErrors: 0, backoffMinutes: 3, lastSuccessTime: "old" },
        }),
      );

      await individualTrackerDO.alarm();
      await individualTrackerDO.alarm();

      expect(getClientForUser).toHaveBeenCalledTimes(2);
    });

    it("does not treat a non-401 RequestError as an auth error", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z", 2)]);
      ownerClient.getMatchStats.mockRejectedValue(
        new RequestError(new URL("https://halo"), new Response(null, { status: 500 })),
      );
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          startTime: now.toISOString(),
          searchStartTime: "2024-11-26T11:00:00.000Z",
          matchIds: [],
          discoveredMatches: {},
        }),
      );

      await individualTrackerDO.alarm();
      await individualTrackerDO.alarm();

      expect(getClientForUser).toHaveBeenCalledTimes(1);
    });

    it("sets lastMatchDiscoveredAt and resets errorState when new matches are found", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("match-new", "2024-11-26T11:30:00.000Z")]);
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          startTime: now.toISOString(),
          searchStartTime: "2024-11-26T11:00:00.000Z",
          errorState: { consecutiveErrors: 2, backoffMinutes: 10, lastSuccessTime: "old", lastErrorMessage: "boom" },
        }),
      );

      await individualTrackerDO.alarm();

      const persisted = lastPersistedState(storagePutSpy);
      expect(persisted.lastMatchDiscoveredAt).toBe(now.toISOString());
      expect(persisted.errorState.consecutiveErrors).toBe(0);
      expect(persisted.errorState.backoffMinutes).toBe(3);
      expect(persisted.errorState.lastErrorMessage).toBeUndefined();
    });

    it("does not set lastMatchDiscoveredAt when no new matches are found", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({ startTime: now.toISOString(), lastMatchDiscoveredAt: undefined }),
      );

      await individualTrackerDO.alarm();

      const persisted = lastPersistedState(storagePutSpy);
      expect(persisted.lastMatchDiscoveredAt).toBeUndefined();
    });

    it("auto-stops and deletes the alarm when idle beyond idleTimeoutHours", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          idleTimeoutHours: 6,
          startTime: "2024-11-26T05:00:00.000Z",
          lastMatchDiscoveredAt: "2024-11-26T05:00:00.000Z",
        }),
      );

      await individualTrackerDO.alarm();

      expect(storagePutSpy).toHaveBeenCalledWith(
        "individualTrackerState",
        expect.objectContaining({ status: "stopped" }),
      );
      expect(storageDeleteAlarmSpy).toHaveBeenCalled();
      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
      expect(ownerClient.getPlayerMatches).not.toHaveBeenCalled();
    });

    it("marks the registry row stopped when it auto-stops on idle timeout", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "idle-tracker", Status: "active" });
      vi.spyOn(services.databaseService, "getIndividualTracker").mockResolvedValue(row);
      const markSpy = vi.spyOn(services.individualTrackerService, "markTrackerStatus");
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          trackerId: "idle-tracker",
          idleTimeoutHours: 6,
          startTime: "2024-11-26T05:00:00.000Z",
          lastMatchDiscoveredAt: "2024-11-26T05:00:00.000Z",
        }),
      );

      await individualTrackerDO.alarm();

      expect(markSpy).toHaveBeenCalledWith(row, "stopped");
    });

    it("increments consecutiveErrors, grows backoff, reschedules at backoff and does not throw on poll failure", async () => {
      ownerClient.getPlayerMatches.mockRejectedValue(new Error("Halo unavailable"));
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          startTime: now.toISOString(),
          errorState: { consecutiveErrors: 0, backoffMinutes: 3, lastSuccessTime: "old" },
        }),
      );

      await expect(individualTrackerDO.alarm()).resolves.toBeUndefined();

      const persisted = lastPersistedState(storagePutSpy);
      expect(persisted.errorState.consecutiveErrors).toBe(1);
      expect(persisted.errorState.backoffMinutes).toBe(8);
      expect(persisted.errorState.lastErrorMessage).toBe("Halo unavailable");
      expect(storageSetAlarmSpy).toHaveBeenCalledWith(now.getTime() + 8 * 60 * 1000);
    });

    it("caps backoff at the maximum interval", async () => {
      ownerClient.getPlayerMatches.mockRejectedValue(new Error("still down"));
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          startTime: now.toISOString(),
          errorState: { consecutiveErrors: 5, backoffMinutes: 10, lastSuccessTime: "old" },
        }),
      );

      await individualTrackerDO.alarm();

      const persisted = lastPersistedState(storagePutSpy);
      expect(persisted.errorState.consecutiveErrors).toBe(6);
      expect(persisted.errorState.backoffMinutes).toBe(10);
    });

    it("mints the owner client via userTokenProvider.getClientForUser", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({ startTime: now.toISOString(), userId: "owner-123" }),
      );

      await individualTrackerDO.alarm();

      expect(getClientForUser).toHaveBeenCalledWith("owner-123");
    });

    it("treats a null client as a poll error (backoff) without crashing", async () => {
      getClientForUser.mockResolvedValue(null);
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ startTime: now.toISOString() }));

      await expect(individualTrackerDO.alarm()).resolves.toBeUndefined();

      const persisted = lastPersistedState(storagePutSpy);
      expect(persisted.errorState.consecutiveErrors).toBe(1);
      expect(storageSetAlarmSpy).toHaveBeenCalledWith(now.getTime() + 8 * 60 * 1000);
    });

    it("reuses the cached client across polls (getClientForUser not called every alarm)", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ startTime: now.toISOString() }));

      await individualTrackerDO.alarm();
      await individualTrackerDO.alarm();

      expect(getClientForUser).toHaveBeenCalledTimes(1);
      expect(ownerClient.getPlayerMatches).toHaveBeenCalledTimes(2);
    });

    it("clears the cached client on auth failure so the next poll re-mints", async () => {
      ownerClient.getPlayerMatches
        .mockRejectedValueOnce(new Error("401 Unauthorized: spartan token expired"))
        .mockResolvedValueOnce([]);
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ startTime: now.toISOString() }));

      await individualTrackerDO.alarm();
      await individualTrackerDO.alarm();

      expect(getClientForUser).toHaveBeenCalledTimes(2);
    });

    it("does nothing when state is absent", async () => {
      storageGetSpy.mockResolvedValue(null);

      await individualTrackerDO.alarm();

      expect(storagePutSpy).not.toHaveBeenCalled();
      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
      expect(getClientForUser).not.toHaveBeenCalled();
    });

    it("does nothing when paused", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ isPaused: true, status: "paused" }));

      await individualTrackerDO.alarm();

      expect(storagePutSpy).not.toHaveBeenCalled();
      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
      expect(getClientForUser).not.toHaveBeenCalled();
    });

    it("does nothing when stopped", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ status: "stopped" }));

      await individualTrackerDO.alarm();

      expect(storagePutSpy).not.toHaveBeenCalled();
      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
      expect(getClientForUser).not.toHaveBeenCalled();
    });
  });

  describe("websocket", () => {
    let webSocketAdapter: FakeWebSocketHibernationAdapter;

    beforeEach(() => {
      webSocketAdapter = aFakeWebSocketHibernationAdapter();
      individualTrackerDO = new IndividualTrackerDO(mockState, env, () => services, webSocketAdapter);
    });

    const wsRequest = (): Request =>
      new Request("http://do/websocket", { method: "GET", headers: { Upgrade: "websocket" } });

    it("returns 426 when the Upgrade header is missing", async () => {
      const response = await individualTrackerDO.fetch(new Request("http://do/websocket", { method: "GET" }));

      expect(response.status).toBe(426);
    });

    it("upgrades via the adapter and returns its response", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await individualTrackerDO.fetch(wsRequest());

      expect(response.headers.get("x-fake-upgrade")).toBe("websocket");
    });

    it("sends the current view as the initial message when state exists", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          trackerId: "t1",
          gamertag: "Tag1",
          status: "active",
          matchIds: ["m1"],
          discoveredMatches: {
            m1: aFakeIndividualTrackerMatchSummaryWith({
              matchId: "m1",
              startTime: "s",
              endTime: "e",
              mapAssetId: "map",
              mapVersionId: "map-v",
              mapName: "Streets",
              modeAssetId: "mode",
              gameVariantCategory: 6,
              outcome: "Win",
              score: "50:42",
            }),
          },
        }),
      );

      await individualTrackerDO.fetch(wsRequest());

      expect(webSocketAdapter.initialMessages).toHaveLength(1);
      const parsed = trackerViewMessageContract.parse(Preconditions.checkExists(webSocketAdapter.initialMessages[0]));
      expect(parsed.type).toBe("view");
      expect(parsed.view.trackerId).toBe("t1");
      expect(parsed.view.status).toBe("active");
      expect(parsed.view.matches).toHaveLength(1);
    });

    it("does not send an initial message when no state exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      await individualTrackerDO.fetch(wsRequest());

      expect(webSocketAdapter.initialMessages).toEqual([undefined]);
    });

    it("broadcasts the allowlisted view when a poll discovers a new match", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([
        aFakePlayerMatch("new-match", new Date("2024-11-26T12:30:00.000Z").toISOString()),
      ]);
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({ matchIds: [], searchStartTime: "2024-11-26T12:00:00.000Z" }),
      );

      await individualTrackerDO.alarm();

      expect(webSocketAdapter.broadcasts).toHaveLength(1);
      const parsed = trackerViewMessageContract.parse(Preconditions.checkExists(webSocketAdapter.broadcasts[0]));
      expect(parsed.type).toBe("view");
      expect(parsed.view.matches[0]?.matchId).toBe("new-match");
    });

    it("does not broadcast when a poll discovers no new match", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([]);
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ matchIds: [] }));

      await individualTrackerDO.alarm();

      expect(webSocketAdapter.broadcasts).toHaveLength(0);
    });

    it("does not broadcast on a steady-state poll where an already-enriched match is unchanged", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([aFakePlayerMatch("m1", "2024-11-26T11:30:00.000Z")]);
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          matchIds: ["m1"],
          searchStartTime: "2024-11-26T11:00:00.000Z",
          discoveredMatches: {
            m1: aFakeIndividualTrackerMatchSummaryWith({ matchId: "m1", teamOutcomes: [2, 3], mapName: "Aquarius" }),
          },
        }),
      );

      await individualTrackerDO.alarm();

      expect(webSocketAdapter.broadcasts).toHaveLength(0);
    });

    it("broadcasts a stopped view and closes sockets on stop", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ status: "active" }));

      await individualTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(webSocketAdapter.broadcasts).toHaveLength(1);
      const parsed = trackerViewMessageContract.parse(Preconditions.checkExists(webSocketAdapter.broadcasts[0]));
      expect(parsed.view.status).toBe("stopped");
      expect(webSocketAdapter.closes[0]?.code).toBe(1000);
    });

    it("closes sockets when the tracker auto-stops on idle timeout", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          status: "active",
          idleTimeoutHours: 6,
          startTime: "2024-11-26T05:00:00.000Z",
          lastMatchDiscoveredAt: "2024-11-26T05:00:00.000Z",
        }),
      );

      await individualTrackerDO.alarm();

      expect(webSocketAdapter.closes).toHaveLength(1);
    });

    it("ignores client messages and does not throw on close/error", () => {
      const ws = aFakeWebSocket();
      expect(() => {
        individualTrackerDO.webSocketMessage(ws, "hello");
        individualTrackerDO.webSocketClose(ws, 1000, "bye", true);
        individualTrackerDO.webSocketError(ws, new Error("boom"));
      }).not.toThrow();
    });
  });

  describe("topBarStats (G3)", () => {
    const trackedXuid = "9999999999";

    const aMatchStatsForTrackedPlayer = (matchId: string, coreStatsOverrides?: Partial<ReturnType<typeof aFakeCoreStatsWith>>): ReturnType<typeof aFakeMatchStatsWith> =>
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

    it("returns N/A for rank/esra slots (G4 deferred)", async () => {
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
});
