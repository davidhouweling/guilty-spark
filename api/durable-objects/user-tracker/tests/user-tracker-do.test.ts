import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  userTrackerDirectoryMessageContract,
  userTrackerStatusContract,
  userTrackerViewStateContract,
} from "@guilty-spark/shared/contracts/durable-objects/user-tracker/management";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UserTrackerDO } from "../user-tracker-do";
import {
  aFakeDurableObjectNamespaceWith,
  aFakeDurableObjectStateWith,
  aFakeDurableObjectStorageWith,
} from "../../../base/fakes/do.fake";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeLogServiceWith } from "../../../services/log/fakes/log.fake";
import {
  aFakeIndividualTrackerDOWith,
  aFakeIndividualTrackerViewStateWith,
} from "../../individual-tracker/fakes/individual-tracker-do.fake";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import {
  aFakeWebSocketHibernationAdapter,
  type FakeWebSocketHibernationAdapter,
} from "../../../base/fakes/websocket-hibernation-adapter.fake";

describe("UserTrackerDO", () => {
  let userTrackerDO: UserTrackerDO;
  let env: Env;
  let mockState: DurableObjectState & { storage: DurableObjectStorage };
  let webSocketAdapter: FakeWebSocketHibernationAdapter;
  let setAlarmMock: typeof mockState.storage.setAlarm;
  let deleteAlarmMock: typeof mockState.storage.deleteAlarm;

  beforeEach(() => {
    env = aFakeEnvWith();
    setAlarmMock = vi.fn<DurableObjectStorage["setAlarm"]>();
    deleteAlarmMock = vi.fn<DurableObjectStorage["deleteAlarm"]>();
    mockState = aFakeDurableObjectStateWith({
      storage: aFakeDurableObjectStorageWith({
        setAlarm: setAlarmMock,
        deleteAlarm: deleteAlarmMock,
      }),
    });
    webSocketAdapter = aFakeWebSocketHibernationAdapter();
    userTrackerDO = new UserTrackerDO(mockState, env, installFakeServicesWith, webSocketAdapter);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 404 for unknown endpoints", async () => {
    const response = await userTrackerDO.fetch(new Request("http://do/unknown", { method: "GET" }));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("Not Found");
  });

  it("returns null state for status when no state is stored", async () => {
    const response = await userTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

    expect(response.status).toBe(200);
    await expect(userTrackerStatusContract.fromResponse(response)).resolves.toEqual({ state: null });
  });

  it("routes status requests by final action segment", async () => {
    const response = await userTrackerDO.fetch(new Request("http://do/user-tracker/status", { method: "GET" }));

    expect(response.status).toBe(200);
    await expect(userTrackerStatusContract.fromResponse(response)).resolves.toEqual({ state: null });
  });

  it("returns null state for view-state when no state is stored", async () => {
    const response = await userTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));

    expect(response.status).toBe(200);
    await expect(userTrackerViewStateContract.fromResponse(response)).resolves.toEqual({ state: null });
  });

  it("builds view-state on demand when userId is passed in the request", async () => {
    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
        }),
      },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    const findTrackersByUserIdSpy = vi.spyOn(services.databaseService, "findIndividualTrackersByUserId");
    findTrackersByUserIdSpy.mockResolvedValue([
      aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "active",
        IsLive: 1,
      }),
    ]);
    const localUserTrackerDO = new UserTrackerDO(mockState, localEnv, () => services, webSocketAdapter);

    const response = await localUserTrackerDO.fetch(
      new Request("http://do/view-state?userId=%20user-1%20", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    const parsed = await userTrackerViewStateContract.fromResponse(response);
    expect(parsed.state?.userId).toBe("user-1");
    expect(findTrackersByUserIdSpy).toHaveBeenCalledWith("user-1");
    expect(parsed.state?.directory.liveTrackerId).toBe("t1");
    expect(parsed.state?.directory.trackers).toHaveLength(1);
  });

  it("filters stopped trackers, keeps paused trackers, and selects liveTrackerId from included trackers", async () => {
    const trackerDo = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([
      aFakeIndividualTrackersRow({
        TrackerId: "t-active",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "active",
        IsLive: 1,
      }),
      aFakeIndividualTrackersRow({
        TrackerId: "t-paused",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "paused",
        IsLive: 0,
      }),
      aFakeIndividualTrackersRow({
        TrackerId: "t-stopped",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "stopped",
        IsLive: 1,
      }),
    ]);
    const localUserTrackerDO = new UserTrackerDO(mockState, localEnv, () => services, webSocketAdapter);

    const response = await localUserTrackerDO.fetch(
      new Request("http://do/view-state?userId=user-1", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    const parsed = await userTrackerViewStateContract.fromResponse(response);
    expect(parsed.state?.directory.trackers.map((tracker) => tracker.trackerId)).toEqual(["t-active", "t-paused"]);
    expect(parsed.state?.directory.liveTrackerId).toBe("t-active");
  });

  it("refreshes only dirty tracker entries after nudge when a cached directory exists", async () => {
    const persistedStorage = new Map<string, unknown>();
    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
    });

    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
          lastUpdateTime: "2026-07-05T00:00:00.000Z",
        }),
      },
    });
    const trackerDoFetchSpy = vi.spyOn(trackerDo, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([
      aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "active",
        IsLive: 1,
      }),
      aFakeIndividualTrackersRow({
        TrackerId: "t2",
        UserId: "user-1",
        Gamertag: "KnownTag2",
        Status: "active",
        IsLive: 0,
      }),
    ]);
    const state = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const localUserTrackerDO = new UserTrackerDO(state, localEnv, () => services, webSocketAdapter);

    const initialResponse = await localUserTrackerDO.fetch(
      new Request("http://do/view-state?userId=user-1", { method: "GET" }),
    );
    expect(initialResponse.status).toBe(200);
    expect(trackerDoFetchSpy).toHaveBeenCalledTimes(2);

    const nudgeResponse = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-05T00:01:00.000Z",
        }),
      }),
    );
    expect(nudgeResponse.status).toBe(200);

    await vi.waitFor(() => {
      expect(trackerDoFetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  it("adds non-stopped trackers missing from cached directory during incremental refresh", async () => {
    const persistedStorage = new Map<string, unknown>();
    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
    });

    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
          lastUpdateTime: "2026-07-05T00:00:00.000Z",
        }),
      },
    });
    const trackerDoFetchSpy = vi.spyOn(trackerDo, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId")
      .mockResolvedValueOnce([
        aFakeIndividualTrackersRow({
          TrackerId: "t1",
          UserId: "user-1",
          Gamertag: "KnownTag",
          Status: "active",
          IsLive: 1,
        }),
      ])
      .mockResolvedValue([
        aFakeIndividualTrackersRow({
          TrackerId: "t1",
          UserId: "user-1",
          Gamertag: "KnownTag",
          Status: "active",
          IsLive: 1,
        }),
        aFakeIndividualTrackersRow({
          TrackerId: "t2",
          UserId: "user-1",
          Gamertag: "KnownTag2",
          Status: "active",
          IsLive: 0,
        }),
      ]);
    const state = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const localUserTrackerDO = new UserTrackerDO(state, localEnv, () => services, webSocketAdapter);

    const initialResponse = await localUserTrackerDO.fetch(
      new Request("http://do/view-state?userId=user-1", { method: "GET" }),
    );
    expect(initialResponse.status).toBe(200);
    expect(trackerDoFetchSpy).toHaveBeenCalledTimes(1);

    const nudgeResponse = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-05T00:01:00.000Z",
        }),
      }),
    );
    expect(nudgeResponse.status).toBe(200);

    await vi.waitFor(() => {
      expect(trackerDoFetchSpy).toHaveBeenCalledTimes(3);
    });

    const refreshedResponse = await localUserTrackerDO.fetch(new Request("http://do/view-state", { method: "GET" }));
    expect(refreshedResponse.status).toBe(200);
    const refreshed = await userTrackerViewStateContract.fromResponse(refreshedResponse);
    expect(refreshed.state?.directory.trackers.map((tracker) => tracker.trackerId)).toEqual(["t1", "t2"]);
  });

  it("restores consumed dirty tracker ids when directory refresh fails", async () => {
    const persistedStorage = new Map<string, unknown>();
    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
    });

    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
          lastUpdateTime: "2026-07-05T00:00:00.000Z",
        }),
      },
    });
    const trackerDoFetchSpy = vi.spyOn(trackerDo, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    const findTrackersByUserIdSpy = vi.spyOn(services.databaseService, "findIndividualTrackersByUserId");
    findTrackersByUserIdSpy
      .mockResolvedValueOnce([
        aFakeIndividualTrackersRow({
          TrackerId: "t1",
          UserId: "user-1",
          Gamertag: "KnownTag",
          Status: "active",
          IsLive: 1,
        }),
      ])
      .mockRejectedValueOnce(new Error("rebuild failed"))
      .mockResolvedValueOnce([
        aFakeIndividualTrackersRow({
          TrackerId: "t1",
          UserId: "user-1",
          Gamertag: "KnownTag",
          Status: "active",
          IsLive: 1,
        }),
      ]);
    const state = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const localUserTrackerDO = new UserTrackerDO(state, localEnv, () => services, webSocketAdapter);

    const initialResponse = await localUserTrackerDO.fetch(
      new Request("http://do/view-state?userId=user-1", { method: "GET" }),
    );
    expect(initialResponse.status).toBe(200);
    expect(trackerDoFetchSpy).toHaveBeenCalledTimes(1);

    const nudgeResponse = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-05T00:01:00.000Z",
        }),
      }),
    );
    expect(nudgeResponse.status).toBe(200);

    await vi.waitFor(() => {
      expect(findTrackersByUserIdSpy).toHaveBeenCalledTimes(2);
    });

    const secondNudgeResponse = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-05T00:02:00.000Z",
        }),
      }),
    );
    expect(secondNudgeResponse.status).toBe(200);

    await vi.waitFor(() => {
      expect(findTrackersByUserIdSpy).toHaveBeenCalledTimes(3);
    });

    await vi.waitFor(() => {
      expect(trackerDoFetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("falls back to full rebuild when stats highlight slots change", async () => {
    const persistedStorage = new Map<string, unknown>();
    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
    });

    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
          lastUpdateTime: "2026-07-05T00:00:00.000Z",
        }),
      },
    });
    const trackerDoFetchSpy = vi.spyOn(trackerDo, "fetch");
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([
      aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "active",
        IsLive: 1,
      }),
      aFakeIndividualTrackersRow({
        TrackerId: "t2",
        UserId: "user-1",
        Gamertag: "KnownTag2",
        Status: "active",
        IsLive: 0,
      }),
    ]);
    const getSettingsForViewSpy = vi.spyOn(services.individualTrackerService, "getSettingsForView");
    getSettingsForViewSpy
      .mockResolvedValueOnce({
        visibleSections: {
          statsHighlightSlots: ["kills", "deaths"],
        },
      })
      .mockResolvedValueOnce({
        visibleSections: {
          statsHighlightSlots: ["assists", "kda"],
        },
      });

    const state = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const localUserTrackerDO = new UserTrackerDO(state, localEnv, () => services, webSocketAdapter);

    const initialResponse = await localUserTrackerDO.fetch(
      new Request("http://do/view-state?userId=user-1", { method: "GET" }),
    );
    expect(initialResponse.status).toBe(200);
    expect(trackerDoFetchSpy).toHaveBeenCalledTimes(2);

    const nudgeResponse = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-05T00:01:00.000Z",
        }),
      }),
    );
    expect(nudgeResponse.status).toBe(200);

    await vi.waitFor(() => {
      expect(trackerDoFetchSpy).toHaveBeenCalledTimes(4);
    });
  });

  it("accepts a valid tracker changed nudge payload", async () => {
    const response = await userTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "u1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-03T00:00:00.000Z",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("deduplicates repeated tracker nudges with the same marker", async () => {
    const persistedStorage = new Map<string, unknown>();
    persistedStorage.set("userTrackerState", {
      state: {
        userId: "user-1",
        lastUpdateTime: "2026-07-04T00:00:00.000Z",
      },
      viewState: null,
    });

    let markerWriteCount = 0;
    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        if (key === "userTrackerMarkers") {
          markerWriteCount += 1;
        }

        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
    });

    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
          lastUpdateTime: "2026-07-04T00:00:00.000Z",
        }),
      },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([
      aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "active",
        IsLive: 1,
      }),
    ]);
    const state = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const localUserTrackerDO = new UserTrackerDO(state, localEnv, () => services, webSocketAdapter);

    const payload = {
      userId: "user-1",
      trackerId: "t1",
      lastUpdateTime: "2026-07-04T00:00:00.000Z",
    };

    const firstResponse = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(secondResponse.status).toBe(200);

    expect(markerWriteCount).toBe(1);
    expect(persistedStorage.get("userTrackerMarkers")).toEqual([["user-1:t1", "2026-07-04T00:00:00.000Z"]]);
  });

  it("deduplicates stale tracker nudges after a DO restart", async () => {
    const persistedStorage = new Map<string, unknown>();
    persistedStorage.set("userTrackerState", {
      state: {
        userId: "user-1",
        lastUpdateTime: "2026-07-04T00:00:00.000Z",
      },
      viewState: null,
    });

    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
    });

    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
          lastUpdateTime: "2026-07-04T00:00:00.000Z",
        }),
      },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    const findTrackersByUserIdSpy = vi.spyOn(services.databaseService, "findIndividualTrackersByUserId");
    findTrackersByUserIdSpy.mockResolvedValue([
      aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "active",
        IsLive: 1,
      }),
    ]);

    const stateForFirstInstance = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const firstInstance = new UserTrackerDO(stateForFirstInstance, localEnv, () => services, webSocketAdapter);
    const nudgePayload = {
      userId: "user-1",
      trackerId: "t1",
      lastUpdateTime: "2026-07-04T00:00:00.000Z",
    };

    const firstResponse = await firstInstance.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify(nudgePayload),
      }),
    );
    expect(firstResponse.status).toBe(200);

    await vi.waitFor(() => {
      expect(findTrackersByUserIdSpy.mock.calls.length).toBeGreaterThan(0);
    });
    const callsAfterFirstInstanceNudge = findTrackersByUserIdSpy.mock.calls.length;

    const stateForSecondInstance = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const secondInstance = new UserTrackerDO(stateForSecondInstance, localEnv, () => services, webSocketAdapter);
    const secondResponse = await secondInstance.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify(nudgePayload),
      }),
    );
    expect(secondResponse.status).toBe(200);

    const markersAfterSecondNudge = persistedStorage.get("userTrackerMarkers");
    expect(markersAfterSecondNudge).toEqual([["user-1:t1", "2026-07-04T00:00:00.000Z"]]);
    expect(findTrackersByUserIdSpy.mock.calls.length).toBe(callsAfterFirstInstanceNudge);
  });

  it("accepts a newer marker when timestamps are not lexicographically ordered", async () => {
    const persistedStorage = new Map<string, unknown>();
    persistedStorage.set("userTrackerState", {
      state: {
        userId: "user-1",
        lastUpdateTime: "2026-07-04T00:00:00.000Z",
      },
      viewState: null,
    });

    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
    });

    const localEnv = aFakeEnvWith();
    const state = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const localUserTrackerDO = new UserTrackerDO(state, localEnv, installFakeServicesWith, webSocketAdapter);

    const firstResponse = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-04T00:00:00+02:00",
        }),
      }),
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-03T23:30:00Z",
        }),
      }),
    );
    expect(secondResponse.status).toBe(200);

    expect(persistedStorage.get("userTrackerMarkers")).toEqual([["user-1:t1", "2026-07-03T23:30:00Z"]]);
  });

  it("persists the latest marker when nudges overlap", async () => {
    const persistedStorage = new Map<string, unknown>();
    persistedStorage.set("userTrackerState", {
      state: {
        userId: "user-1",
        lastUpdateTime: "2026-07-04T00:00:00.000Z",
      },
      viewState: null,
    });

    let releaseFirstMarkerWrite: () => void = () => {
      // replaced when first marker write blocks
    };
    let firstMarkerWriteBlocked = false;
    let markerWriteCount = 0;
    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        if (key === "userTrackerMarkers") {
          markerWriteCount += 1;
          if (markerWriteCount === 1) {
            await new Promise<void>((resolve) => {
              firstMarkerWriteBlocked = true;
              releaseFirstMarkerWrite = resolve;
            });
          }
        }

        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
    });

    const localEnv = aFakeEnvWith();
    const state = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const localUserTrackerDO = new UserTrackerDO(state, localEnv, installFakeServicesWith, webSocketAdapter);

    const firstNudgePromise = localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-04T00:00:00.000Z",
        }),
      }),
    );

    await vi.waitFor(() => {
      expect(firstMarkerWriteBlocked).toBe(true);
    });

    const secondNudgePromise = localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          trackerId: "t1",
          lastUpdateTime: "2026-07-04T00:01:00.000Z",
        }),
      }),
    );

    releaseFirstMarkerWrite();
    const [firstNudgeResponse, secondNudgeResponse] = await Promise.all([firstNudgePromise, secondNudgePromise]);
    expect(firstNudgeResponse.status).toBe(200);
    expect(secondNudgeResponse.status).toBe(200);

    const storedMarkers = persistedStorage.get("userTrackerMarkers");
    expect(storedMarkers).toEqual([["user-1:t1", "2026-07-04T00:01:00.000Z"]]);
  });

  it("ignores nudges when payload userId does not match stored userId", async () => {
    const persistedStorage = new Map<string, unknown>();
    persistedStorage.set("userTrackerState", {
      state: {
        userId: "user-1",
        lastUpdateTime: "2026-07-04T00:00:00.000Z",
      },
      viewState: null,
    });

    let markerWriteCount = 0;
    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        if (key === "userTrackerMarkers") {
          markerWriteCount += 1;
        }

        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
    });

    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
        }),
      },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([
      aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "active",
        IsLive: 1,
      }),
    ]);
    const state = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const localUserTrackerDO = new UserTrackerDO(state, localEnv, () => services, webSocketAdapter);

    const response = await localUserTrackerDO.fetch(
      new Request("http://do/nudge", {
        method: "POST",
        body: JSON.stringify({
          userId: "different-user",
          trackerId: "t1",
          lastUpdateTime: "2026-07-04T00:00:00.000Z",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    expect(markerWriteCount).toBe(0);
    expect(persistedStorage.get("userTrackerMarkers")).toBeUndefined();
  });

  it("returns 405 when nudge is called with a non-POST method", async () => {
    const response = await userTrackerDO.fetch(new Request("http://do/nudge", { method: "GET" }));

    expect(response.status).toBe(405);
    await expect(response.text()).resolves.toBe("Method Not Allowed");
  });

  it("rejects websocket endpoint when request is not an upgrade", async () => {
    const response = await userTrackerDO.fetch(new Request("http://do/websocket", { method: "GET" }));

    expect(response.status).toBe(426);
    await expect(response.text()).resolves.toBe("Expected WebSocket upgrade");
  });

  it("returns 400 for websocket upgrades without stored or requested userId", async () => {
    const response = await userTrackerDO.fetch(
      new Request("http://do/websocket", {
        method: "GET",
        headers: { Upgrade: "websocket" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Missing userId");
    expect(webSocketAdapter.initialMessages).toHaveLength(0);
    expect(setAlarmMock).not.toHaveBeenCalled();
  });

  it("builds websocket initial directory message when userId is passed in the request", async () => {
    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
        }),
      },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId").mockResolvedValue([
      aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Gamertag: "KnownTag",
        Status: "active",
        IsLive: 1,
      }),
    ]);
    const localUserTrackerDO = new UserTrackerDO(mockState, localEnv, () => services, webSocketAdapter);

    const response = await localUserTrackerDO.fetch(
      new Request("http://do/websocket?userId=user-1", {
        method: "GET",
        headers: { Upgrade: "websocket" },
      }),
    );

    expect(response.status).toBe(200);
    const initialMessage = Preconditions.checkExists(
      webSocketAdapter.initialMessages.at(-1),
      "expected websocket upgrade to include a built directory message",
    );
    const parsed = userTrackerDirectoryMessageContract.parse(initialMessage);
    expect(parsed.directory.liveTrackerId).toBe("t1");
    expect(parsed.directory.trackers).toHaveLength(1);
    expect(setAlarmMock).toHaveBeenCalledOnce();
  });

  it("deletes the scheduled alarm when the last websocket closes", async () => {
    vi.spyOn(mockState, "getWebSockets").mockReturnValue([]);

    await userTrackerDO.webSocketClose({} as WebSocket, 1000, "bye", true);

    expect(deleteAlarmMock).toHaveBeenCalledOnce();
  });

  it("refreshes and reschedules through the DO alarm API when websocket clients are connected", async () => {
    const trackerDo = aFakeIndividualTrackerDOWith({
      viewStateResponse: {
        state: aFakeIndividualTrackerViewStateWith({
          trackerId: "t1",
          gamertag: "KnownTag",
          matches: [],
        }),
      },
    });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    vi.spyOn(mockState, "getWebSockets").mockReturnValue([{} as WebSocket]);
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId")
      .mockResolvedValueOnce([
        aFakeIndividualTrackersRow({
          TrackerId: "t1",
          UserId: "user-1",
          Gamertag: "KnownTag",
          Status: "active",
          IsLive: 1,
        }),
      ])
      .mockResolvedValueOnce([
        aFakeIndividualTrackersRow({
          TrackerId: "t1",
          UserId: "user-1",
          Gamertag: "KnownTag",
          Status: "active",
          IsLive: 1,
        }),
      ]);
    const localUserTrackerDO = new UserTrackerDO(mockState, localEnv, () => services, webSocketAdapter);

    await localUserTrackerDO.fetch(new Request("http://do/view-state?userId=user-1", { method: "GET" }));
    await localUserTrackerDO.alarm();

    expect(setAlarmMock).toHaveBeenCalledTimes(1);
  });

  it("reconciles through alarm when no websocket clients are connected but state exists", async () => {
    const persistedStorage = new Map<string, unknown>();
    let alarmTime: number | null = null;
    const localSetAlarmMock = vi.fn<DurableObjectStorage["setAlarm"]>(async (scheduledTime) => {
      alarmTime = typeof scheduledTime === "number" ? scheduledTime : scheduledTime.getTime();
      return Promise.resolve();
    });
    const localGetAlarmMock = vi.fn<DurableObjectStorage["getAlarm"]>(async () => {
      return Promise.resolve(alarmTime);
    });
    const localDeleteAlarmMock = vi.fn<DurableObjectStorage["deleteAlarm"]>(async () => {
      alarmTime = null;
      return Promise.resolve();
    });
    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
      setAlarm: localSetAlarmMock,
      getAlarm: localGetAlarmMock,
      deleteAlarm: localDeleteAlarmMock,
    });
    const localState = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const trackerDo = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const services = installFakeServicesWith({ env: localEnv });
    vi.spyOn(localState, "getWebSockets").mockReturnValue([]);
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId")
      .mockResolvedValueOnce([
        aFakeIndividualTrackersRow({
          TrackerId: "t1",
          UserId: "user-1",
          Gamertag: "KnownTag",
          Status: "active",
          IsLive: 1,
        }),
      ])
      .mockResolvedValueOnce([
        aFakeIndividualTrackersRow({
          TrackerId: "t1",
          UserId: "user-1",
          Gamertag: "KnownTag",
          Status: "stopped",
          IsLive: 1,
        }),
      ]);
    const localUserTrackerDO = new UserTrackerDO(localState, localEnv, () => services, webSocketAdapter);

    const initialResponse = await localUserTrackerDO.fetch(
      new Request("http://do/view-state?userId=user-1", { method: "GET" }),
    );
    const initialPayload = await userTrackerViewStateContract.fromResponse(initialResponse);
    expect(initialPayload.state?.directory.trackers).toHaveLength(1);
    expect(localSetAlarmMock).toHaveBeenCalledOnce();

    alarmTime = null;
    await localUserTrackerDO.alarm();

    const reconciledResponse = await localUserTrackerDO.fetch(
      new Request("http://do/view-state?userId=user-1", { method: "GET" }),
    );
    const reconciledPayload = await userTrackerViewStateContract.fromResponse(reconciledResponse);
    expect(reconciledPayload.state?.directory.trackers).toHaveLength(0);
    expect(localSetAlarmMock).toHaveBeenCalledTimes(2);
    expect(localDeleteAlarmMock).not.toHaveBeenCalled();
  });

  it("re-arms reconcile alarm and logs directory refresh failures when rebuild fails transiently", async () => {
    const persistedStorage = new Map<string, unknown>();
    let alarmTime: number | null = null;
    const localSetAlarmMock = vi.fn<DurableObjectStorage["setAlarm"]>(async (scheduledTime) => {
      alarmTime = typeof scheduledTime === "number" ? scheduledTime : scheduledTime.getTime();
      return Promise.resolve();
    });
    const localGetAlarmMock = vi.fn<DurableObjectStorage["getAlarm"]>(async () => {
      return Promise.resolve(alarmTime);
    });
    const localDeleteAlarmMock = vi.fn<DurableObjectStorage["deleteAlarm"]>(async () => {
      alarmTime = null;
      return Promise.resolve();
    });
    const sharedStorage = aFakeDurableObjectStorageWith({
      get: (async (key: string | string[]) => {
        if (typeof key !== "string") {
          const values = new Map<string, unknown>();
          for (const currentKey of key) {
            const currentValue = persistedStorage.get(currentKey);
            if (currentValue !== undefined) {
              values.set(currentKey, currentValue);
            }
          }

          return await Promise.resolve(values);
        }

        return await Promise.resolve(persistedStorage.get(key));
      }) as DurableObjectStorage["get"],
      put: (async (key: string, value: unknown) => {
        persistedStorage.set(key, value);
        await Promise.resolve();
      }) as DurableObjectStorage["put"],
      setAlarm: localSetAlarmMock,
      getAlarm: localGetAlarmMock,
      deleteAlarm: localDeleteAlarmMock,
    });
    const localState = aFakeDurableObjectStateWith({ storage: sharedStorage });
    const trackerDo = aFakeIndividualTrackerDOWith({ viewStateResponse: { state: null } });
    const localEnv = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(trackerDo) });
    const logService = aFakeLogServiceWith();
    const errorSpy = vi.spyOn(logService, "error");
    const services = installFakeServicesWith({ env: localEnv, logService });
    vi.spyOn(localState, "getWebSockets").mockReturnValue([]);
    const transientFailure = new Error("transient reconcile failure");
    vi.spyOn(services.databaseService, "findIndividualTrackersByUserId")
      .mockResolvedValueOnce([
        aFakeIndividualTrackersRow({
          TrackerId: "t1",
          UserId: "user-1",
          Gamertag: "KnownTag",
          Status: "active",
          IsLive: 1,
        }),
      ])
      .mockRejectedValueOnce(transientFailure);
    const localUserTrackerDO = new UserTrackerDO(localState, localEnv, () => services, webSocketAdapter);

    const initialResponse = await localUserTrackerDO.fetch(
      new Request("http://do/view-state?userId=user-1", { method: "GET" }),
    );
    expect(initialResponse.status).toBe(200);
    expect(localSetAlarmMock).toHaveBeenCalledOnce();

    alarmTime = null;
    await localUserTrackerDO.alarm();

    expect(localSetAlarmMock).toHaveBeenCalledTimes(2);
    expect(localDeleteAlarmMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    const [loggedError, loggedContext] = errorSpy.mock.calls.at(-1) ?? [];
    expect(loggedError).toBe(transientFailure);
    expect(loggedContext?.get("context")).toBe("UserTracker directory refresh error");
  });

  it("stops the update loop through alarm when no websocket clients are connected", async () => {
    vi.spyOn(mockState, "getWebSockets").mockReturnValue([]);

    await userTrackerDO.alarm();

    expect(deleteAlarmMock).toHaveBeenCalledOnce();
  });

  it("retries tracker subscription setup after a transient installation failure", async () => {
    const localEnv = aFakeEnvWith();
    const services = installFakeServicesWith({ env: localEnv });
    const subscriptionError = new Error("transient subscription failure");
    vi.spyOn(mockState, "getWebSockets").mockReturnValue([{} as WebSocket]);
    const findTrackersSpy = vi
      .spyOn(services.databaseService, "findIndividualTrackersByUserId")
      .mockRejectedValueOnce(subscriptionError)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const localUserTrackerDO = new UserTrackerDO(mockState, localEnv, () => services, webSocketAdapter);

    await localUserTrackerDO.fetch(
      new Request("http://do/websocket?userId=user-1", {
        method: "GET",
        headers: { Upgrade: "websocket" },
      }),
    );
    await vi.waitFor(() => {
      expect(findTrackersSpy).toHaveBeenCalledTimes(1);
    });

    await localUserTrackerDO.fetch(
      new Request("http://do/websocket?userId=user-1", {
        method: "GET",
        headers: { Upgrade: "websocket" },
      }),
    );
    await vi.waitFor(() => {
      expect(findTrackersSpy).toHaveBeenCalledTimes(2);
    });
  });
});
