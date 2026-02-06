import { describe, expect, it } from "vitest";
import { tryParseLiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/parse";

describe("tryParseLiveTrackerMessage", () => {
  it("parses valid state message", () => {
    const payload = JSON.stringify({
      type: "state",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: {
        guildId: "1",
        guildName: "Guild 1",
        channelId: "2",
        queueNumber: 3,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        players: [],
        teams: [],
        substitutions: [],
        discoveredMatches: [],
        rawMatches: {},
        seriesScore: "🦅 0:0 🐍",
        medalMetadata: {},
      },
    });

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("state");
    expect(result?.data.guildId).toBe("1");
    expect(result?.data.status).toBe("active");
  });

  it("parses state message with stopped status", () => {
    const payload = JSON.stringify({
      type: "state",
      timestamp: "2025-01-01T00:00:00.000Z",
      data: {
        guildId: "1",
        guildName: "Guild 1",
        channelId: "2",
        queueNumber: 3,
        status: "stopped",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        players: [],
        teams: [],
        substitutions: [],
        discoveredMatches: [],
        rawMatches: {},
        seriesScore: "🦅 0:0 🐍",
        medalMetadata: {},
      },
    });

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("state");
    expect(result?.data.status).toBe("stopped");
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
        guildId: "1",
        guildName: "Guild 1",
        channelId: "2",
        queueNumber: 3,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        players: [],
        teams: [],
        substitutions: [],
        discoveredMatches: [],
        rawMatches: {},
        seriesScore: "🦅 0:0 🐍",
      },
      // missing timestamp
    });

    const result = tryParseLiveTrackerMessage(payload);

    expect(result).toBeNull();
  });

  it("parses all valid LiveTrackerStatus values", () => {
    const statuses = ["active", "paused", "stopped"] as const;

    for (const status of statuses) {
      const payload = JSON.stringify({
        type: "state",
        timestamp: "2025-01-01T00:00:00.000Z",
        data: {
          guildId: "1",
          guildName: "Guild 1",
          channelId: "2",
          queueNumber: 3,
          status,
          lastUpdateTime: "2025-01-01T00:00:00.000Z",
          players: [],
          teams: [],
          substitutions: [],
          discoveredMatches: [],
          rawMatches: {},
          seriesScore: "🦅 0:0 🐍",
          medalMetadata: {},
        },
      });

      const result = tryParseLiveTrackerMessage(payload);

      expect(result).not.toBeNull();
      expect(result?.type).toBe("state");
      expect(result?.data.status).toBe(status);
    }
  });
});
