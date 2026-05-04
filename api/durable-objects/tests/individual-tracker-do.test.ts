import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
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

  beforeEach(() => {
    const { durableObjectState, mocks } = createMockDurableObjectState();
    individualTrackerDO = new IndividualTrackerDO(durableObjectState, env, installFakeServicesWith);

    storageGetSpy = vi.spyOn(mocks.storage, "get");
    storagePutSpy = vi.spyOn(mocks.storage, "put");
    storageSetAlarmSpy = vi.spyOn(mocks.storage, "setAlarm");

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
});
