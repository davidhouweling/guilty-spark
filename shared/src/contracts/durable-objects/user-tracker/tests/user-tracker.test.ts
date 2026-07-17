import { describe, expect, it } from "vitest";
import { trackerDirectorySchema } from "../../../individual-tracker/follow";
import { userTrackerStateSchema } from "../lifecycle";
import {
  userTrackerDirectoryMessageContract,
  userTrackerStatusContract,
  userTrackerViewStateContract,
} from "../management";
import { trackerChangedPayloadSchema } from "../nudge";

describe("userTrackerStateSchema", () => {
  it("parses a valid state", () => {
    const state = {
      userId: "u1",
      lastUpdateTime: "2026-07-03T00:00:00.000Z",
    };

    expect(userTrackerStateSchema.parse(state)).toEqual(state);
  });
});

describe("userTracker contracts", () => {
  const directory = trackerDirectorySchema.parse({
    trackers: [],
    liveTrackerId: null,
    streamerSettings: {},
  });

  it("round-trips status response", async () => {
    const response = userTrackerStatusContract.toResponse({ state: null });
    await expect(userTrackerStatusContract.fromResponse(response)).resolves.toEqual({ state: null });
  });

  it("round-trips view-state response", async () => {
    const payload = {
      state: {
        userId: "u1",
        lastUpdateTime: "2026-07-03T00:00:00.000Z",
        directory,
      },
    };

    const response = userTrackerViewStateContract.toResponse(payload);
    await expect(userTrackerViewStateContract.fromResponse(response)).resolves.toEqual(payload);
  });

  it("serializes and parses directory websocket messages", () => {
    const serialized = userTrackerDirectoryMessageContract.serialize({
      type: "directory",
      directory,
    });

    const parsed = userTrackerDirectoryMessageContract.parse(serialized);
    expect(parsed.type).toBe("directory");
    expect(parsed.directory.trackers).toEqual([]);
    expect(parsed.directory.liveTrackerId).toBeNull();
  });
});

describe("trackerChangedPayloadSchema", () => {
  it("parses a valid tracker changed payload", () => {
    const payload = {
      userId: "u1",
      trackerId: "t1",
      lastUpdateTime: "2026-07-03T00:00:00.000Z",
    };

    expect(trackerChangedPayloadSchema.parse(payload)).toEqual(payload);
  });
});
