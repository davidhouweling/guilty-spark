import { describe, expect, it } from "vitest";
import { tryParseLiveTrackerMessage, parseLiveTrackerStateData } from "@guilty-spark/contracts/live-tracker/parse";
import type { JsonValue } from "@guilty-spark/contracts/base/json";
import {
  sampleLiveTrackerStateMessage,
  aFakePlayerAssociationDataWith,
} from "@guilty-spark/contracts/live-tracker/fakes/data";
import type { LiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/types";

describe("parseLiveTrackerStateData", () => {
  it("parses valid state data with all required fields", () => {
    expect.assertions(6);
    const { data } = sampleLiveTrackerStateMessage;

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("neatqueue");
    if (result?.type === "neatqueue") {
      expect(result.guildId).toBe("1238795949266964560");
      expect(result.status).toBe("active");
      expect(result.players).toHaveLength(8);
      expect(result.teams).toHaveLength(2);
    }
  });

  it("returns null when status is invalid", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      status: "invalid-status",
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when guildId is missing", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      guildId: null,
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when guildId is not a string", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      guildId: 12345,
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when queueNumber is not a number", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      queueNumber: "not-a-number",
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when players array contains invalid player", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      players: [
        { id: "123", discordUsername: "user1" },
        { id: "456" }, // missing discordUsername
      ],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when player id is not a string", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      players: [{ id: 123, discordUsername: "user1" }],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when player discordUsername is not a string", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      players: [{ id: "123", discordUsername: null }],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when teams array contains invalid team", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      teams: [
        { name: "Team 1", playerIds: ["1", "2"] },
        { playerIds: ["3", "4"] }, // missing name
      ],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when team name is not a string", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      teams: [{ name: 123, playerIds: ["1", "2"] }],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when team playerIds contains non-string", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      teams: [{ name: "Team 1", playerIds: ["1", 2] }],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("parses substitutions with valid data", () => {
    expect.assertions(3);
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      substitutions: [
        {
          playerOutId: "player-out-1",
          playerInId: "player-in-1",
          teamIndex: 0,
          teamName: "Team 1",
          timestamp: "2025-01-01T00:00:00.000Z",
        },
      ],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).not.toBeNull();
    if (result?.type === "neatqueue") {
      expect(result.substitutions).toHaveLength(1);
      expect(result.substitutions[0]?.playerOutId).toBe("player-out-1");
    }
  });

  it("returns null when substitution playerOutId is missing", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      substitutions: [
        {
          playerInId: "player-in-1",
          teamIndex: 0,
          timestamp: "2025-01-01T00:00:00.000Z",
        },
      ],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when substitution teamIndex is not a number", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      substitutions: [
        {
          playerOutId: "player-out-1",
          playerInId: "player-in-1",
          teamIndex: "not-a-number",
          teamName: "Team 1",
          timestamp: "2025-01-01T00:00:00.000Z",
        },
      ],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("parses discovered matches with valid data", () => {
    expect.assertions(3);
    const { data } = sampleLiveTrackerStateMessage;

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).not.toBeNull();
    if (result?.type === "neatqueue") {
      expect(result.matchSummaries).toHaveLength(5);
      expect(result.matchSummaries[0]?.matchId).toBe("3d203681-2950-46a9-b6ae-d9da82d3d0d5");
    }
  });

  it("returns null when match summary missing required field", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      matchSummaries: [
        {
          matchId: "test-match",
          gameTypeAndMap: "Slayer: Streets",
          gameType: "Slayer",
          // missing gameMap
          gameMapThumbnailUrl: "https://example.com/thumbnail.jpg",
          duration: "5m",
          gameScore: "50:49",
          startTime: "2025-01-01T00:00:00.000Z",
          endTime: "2025-01-01T00:05:00.000Z",
          playerXuidToGametag: {},
        },
      ],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("parses match with null gameSubScore", () => {
    expect.assertions(2);
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      matchSummaries: [
        {
          matchId: "test-match",
          gameTypeAndMap: "Slayer: Streets",
          gameType: "Slayer",
          gameMap: "Streets",
          gameMapThumbnailUrl: "https://example.com/thumbnail.jpg",
          duration: "5m",
          gameScore: "50:49",
          gameSubScore: null,
          startTime: "2025-01-01T00:00:00.000Z",
          endTime: "2025-01-01T00:05:00.000Z",
          playerXuidToGametag: {},
        },
      ],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).not.toBeNull();
    if (result?.type === "neatqueue") {
      expect(result.matchSummaries[0]?.gameSubScore).toBeNull();
    }
  });

  it("parses playersAssociationData when present", () => {
    const associationData = {
      "237222473500852224": aFakePlayerAssociationDataWith(),
    };
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      playersAssociationData: associationData,
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).not.toBeNull();
    expect(result?.playersAssociationData).not.toBeNull();
    expect(result?.playersAssociationData?.["237222473500852224"]).toBeDefined();
  });

  it("handles null playersAssociationData", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      playersAssociationData: null,
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).not.toBeNull();
    expect(result?.playersAssociationData).toBeNull();
  });

  it("handles playersAssociationData as non-object", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      playersAssociationData: "not an object",
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).not.toBeNull();
    expect(result?.playersAssociationData).toBeNull();
  });

  it("returns null when not a JSON object", () => {
    const result = parseLiveTrackerStateData("not an object");

    expect(result).toBeNull();
  });

  it("returns null when players is not an array", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      players: "not-an-array",
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when teams is not an array", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      teams: "not-an-array",
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when rawMatches is not a record", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      rawMatches: "not-a-record",
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when medalMetadata is not a record", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      medalMetadata: "not-a-record",
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when player in array is not an object", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      players: ["not-an-object"],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when team in array is not an object", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      teams: ["not-an-object"],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when substitution in array is not an object", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      substitutions: ["not-an-object"],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });

  it("returns null when match in array is not an object", () => {
    const data = {
      ...sampleLiveTrackerStateMessage.data,
      matchSummaries: ["not-an-object"],
    };

    const result = parseLiveTrackerStateData(data as unknown as JsonValue);

    expect(result).toBeNull();
  });
});

describe("tryParseLiveTrackerMessage", () => {
  it("parses valid state message", () => {
    expect.assertions(4);
    const payload = JSON.stringify({
      type: "state",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: {
        type: "neatqueue",
        guildId: "1",
        guildIcon: null,
        guildName: "Guild 1",
        channelId: "2",
        queueNumber: 3,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        players: [],
        teams: [],
        substitutions: [],
        matchSummaries: [],
        rawMatches: {},
        seriesScore: "0:0",
        medalMetadata: {},
        playersAssociationData: {},
      },
    } satisfies LiveTrackerStateMessage);

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("state");
    if (result?.data.type === "neatqueue") {
      expect(result.data.guildId).toBe("1");
      expect(result.data.status).toBe("active");
    }
  });

  it("parses state message with stopped status", () => {
    expect.assertions(3);
    const payload = JSON.stringify({
      type: "state",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: {
        type: "neatqueue",
        guildId: "1",
        guildIcon: null,
        guildName: "Guild 1",
        channelId: "2",
        queueNumber: 3,
        status: "stopped",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        players: [],
        teams: [],
        substitutions: [],
        matchSummaries: [],
        rawMatches: {},
        seriesScore: "0:0",
        medalMetadata: {},
        playersAssociationData: {},
      },
    } satisfies LiveTrackerStateMessage);

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("state");
    if (result?.data.type === "neatqueue") {
      expect(result.data.status).toBe("stopped");
    }
  });

  it("returns null for legacy stopped message type", () => {
    const payload = JSON.stringify({
      type: "stopped",
    });

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const payload = "not json";

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).toBeNull();
  });

  it("returns null for missing type field", () => {
    const payload = JSON.stringify({
      data: {},
    });

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).toBeNull();
  });

  it("returns null for unknown message type", () => {
    const payload = JSON.stringify({
      type: "unknown",
    });

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).toBeNull();
  });

  it("returns null when missing required data fields", () => {
    const payload = JSON.stringify({
      type: "state",
      timestamp: "2025-01-01T00:00:00.000Z",
      // missing data field
    });

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).toBeNull();
  });

  it("returns null when missing timestamp", () => {
    const payload = JSON.stringify({
      type: "state",
      data: {
        type: "neatqueue",
        guildId: "1",
        guildIcon: null,
        guildName: "Guild 1",
        channelId: "2",
        queueNumber: 3,
        status: "stopped",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        players: [],
        teams: [],
        substitutions: [],
        matchSummaries: [],
        rawMatches: {},
        seriesScore: "0:0",
        medalMetadata: {},
        playersAssociationData: {},
      },
      // missing timestamp
    } satisfies Omit<LiveTrackerStateMessage, "timestamp">);

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).toBeNull();
  });

  it("parses all valid LiveTrackerStatus values", () => {
    expect.assertions(9); // 3 iterations × 3 assertions each
    const statuses = ["active", "paused", "stopped"] as const;

    for (const status of statuses) {
      const payload = JSON.stringify({
        type: "state",
        timestamp: "2025-01-01T00:00:00.000Z",
        data: {
          type: "neatqueue",
          guildId: "1",
          guildIcon: null,
          guildName: "Guild 1",
          channelId: "2",
          queueNumber: 3,
          status,
          lastUpdateTime: "2025-01-01T00:00:00.000Z",
          players: [],
          teams: [],
          substitutions: [],
          matchSummaries: [],
          rawMatches: {},
          seriesScore: "0:0",
          medalMetadata: {},
          playersAssociationData: {},
        },
      } satisfies LiveTrackerStateMessage);

      const result = tryParseLiveTrackerMessage(payload);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("state");
      if (result?.data.type === "neatqueue") {
        expect(result.data.status).toBe(status);
      }
    }
  });

  it("returns null when root is not an object", () => {
    const payload = JSON.stringify("not-an-object");

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).toBeNull();
  });

  it("returns null when root is an array", () => {
    const payload = JSON.stringify([1, 2, 3]);

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).toBeNull();
  });
});
