import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as HaloInfiniteApi from "halo-infinite-api";
import { AutoTokenProvider, HaloInfiniteClient } from "halo-infinite-api";
import { aFakeEnvWith } from "../../base/fakes/env.fake";
import { aFakeDurableObjectId } from "../fakes/live-tracker-do.fake";
import { IndividualTrackerDO } from "../individual-tracker/individual-tracker-do";
import { installFakeServicesWith } from "../../services/fakes/services";
import { aFakeUserSessionsRow } from "../../services/database/fakes/database.fake";
import { TokenEncryptor } from "../../services/auth/token-encryptor";
import type { IndividualTrackerState } from "../individual-tracker/types";

let observedAccessToken: string | undefined;

vi.mock("halo-infinite-api", async (importOriginal) => {
  const actual = await importOriginal<typeof HaloInfiniteApi>();
  return {
    ...actual,
    AutoTokenProvider: vi.fn(function (this: { callback: () => Promise<string> }, callback: () => Promise<string>) {
      this.callback = callback;
    }),
    HaloInfiniteClient: vi.fn(function (this: { getPlayerMatches: () => Promise<unknown[]> }, provider: unknown) {
      this.getPlayerMatches = async (): Promise<unknown[]> => {
        observedAccessToken = await (provider as { callback: () => Promise<string> }).callback();
        return [];
      };
    }),
  };
});

function createTrackerState(overrides: Partial<IndividualTrackerState> = {}): IndividualTrackerState {
  return {
    userId: "user-1",
    trackerId: "tracker-1",
    xuid: "xuid-1",
    gamertag: "gamertag-1",
    status: "active",
    isPaused: false,
    startTime: new Date().toISOString(),
    lastUpdateTime: new Date().toISOString(),
    searchStartTime: new Date().toISOString(),
    lastMatchDiscoveredAt: new Date().toISOString(),
    checkCount: 0,
    idleTimeoutHours: 1,
    discoveredMatches: {},
    matchIds: [],
    excludedMatchIds: [],
    errorState: {
      consecutiveErrors: 0,
      backoffMinutes: 3,
      lastSuccessTime: new Date().toISOString(),
    },
    refreshInProgress: undefined,
    refreshStartedAt: undefined,
    ...overrides,
  };
}

function createMockDurableObjectState(): {
  durableObjectState: DurableObjectState;
  mocks: {
    storage: DurableObjectStorage;
  };
} {
  const storage: DurableObjectStorage = {
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
    sql: {
      exec: vi.fn(),
      databaseSize: 0,
      Cursor: vi.fn() as never,
      Statement: vi.fn() as never,
    } satisfies SqlStorage,
    sync: vi.fn(),
    transaction: vi.fn(),
    transactionSync: vi.fn(),
    kv: {} as DurableObjectStorage["kv"],
  };

  const durableObjectState: DurableObjectState = {
    storage,
    props: {},
    exports: {} as Cloudflare.Exports,
    abort: () => void 0,
    acceptWebSocket: () => void 0,
    blockConcurrencyWhile: async (callback) => await callback(),
    getHibernatableWebSocketEventTimeout: () => 0,
    getTags: () => [],
    getWebSocketAutoResponse: () => null,
    getWebSocketAutoResponseTimestamp: () => null,
    getWebSockets: () => [],
    id: aFakeDurableObjectId(),
    setHibernatableWebSocketEventTimeout: () => void 0,
    setWebSocketAutoResponse: () => void 0,
    waitUntil: () => void 0,
    facets: {
      get: vi.fn(),
      abort: () => void 0,
      delete: () => void 0,
    },
  };

  return { durableObjectState, mocks: { storage } };
}

describe("IndividualTrackerDO", () => {
  beforeEach(() => {
    observedAccessToken = undefined;
    vi.mocked(AutoTokenProvider).mockClear();
    vi.mocked(HaloInfiniteClient).mockClear();
  });

  it("decrypts the persisted session access token during alarm refresh", async () => {
    const env = aFakeEnvWith();
    const services = installFakeServicesWith({ env });
    const encryptor = new TokenEncryptor(env.TOKEN_ENCRYPTION_SECRET);
    const encryptedAccessToken = await encryptor.encrypt("plain-access-token");
    const trackerState = createTrackerState();
    const { durableObjectState, mocks } = createMockDurableObjectState();
    const storageGetSpy = vi.spyOn(mocks.storage, "get");
    const findUserSessionByUserIdSpy = vi
      .spyOn(services.databaseService, "findUserSessionByUserId")
      .mockResolvedValue(aFakeUserSessionsRow({ UserId: "user-1", AccessToken: encryptedAccessToken }));

    storageGetSpy.mockResolvedValue(trackerState as never);

    const individualTrackerDo = new IndividualTrackerDO(durableObjectState, env, () => services);

    await individualTrackerDo.alarm();

    expect(observedAccessToken).toBe("plain-access-token");
    expect(findUserSessionByUserIdSpy).toHaveBeenCalledWith("user-1");
    expect(vi.mocked(HaloInfiniteClient)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(AutoTokenProvider)).toHaveBeenCalledTimes(1);
  });

  it("does not build a halo client when the tracker is stopped", async () => {
    const env = aFakeEnvWith();
    const services = installFakeServicesWith({ env });
    const trackerState = createTrackerState({ status: "stopped" });
    const { durableObjectState, mocks } = createMockDurableObjectState();
    const storageGetSpy = vi.spyOn(mocks.storage, "get");
    storageGetSpy.mockResolvedValue(trackerState as never);
    const storageDeleteAlarmSpy = vi.spyOn(mocks.storage, "deleteAlarm");
    const storageDeleteAllSpy = vi.spyOn(mocks.storage, "deleteAll");
    const findUserSessionByUserIdSpy = vi
      .spyOn(services.databaseService, "findUserSessionByUserId")
      .mockResolvedValue(aFakeUserSessionsRow({ UserId: "user-1", AccessToken: "enc-v1.stopped-token" }));

    const individualTrackerDo = new IndividualTrackerDO(durableObjectState, env, () => services);

    await individualTrackerDo.alarm();

    expect(observedAccessToken).toBeUndefined();
    expect(findUserSessionByUserIdSpy).not.toHaveBeenCalled();
    expect(vi.mocked(HaloInfiniteClient)).not.toHaveBeenCalled();
    expect(vi.mocked(AutoTokenProvider)).not.toHaveBeenCalled();
    expect(storageDeleteAlarmSpy).toHaveBeenCalled();
    expect(storageDeleteAllSpy).toHaveBeenCalled();
  });
});
