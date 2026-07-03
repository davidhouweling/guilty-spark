import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  userTrackerDirectoryMessageContract,
  userTrackerStatusContract,
  userTrackerViewStateContract,
} from "@guilty-spark/shared/contracts/durable-objects/user-tracker/management";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UserTrackerDO } from "../user-tracker-do";
import { aFakeDurableObjectStateWith } from "../../../base/fakes/do.fake";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
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

  beforeEach(() => {
    env = aFakeEnvWith();
    mockState = aFakeDurableObjectStateWith();
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
  });
});
