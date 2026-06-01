import { describe, beforeEach, it, expect, vi, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { HaloInfiniteClient, PlayerMatchHistory } from "halo-infinite-api";
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
import { aFakeIndividualTrackerInternalStateWith } from "../fakes/individual-tracker-do.fake";

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

const aFakePlayerMatch = (matchId: string, startTime: string): PlayerMatchHistory =>
  ({
    MatchId: matchId,
    MatchInfo: {
      StartTime: startTime,
      EndTime: startTime,
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
    it("returns the allowlisted projection with matches in matchIds order", async () => {
      storageGetSpy.mockResolvedValue(
        aFakeIndividualTrackerInternalStateWith({
          gamertag: "ViewTag",
          status: "active",
          lastUpdateTime: "2024-11-26T12:00:00.000Z",
          lastMatchDiscoveredAt: "2024-11-26T11:55:00.000Z",
          matchIds: ["match-2", "match-1"],
          discoveredMatches: {
            "match-1": {
              matchId: "match-1",
              startTime: "2024-11-26T11:00:00.000Z",
              endTime: "2024-11-26T11:10:00.000Z",
              mapAssetId: "map-1",
              modeAssetId: "mode-1",
            },
            "match-2": {
              matchId: "match-2",
              startTime: "2024-11-26T11:30:00.000Z",
              endTime: "2024-11-26T11:40:00.000Z",
              mapAssetId: "map-2",
              modeAssetId: "mode-2",
            },
          },
        }),
      );

      const response = await individualTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerViewStateResponse = await response.json();
      expect(body.state?.gamertag).toBe("ViewTag");
      expect(body.state?.status).toBe("active");
      expect(body.state?.lastMatchDiscoveredAt).toBe("2024-11-26T11:55:00.000Z");
      expect(body.state?.matches.map((match) => match.matchId)).toEqual(["match-2", "match-1"]);
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
          ["gamertag", "lastMatchDiscoveredAt", "lastUpdateTime", "matches", "status", "trackerId"].sort(),
        );
      }
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
            "match-existing": {
              matchId: "match-existing",
              startTime: "2024-11-26T11:40:00.000Z",
              endTime: "2024-11-26T11:40:00.000Z",
              mapAssetId: "map-asset",
              modeAssetId: "mode-asset",
            },
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
        modeAssetId: "mode-asset",
      });
      expect(persisted.discoveredMatches).not.toHaveProperty("match-too-old");
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
            m1: { matchId: "m1", startTime: "s", endTime: "e", mapAssetId: "map", modeAssetId: "mode" },
          },
        }),
      );

      await individualTrackerDO.fetch(wsRequest());

      expect(webSocketAdapter.initialMessages).toHaveLength(1);
      const parsed = JSON.parse(Preconditions.checkExists(webSocketAdapter.initialMessages[0])) as {
        type: string;
        view: { trackerId: string; matches: unknown[]; status: string };
      };
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
      const parsed = JSON.parse(Preconditions.checkExists(webSocketAdapter.broadcasts[0])) as {
        type: string;
        view: { matches: { matchId: string }[]; isLive?: unknown };
      };
      expect(parsed.type).toBe("view");
      expect(parsed.view.matches[0]?.matchId).toBe("new-match");
      expect(parsed.view.isLive).toBeUndefined();
    });

    it("does not broadcast when a poll discovers no new match", async () => {
      ownerClient.getPlayerMatches.mockResolvedValue([]);
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ matchIds: [] }));

      await individualTrackerDO.alarm();

      expect(webSocketAdapter.broadcasts).toHaveLength(0);
    });

    it("broadcasts a stopped view and closes sockets on stop", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ status: "active" }));

      await individualTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(webSocketAdapter.broadcasts).toHaveLength(1);
      const parsed = JSON.parse(Preconditions.checkExists(webSocketAdapter.broadcasts[0])) as {
        type: string;
        view: { status: string };
      };
      expect(parsed.view.status).toBe("stopped");
      expect(webSocketAdapter.closes[0]?.code).toBe(1000);
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
});
