import { describe, it, expect } from "vitest";
import type { LiveTrackerMatchRenderModel } from "../../live-tracker/types";
import { calculateSeriesMetadata } from "../series-metadata";

describe("calculateSeriesMetadata", () => {
  it("returns null when there are no matches", () => {
    const result = calculateSeriesMetadata([], "🦅 0:0 🐍");
    expect(result).toBeNull();
  });

  it("calculates metadata for a single match", () => {
    const matches: LiveTrackerMatchRenderModel[] = [
      {
        matchId: "match1",
        gameTypeAndMap: "Slayer: Aquarius",
        gameType: "Slayer",
        gameMap: "Aquarius",
        gameMapThumbnailUrl: "data:,",
        duration: "7m 30s",
        gameScore: "50:47",
        gameSubScore: null,
        startTime: "2024-01-01T10:00:00.000Z",
        endTime: "2024-01-01T10:07:30.000Z",
        rawMatchStats: null,
        playerXuidToGametag: {},
      },
    ];

    const result = calculateSeriesMetadata(matches, "🦅 1:0 🐍");

    expect(result).toEqual({
      score: "1:0",
      duration: "7m 30s",
      startTime: "2024-01-01T10:00:00.000Z",
      endTime: "2024-01-01T10:07:30.000Z",
    });
  });

  it("calculates metadata for multiple matches", () => {
    const matches: LiveTrackerMatchRenderModel[] = [
      {
        matchId: "match1",
        gameTypeAndMap: "Slayer: Aquarius",
        gameType: "Slayer",
        gameMap: "Aquarius",
        gameMapThumbnailUrl: "data:,",
        duration: "7m 30s",
        gameScore: "50:47",
        gameSubScore: null,
        startTime: "2024-01-01T10:00:00.000Z",
        endTime: "2024-01-01T10:07:30.000Z",
        rawMatchStats: null,
        playerXuidToGametag: {},
      },
      {
        matchId: "match2",
        gameTypeAndMap: "CTF: Streets",
        gameType: "CTF",
        gameMap: "Streets",
        gameMapThumbnailUrl: "data:,",
        duration: "12m 15s",
        gameScore: "3:2",
        gameSubScore: null,
        startTime: "2024-01-01T10:10:00.000Z",
        endTime: "2024-01-01T10:22:15.000Z",
        rawMatchStats: null,
        playerXuidToGametag: {},
      },
    ];

    const result = calculateSeriesMetadata(matches, "🦅 2:1 🐍");

    expect(result).toEqual({
      score: "2:1",
      duration: "22m 15s",
      startTime: "2024-01-01T10:00:00.000Z",
      endTime: "2024-01-01T10:22:15.000Z",
    });
  });

  it("removes emoji from series score", () => {
    const matches: LiveTrackerMatchRenderModel[] = [
      {
        matchId: "match1",
        gameTypeAndMap: "Slayer: Aquarius",
        gameType: "Slayer",
        gameMap: "Aquarius",
        gameMapThumbnailUrl: "data:,",
        duration: "7m 30s",
        gameScore: "50:47",
        gameSubScore: null,
        startTime: "2024-01-01T10:00:00.000Z",
        endTime: "2024-01-01T10:07:30.000Z",
        rawMatchStats: null,
        playerXuidToGametag: {},
      },
    ];

    const result = calculateSeriesMetadata(matches, "🦅 50:47 🐍");

    expect(result?.score).toBe("50:47");
  });

  it("calculates correct duration across time boundaries", () => {
    const matches: LiveTrackerMatchRenderModel[] = [
      {
        matchId: "match1",
        gameTypeAndMap: "Slayer: Aquarius",
        gameType: "Slayer",
        gameMap: "Aquarius",
        gameMapThumbnailUrl: "data:,",
        duration: "7m 30s",
        gameScore: "50:47",
        gameSubScore: null,
        startTime: "2024-01-01T09:55:00.000Z",
        endTime: "2024-01-01T10:02:30.000Z",
        rawMatchStats: null,
        playerXuidToGametag: {},
      },
      {
        matchId: "match2",
        gameTypeAndMap: "CTF: Streets",
        gameType: "CTF",
        gameMap: "Streets",
        gameMapThumbnailUrl: "data:,",
        duration: "12m 45s",
        gameScore: "3:2",
        gameSubScore: null,
        startTime: "2024-01-01T10:05:30.000Z",
        endTime: "2024-01-01T10:18:15.000Z",
        rawMatchStats: null,
        playerXuidToGametag: {},
      },
    ];

    const result = calculateSeriesMetadata(matches, "🦅 2:0 🐍");

    expect(result).toEqual({
      score: "2:0",
      duration: "23m 15s",
      startTime: "2024-01-01T09:55:00.000Z",
      endTime: "2024-01-01T10:18:15.000Z",
    });
  });
});
