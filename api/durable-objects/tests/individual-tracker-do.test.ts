import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { addHours } from "date-fns";
import type {
  IndividualTrackerActiveNeatQueueSeries,
  IndividualTrackerNeatQueueSeriesData,
} from "@guilty-spark/shared/individual-tracker/types";
import { IndividualTrackerDO } from "../individual-tracker/individual-tracker-do";
import { aFakeEnvWith } from "../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../services/fakes/services";
import { aFakeIndividualTrackerStateWith } from "../individual-tracker/fakes/individual-tracker-do.fake";
import type { IndividualTrackerState } from "../individual-tracker/types";

const env = aFakeEnvWith();

const createMockSqlStorage = (): SqlStorage => {
  return {
    exec: vi.fn(),
    databaseSize: 0,
    Cursor: vi.fn() as never,
    Statement: vi.fn() as never,
  } satisfies SqlStorage;
};

const createMockDurableObjectState = (): {
  durableObjectState: DurableObjectState;
  mocks: { storage: DurableObjectStorage };
} => {
  const mockStorage: DurableObjectStorage = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    deleteAll: vi.fn(),
    setAlarm: vi.fn(),
    getAlarm: vi.fn(),
    deleteAlarm: vi.fn(),
    getBookmarkForTime: vi.fn(),
    getCurrentBookmark: vi.fn(),
    list: vi.fn(),
    onNextSessionRestoreBookmark: vi.fn(),
    sql: createMockSqlStorage(),
    sync: vi.fn(),
    transaction: vi.fn(),
    transactionSync: vi.fn(),
    kv: {} as DurableObjectStorage["kv"],
  };

  const durableObjectState: DurableObjectState = {
    storage: mockStorage,
    props: {},
    exports: {} as Cloudflare.Exports,
    abort: () => void 0,
    acceptWebSocket: () => void 0,
    blockConcurrencyWhile: async (callback) => callback(),
    getHibernatableWebSocketEventTimeout: () => 0,
    getTags: () => [],
    getWebSocketAutoResponse: () => null,
    getWebSocketAutoResponseTimestamp: () => null,
    getWebSockets: () => [],
    id: env.INDIVIDUAL_TRACKER_DO.newUniqueId(),
    setHibernatableWebSocketEventTimeout: () => void 0,
    setWebSocketAutoResponse: () => void 0,
    waitUntil: () => void 0,
  };

  return { durableObjectState, mocks: { storage: mockStorage } };
};

function buildHaloClientSpy(
  individualTrackerDO: IndividualTrackerDO,
): MockInstance<() => Promise<{ getPlayerMatches: (...args: unknown[]) => Promise<unknown[]> }>> {
  return vi.spyOn(
    individualTrackerDO as unknown as {
      buildHaloClientForUser: () => Promise<{ getPlayerMatches: (...args: unknown[]) => Promise<unknown[]> }>;
    },
    "buildHaloClientForUser",
  );
}

describe("IndividualTrackerDO", () => {
  let individualTrackerDO: IndividualTrackerDO;
  let trackerState: IndividualTrackerState;
  let storageGetSpy: MockInstance;
  let storagePutSpy: MockInstance;
  let storageSetAlarmSpy: MockInstance;
  let storageDeleteAlarmSpy: MockInstance;
  let storageDeleteAllSpy: MockInstance;

  beforeEach(() => {
    const { durableObjectState, mocks } = createMockDurableObjectState();
    individualTrackerDO = new IndividualTrackerDO(durableObjectState, env, installFakeServicesWith);

    storageGetSpy = vi.spyOn(mocks.storage, "get");
    storagePutSpy = vi.spyOn(mocks.storage, "put");
    storageSetAlarmSpy = vi.spyOn(mocks.storage, "setAlarm");
    storageDeleteAlarmSpy = vi.spyOn(mocks.storage, "deleteAlarm");
    storageDeleteAllSpy = vi.spyOn(mocks.storage, "deleteAll");

    trackerState = aFakeIndividualTrackerStateWith({
      searchStartTime: new Date(Date.now() - 60_000).toISOString(),
      lastMatchDiscoveredAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules the first alarm when starting a tracker", async () => {
    const request = new Request("https://example.com/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "user-1",
        trackerId: "tracker-1",
        xuid: "xuid-1",
        gamertag: "Chief",
        searchStartTime: new Date().toISOString(),
        idleTimeoutHours: 1,
        userMicrosoftAccessToken: "access-token",
        userMicrosoftRefreshToken: undefined,
      }),
    });

    const response = await individualTrackerDO.fetch(request);

    expect(response.status).toBe(200);
    expect(storageSetAlarmSpy).toHaveBeenCalledWith(expect.any(Number));
  });

  it("polls Halo on alarm, stores new matches, and reschedules", async () => {
    storageGetSpy.mockResolvedValue(trackerState);
    const getPlayerMatches = vi.fn(async () =>
      Promise.resolve([
        {
          MatchId: "match-1",
          MatchInfo: {
            StartTime: new Date().toISOString(),
            EndTime: new Date().toISOString(),
            MapVariant: { AssetId: "map-1" },
            UgcGameVariant: { AssetId: "mode-1" },
          },
        },
      ]),
    );
    const haloClientSpy = buildHaloClientSpy(individualTrackerDO);
    haloClientSpy.mockResolvedValue({
      getPlayerMatches,
    });

    await individualTrackerDO.alarm();

    expect(getPlayerMatches).toHaveBeenCalledWith(trackerState.xuid, expect.anything(), 25);
    expect(storageSetAlarmSpy).toHaveBeenCalledWith(expect.any(Number));
    expect(storagePutSpy).toHaveBeenCalled();

    const finalState = storagePutSpy.mock.calls.at(-1)?.[1] as IndividualTrackerState | undefined;
    expect(finalState?.matchIds).toContain("match-1");
    expect(finalState?.checkCount).toBe(1);
    expect(finalState?.refreshInProgress).toBe(false);
  });

  it("clears the refresh lock even when alarm rescheduling fails", async () => {
    storageGetSpy.mockResolvedValue(trackerState);
    const getPlayerMatches = vi.fn(async () => Promise.resolve([]));
    const haloClientSpy = buildHaloClientSpy(individualTrackerDO);
    haloClientSpy.mockResolvedValue({
      getPlayerMatches,
    });
    storageSetAlarmSpy.mockRejectedValueOnce(new Error("setAlarm failed"));

    await expect(individualTrackerDO.alarm()).resolves.toBeUndefined();

    const finalState = storagePutSpy.mock.calls.at(-1)?.[1] as IndividualTrackerState | undefined;
    expect(finalState?.refreshInProgress).toBe(false);
    expect(finalState?.refreshStartedAt).toBeUndefined();
  });

  it("disposes an idle tracker without rescheduling the alarm or rewriting state", async () => {
    trackerState = aFakeIndividualTrackerStateWith({
      startTime: addHours(new Date(), -2).toISOString(),
      lastMatchDiscoveredAt: addHours(new Date(), -2).toISOString(),
      idleTimeoutHours: 1,
    });
    storageGetSpy.mockResolvedValue(trackerState);

    await individualTrackerDO.alarm();

    expect(storageDeleteAlarmSpy).toHaveBeenCalledTimes(1);
    expect(storageDeleteAllSpy).toHaveBeenCalledTimes(1);
    expect(storageSetAlarmSpy).not.toHaveBeenCalled();
    expect(storagePutSpy).not.toHaveBeenCalled();
  });

  it("does not dispose a tracker before the timeout window has elapsed from start time", async () => {
    trackerState = aFakeIndividualTrackerStateWith({
      startTime: addHours(new Date(), -0.5).toISOString(),
      lastMatchDiscoveredAt: addHours(new Date(), -2).toISOString(),
      idleTimeoutHours: 1,
    });
    storageGetSpy.mockResolvedValue(trackerState);
    const getPlayerMatches = vi.fn(async () => Promise.resolve([]));
    const haloClientSpy = buildHaloClientSpy(individualTrackerDO);
    haloClientSpy.mockResolvedValue({
      getPlayerMatches,
    });

    await individualTrackerDO.alarm();

    expect(storageDeleteAlarmSpy).not.toHaveBeenCalled();
    expect(storageDeleteAllSpy).not.toHaveBeenCalled();
    expect(getPlayerMatches).toHaveBeenCalledWith(trackerState.xuid, expect.anything(), 25);
    expect(storageSetAlarmSpy).toHaveBeenCalledWith(expect.any(Number));
  });

  it("stores NeatQueue series metadata on a grouped series update", async () => {
    trackerState = aFakeIndividualTrackerStateWith({
      userId: "user-1",
      matchGroupings: [["match-1", "match-2"]],
    });
    storageGetSpy.mockResolvedValue(trackerState);

    const neatQueueSeriesData: IndividualTrackerNeatQueueSeriesData = {
      seriesId: {
        guildId: "guild-1",
        queueNumber: 7,
      },
      teams: [
        { name: "Eagle", playerIds: ["player-1", "player-2"] },
        { name: "Cobra", playerIds: ["player-3", "player-4"] },
      ],
      seriesScore: "2:1",
      matchIds: ["match-1", "match-2"],
      playersAssociationData: {
        "player-1": {
          discordId: "discord-1",
          discordName: "Player One",
          xboxId: "xuid-1",
          gamertag: "PlayerOne",
          currentRank: null,
          currentRankTier: null,
          currentRankSubTier: null,
          currentRankMeasurementMatchesRemaining: null,
          currentRankInitialMeasurementMatches: null,
          allTimePeakRank: null,
          esra: null,
          lastRankedGamePlayed: null,
        },
      },
      substitutions: [],
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
    };

    const response = await individualTrackerDO.fetch(
      new Request("https://example.com/series-groups-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user-1",
          matchIds: ["match-1", "match-2"],
          titleOverride: "Guild Name",
          subtitleOverride: "Queue #7",
          neatQueueSeriesData,
        }),
      }),
    );

    expect(response.status).toBe(200);

    const finalState = storagePutSpy.mock.calls.at(-1)?.[1] as IndividualTrackerState | undefined;
    expect(finalState?.seriesGroups).toEqual([
      {
        matchIds: ["match-1", "match-2"],
        titleOverride: "Guild Name",
        subtitleOverride: "Queue #7",
        neatQueueSeriesData,
      },
    ]);
  });

  it("stores active NeatQueue series metadata", async () => {
    trackerState = aFakeIndividualTrackerStateWith({
      userId: "user-1",
    });
    storageGetSpy.mockResolvedValue(trackerState);

    const activeNeatQueueSeries: IndividualTrackerActiveNeatQueueSeries = {
      titleOverride: "Guild Name",
      subtitleOverride: "Queue #7",
      neatQueueSeriesData: {
        seriesId: {
          guildId: "guild-1",
          queueNumber: 7,
        },
        teams: [
          { name: "Eagle", playerIds: ["player-1", "player-2"] },
          { name: "Cobra", playerIds: ["player-3", "player-4"] },
        ],
        seriesScore: "0:0",
        matchIds: [],
        playersAssociationData: {},
        substitutions: [],
        startTime: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
      },
    };

    const response = await individualTrackerDO.fetch(
      new Request("https://example.com/neatqueue-series-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user-1",
          activeNeatQueueSeries,
        }),
      }),
    );

    expect(response.status).toBe(200);

    const finalState = storagePutSpy.mock.calls.at(-1)?.[1] as IndividualTrackerState | undefined;
    expect(finalState?.activeNeatQueueSeries).toEqual(activeNeatQueueSeries);
  });
});
