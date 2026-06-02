import { describe, expect, it } from "vitest";
import {
  trackerViewContract,
  trackerViewMessageContract,
  trackerViewMessageSchema,
  type TrackerViewMessage,
  type TrackerViewResponse,
} from "../view";

describe("trackerViewContract", () => {
  const validResponse: TrackerViewResponse = {
    view: {
      trackerId: "t1",
      gamertag: "MyTag",
      status: "active",
      isLive: true,
      matches: [
        {
          matchId: "match-1",
          startTime: "2024-11-26T11:00:00.000Z",
          endTime: "2024-11-26T11:10:00.000Z",
          mapAssetId: "map-1",
          modeAssetId: "mode-1",
          outcome: "Win",
          score: "50:42",
        },
      ],
      lastUpdateTime: "2024-11-26T12:00:00.000Z",
      lastMatchDiscoveredAt: "2024-11-26T11:55:00.000Z",
    },
  };

  it("parses a valid view response", () => {
    expect(trackerViewContract.parse(validResponse)).toEqual(validResponse);
  });

  it("round-trips through toResponse/fromResponse", async () => {
    const response = trackerViewContract.toResponse(validResponse, { noStore: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(trackerViewContract.fromResponse(response)).resolves.toEqual(validResponse);
  });

  it("accepts a null lastMatchDiscoveredAt and empty matches", () => {
    const result = trackerViewContract.safeParse({
      view: {
        trackerId: "t2",
        gamertag: "StoppedTag",
        status: "stopped",
        isLive: false,
        matches: [],
        lastUpdateTime: "",
        lastMatchDiscoveredAt: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const result = trackerViewContract.safeParse({
      ...validResponse,
      view: { ...validResponse.view, status: "bogus" },
    });
    expect(result.success).toBe(false);
  });
});

describe("trackerViewMessageSchema", () => {
  const validMessage: TrackerViewMessage = {
    type: "view",
    view: {
      trackerId: "t1",
      gamertag: "MyTag",
      status: "active",
      matches: [
        {
          matchId: "match-1",
          startTime: "2024-11-26T11:00:00.000Z",
          endTime: "2024-11-26T11:10:00.000Z",
          mapAssetId: "map-1",
          modeAssetId: "mode-1",
          outcome: "Win",
          score: "50:42",
        },
      ],
      lastUpdateTime: "2024-11-26T12:00:00.000Z",
      lastMatchDiscoveredAt: "2024-11-26T11:55:00.000Z",
    },
  };

  it("round-trips a valid view message", () => {
    expect(trackerViewMessageSchema.parse(validMessage)).toEqual(validMessage);
  });

  it("does not include isLive in the live-view payload", () => {
    expect("isLive" in validMessage.view).toBe(false);
  });

  it("rejects a message with the wrong type literal", () => {
    const result = trackerViewMessageSchema.safeParse({ ...validMessage, type: "state" });
    expect(result.success).toBe(false);
  });
});

describe("trackerViewMessageContract", () => {
  const message: TrackerViewMessage = {
    type: "view",
    view: {
      trackerId: "t1",
      gamertag: "MyTag",
      status: "active",
      matches: [],
      lastUpdateTime: "2024-11-26T12:00:00.000Z",
      lastMatchDiscoveredAt: null,
    },
  };

  it("serialize/parse round-trips a view message", () => {
    expect(trackerViewMessageContract.parse(trackerViewMessageContract.serialize(message))).toEqual(message);
  });

  it("parse throws on a message with the wrong type literal", () => {
    expect(() => trackerViewMessageContract.parse(JSON.stringify({ ...message, type: "state" }))).toThrow();
  });
});
