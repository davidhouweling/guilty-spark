import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  userTrackerStatusContract,
  userTrackerViewStateContract,
} from "@guilty-spark/shared/contracts/durable-objects/user-tracker/management";
import { UserTrackerDO } from "../user-tracker-do";
import { aFakeDurableObjectStateWith } from "../../../base/fakes/do.fake";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";

describe("UserTrackerDO", () => {
  let userTrackerDO: UserTrackerDO;
  let env: Env;
  let mockState: DurableObjectState & { storage: DurableObjectStorage };

  beforeEach(() => {
    env = aFakeEnvWith();
    mockState = aFakeDurableObjectStateWith();
    userTrackerDO = new UserTrackerDO(mockState, env, installFakeServicesWith);
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

  it("rejects websocket endpoint when request is not an upgrade", async () => {
    const response = await userTrackerDO.fetch(new Request("http://do/websocket", { method: "GET" }));

    expect(response.status).toBe(426);
    await expect(response.text()).resolves.toBe("Expected WebSocket upgrade");
  });
});
