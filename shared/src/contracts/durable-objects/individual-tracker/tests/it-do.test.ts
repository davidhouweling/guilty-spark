import { describe, expect, it } from "vitest";
import {
  individualTrackerStartContract,
  individualTrackerStartRequestSchema,
  individualTrackerStateSchema,
  type IndividualTrackerStartRequest,
  type IndividualTrackerStartResponse,
} from "../lifecycle";
import { individualTrackerStatusContract, individualTrackerViewStateContract } from "../management";
import { seriesStartedPayloadSchema, type SeriesStartedPayload } from "../nudge";
import {
  editSeriesContract,
  endSeriesContract,
  startSeriesContract,
  resumeSeriesContract,
} from "../../../individual-tracker/tracker";

const validState = {
  userId: "u1",
  trackerId: "t1",
  xuid: "x1",
  gamertag: "MyTag",
  status: "active" as const,
  isPaused: false,
  startTime: "2024-11-26T11:00:00.000Z",
  lastUpdateTime: "2024-11-26T12:00:00.000Z",
  idleTimeoutHours: 2,
};

describe("individualTrackerStateSchema", () => {
  it("parses a valid state", () => {
    expect(individualTrackerStateSchema.parse(validState)).toEqual(validState);
  });

  it("accepts optional hasActiveSeries", () => {
    expect(individualTrackerStateSchema.parse({ ...validState, hasActiveSeries: true })).toMatchObject({
      hasActiveSeries: true,
    });
  });

  it("rejects an unknown status", () => {
    expect(individualTrackerStateSchema.safeParse({ ...validState, status: "unknown" }).success).toBe(false);
  });
});

describe("individualTrackerStartRequestSchema", () => {
  const validRequest: IndividualTrackerStartRequest = {
    userId: "u1",
    trackerId: "t1",
    xuid: "x1",
    gamertag: "MyTag",
    searchStartTime: "2024-11-26T11:00:00.000Z",
    idleTimeoutHours: 2,
  };

  it("parses a valid start request", () => {
    expect(individualTrackerStartRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("rejects a missing required field", () => {
    expect(
      individualTrackerStartRequestSchema.safeParse({
        userId: "u1",
        trackerId: "t1",
        gamertag: "MyTag",
        searchStartTime: "2024-11-26T11:00:00.000Z",
        idleTimeoutHours: 2,
      }).success,
    ).toBe(false);
  });
});

describe("individualTrackerStartContract", () => {
  const validResponse: IndividualTrackerStartResponse = { success: true, state: validState };

  it("parses a valid start response", () => {
    expect(individualTrackerStartContract.parse(validResponse)).toEqual(validResponse);
  });

  it("round-trips through toResponse/fromResponse", async () => {
    const response = individualTrackerStartContract.toResponse(validResponse);
    await expect(individualTrackerStartContract.fromResponse(response)).resolves.toEqual(validResponse);
  });

  it("rejects success: false", () => {
    expect(individualTrackerStartContract.safeParse({ success: false, state: validState }).success).toBe(false);
  });
});

describe("individualTrackerStatusContract", () => {
  it("accepts a null state", async () => {
    const response = individualTrackerStatusContract.toResponse({ state: null });
    await expect(individualTrackerStatusContract.fromResponse(response)).resolves.toEqual({ state: null });
  });

  it("accepts a non-null state", () => {
    expect(individualTrackerStatusContract.parse({ state: validState })).toMatchObject({ state: validState });
  });
});

describe("individualTrackerViewStateContract", () => {
  it("accepts a null state", () => {
    expect(individualTrackerViewStateContract.parse({ state: null })).toEqual({ state: null });
  });

  it("accepts a valid view state", () => {
    const viewState = {
      trackerId: "t1",
      gamertag: "MyTag",
      status: "active" as const,
      matches: [],
      series: [],
      lastUpdateTime: "2024-11-26T12:00:00.000Z",
      lastMatchDiscoveredAt: null,
      hasActiveSeries: false,
      hasRecentCompletedSeries: false,
    };
    expect(individualTrackerViewStateContract.parse({ state: viewState })).toMatchObject({ state: viewState });
  });
});

describe("seriesStartedPayloadSchema", () => {
  const validPayload: SeriesStartedPayload = {
    type: "started",
    title: "Eagles vs Cobras",
    subtitle: "Best of 3",
    guildIconUrl: null,
    teams: [
      { id: 0, name: "Eagles", players: [{ discordId: "d1", discordName: "Player1", gamertag: "Tag1", xboxId: "x1" }] },
      { id: 1, name: "Cobras", players: [] },
    ],
  };

  it("parses a valid started payload", () => {
    expect(seriesStartedPayloadSchema.parse(validPayload)).toEqual(validPayload);
  });

  it("rejects a missing title", () => {
    expect(
      seriesStartedPayloadSchema.safeParse({
        subtitle: "Best of 3",
        guildIconUrl: null,
        teams: [],
      }).success,
    ).toBe(false);
  });
});

describe("series response contracts", () => {
  it.each([
    ["startSeriesContract", startSeriesContract],
    ["endSeriesContract", endSeriesContract],
    ["editSeriesContract", editSeriesContract],
    ["resumeSeriesContract", resumeSeriesContract],
  ])("%s round-trips { success: true }", async (_name, contract) => {
    const response = contract.toResponse({ success: true });
    await expect(contract.fromResponse(response)).resolves.toEqual({ success: true });
  });
});
