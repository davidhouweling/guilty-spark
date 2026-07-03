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

  it("returns websocket upgrade and sends initial directory message", async () => {
    const response = await userTrackerDO.fetch(
      new Request("http://do/websocket", {
        method: "GET",
        headers: { Upgrade: "websocket" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-fake-upgrade")).toBe("websocket");
    expect(webSocketAdapter.initialMessages).toHaveLength(1);

    const initialMessage = Preconditions.checkExists(
      webSocketAdapter.initialMessages[0],
      "expected websocket upgrade to include an initial message",
    );
    const parsed = userTrackerDirectoryMessageContract.parse(initialMessage);
    expect(parsed.type).toBe("directory");
    expect(parsed.directory.trackers).toEqual([]);
    expect(parsed.directory.liveTrackerId).toBeNull();
    expect(setAlarmMock).toHaveBeenCalledOnce();
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
