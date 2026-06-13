import { describe, expect, it } from "vitest";
import {
  liveTrackerStartContract,
  liveTrackerStartRequestSchema,
  liveTrackerStateSchema,
  liveTrackerPauseContract,
  liveTrackerStopContract,
  type LiveTrackerStartRequest,
  type LiveTrackerStartResponse,
} from "../lifecycle";
import {
  liveTrackerRefreshContract,
  liveTrackerSubstitutionContract,
  liveTrackerStatusContract,
  liveTrackerRepostContract,
  liveTrackerRefreshRequestSchema,
  liveTrackerSubstitutionRequestSchema,
  liveTrackerRepostRequestSchema,
} from "../management";
import { liveTrackerSeriesDataContract } from "../series-data";

const validState = {
  userId: "u1",
  guildId: "g1",
  channelId: "c1",
  queueNumber: 1,
  isPaused: false,
  status: "active" as const,
  startTime: "2024-11-26T11:00:00.000Z",
  lastUpdateTime: "2024-11-26T12:00:00.000Z",
  searchStartTime: "2024-11-26T11:00:00.000Z",
  checkCount: 0,
  players: {},
  playersAssociationData: {},
  teams: [{ name: "Eagles", playerIds: ["p1", "p2"] }],
  substitutions: [],
  errorState: { consecutiveErrors: 0, backoffMinutes: 3, lastSuccessTime: "2024-11-26T11:00:00.000Z" },
  discoveredMatches: {},
  matchIds: [],
  seriesScore: "🦅 0:0 🐍",
  lastMessageState: { matchCount: 0, substitutionCount: 0 },
};

describe("liveTrackerStateSchema", () => {
  it("parses a valid state", () => {
    expect(liveTrackerStateSchema.parse(validState)).toEqual(validState);
  });

  it("accepts optional fields absent", () => {
    expect(liveTrackerStateSchema.safeParse(validState).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(liveTrackerStateSchema.safeParse({ ...validState, status: "unknown" }).success).toBe(false);
  });
});

describe("liveTrackerStartRequestSchema", () => {
  const validRequest: LiveTrackerStartRequest = {
    userId: "u1",
    guildId: "g1",
    channelId: "c1",
    queueNumber: 1,
    players: {},
    teams: [{ name: "Eagles", playerIds: ["p1"] }],
    queueStartTime: "2024-11-26T11:00:00.000Z",
    playersAssociationData: {},
  };

  it("parses a valid start request", () => {
    expect(liveTrackerStartRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("rejects a missing required field", () => {
    expect(
      liveTrackerStartRequestSchema.safeParse({
        userId: "u1",
        guildId: "g1",
        queueNumber: 1,
        players: {},
        teams: [],
        queueStartTime: "2024-11-26T11:00:00.000Z",
        playersAssociationData: {},
      }).success,
    ).toBe(false);
  });
});

describe("liveTrackerStartContract", () => {
  const validResponse: LiveTrackerStartResponse = { success: true, state: validState };

  it("parses a valid start response", () => {
    expect(liveTrackerStartContract.parse(validResponse)).toEqual(validResponse);
  });

  it("round-trips through toResponse/fromResponse", async () => {
    const response = liveTrackerStartContract.toResponse(validResponse);
    await expect(liveTrackerStartContract.fromResponse(response)).resolves.toEqual(validResponse);
  });

  it("accepts success: false", () => {
    expect(liveTrackerStartContract.parse({ success: false, state: validState })).toMatchObject({ success: false });
  });
});

describe("liveTrackerPauseContract", () => {
  it("round-trips a pause response with no embedData", async () => {
    const data = { success: true as const, state: validState };
    const response = liveTrackerPauseContract.toResponse(data);
    await expect(liveTrackerPauseContract.fromResponse(response)).resolves.toEqual(data);
  });
});

describe("liveTrackerStopContract", () => {
  it("round-trips a stop response", async () => {
    const data = { success: true as const, state: validState };
    const response = liveTrackerStopContract.toResponse(data);
    await expect(liveTrackerStopContract.fromResponse(response)).resolves.toEqual(data);
  });
});

describe("liveTrackerRefreshContract", () => {
  it("accepts a success refresh response", () => {
    expect(liveTrackerRefreshContract.parse({ success: true, state: validState })).toMatchObject({ success: true });
  });

  it("accepts a cooldown error response", async () => {
    const data = { success: false as const, error: "cooldown" as const, message: "Try again later" };
    const response = liveTrackerRefreshContract.toResponse(data);
    await expect(liveTrackerRefreshContract.fromResponse(response)).resolves.toEqual(data);
  });

  it("accepts a failure response with state", () => {
    expect(liveTrackerRefreshContract.parse({ success: false, state: validState })).toMatchObject({ success: false });
  });
});

describe("liveTrackerSubstitutionContract", () => {
  it("round-trips a substitution response", async () => {
    const data = {
      success: true as const,
      substitution: { playerOutId: "p1", playerInId: "p2", teamIndex: 0 },
    };
    const response = liveTrackerSubstitutionContract.toResponse(data);
    await expect(liveTrackerSubstitutionContract.fromResponse(response)).resolves.toEqual(data);
  });
});

describe("liveTrackerStatusContract", () => {
  it("round-trips a status response", async () => {
    const data = { state: validState };
    const response = liveTrackerStatusContract.toResponse(data);
    await expect(liveTrackerStatusContract.fromResponse(response)).resolves.toMatchObject({ state: validState });
  });
});

describe("liveTrackerRepostContract", () => {
  it("round-trips a repost response", async () => {
    const data = { success: true as const, oldMessageId: "old", newMessageId: "new" };
    const response = liveTrackerRepostContract.toResponse(data);
    await expect(liveTrackerRepostContract.fromResponse(response)).resolves.toEqual(data);
  });
});

describe("request schemas", () => {
  it("liveTrackerRefreshRequestSchema accepts empty object", () => {
    expect(liveTrackerRefreshRequestSchema.parse({})).toEqual({});
  });

  it("liveTrackerSubstitutionRequestSchema parses valid request", () => {
    expect(
      liveTrackerSubstitutionRequestSchema.parse({ playerOutId: "p1", playerInId: "p2", playerAssociationData: {} }),
    ).toMatchObject({ playerOutId: "p1", playerInId: "p2" });
  });

  it("liveTrackerRepostRequestSchema parses valid request", () => {
    expect(liveTrackerRepostRequestSchema.parse({ newMessageId: "msg1" })).toEqual({ newMessageId: "msg1" });
  });
});

describe("liveTrackerSeriesDataContract", () => {
  it("round-trips a series data response", async () => {
    const data = {
      seriesId: { guildId: "g1", queueNumber: 1 },
      teams: [{ name: "Eagles", playerIds: ["p1"] }],
      seriesScore: "🦅 1:0 🐍",
      matchIds: ["m1"],
      discoveredMatches: {},
      rawMatches: [],
      playersAssociationData: {},
      substitutions: [],
      startTime: "2024-11-26T11:00:00.000Z",
      lastUpdateTime: "2024-11-26T12:00:00.000Z",
    };
    const response = liveTrackerSeriesDataContract.toResponse(data);
    await expect(liveTrackerSeriesDataContract.fromResponse(response)).resolves.toEqual(data);
  });
});
