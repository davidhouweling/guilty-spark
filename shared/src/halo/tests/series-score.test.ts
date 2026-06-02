import { describe, it, expect } from "vitest";
import { MatchOutcome } from "halo-infinite-api";
import type { SeriesScoreEntry } from "../series-score";
import { computeSeriesTeamWins } from "../series-score";

function anEntry(overrides: Partial<SeriesScoreEntry> = {}): SeriesScoreEntry {
  return {
    startTime: "2024-11-26T10:00:00.000Z",
    mapAssetId: "map-a",
    mapVersionId: "version-a",
    gameVariantCategory: 1,
    teamOutcomes: [MatchOutcome.Loss, MatchOutcome.Loss],
    ...overrides,
  };
}

describe("computeSeriesTeamWins", () => {
  it("counts per-team wins across multiple matches", () => {
    const entries = [
      anEntry({
        startTime: "2024-11-26T10:00:00.000Z",
        gameVariantCategory: 1,
        teamOutcomes: [MatchOutcome.Win, MatchOutcome.Loss],
      }),
      anEntry({
        startTime: "2024-11-26T10:10:00.000Z",
        gameVariantCategory: 2,
        teamOutcomes: [MatchOutcome.Win, MatchOutcome.Loss],
      }),
      anEntry({
        startTime: "2024-11-26T10:20:00.000Z",
        gameVariantCategory: 3,
        teamOutcomes: [MatchOutcome.Loss, MatchOutcome.Win],
      }),
    ];

    expect(computeSeriesTeamWins(entries)).toEqual([2, 1]);
  });

  it("collapses consecutive matches of same map + version + category, counting only the final game", () => {
    const entries = [
      anEntry({
        startTime: "2024-11-26T10:00:00.000Z",
        teamOutcomes: [MatchOutcome.Win, MatchOutcome.Loss],
      }),
      anEntry({
        startTime: "2024-11-26T10:05:00.000Z",
        teamOutcomes: [MatchOutcome.Loss, MatchOutcome.Win],
      }),
    ];

    expect(computeSeriesTeamWins(entries)).toEqual([0, 1]);
  });

  it("counts different map / version / category separately", () => {
    const entries = [
      anEntry({
        startTime: "2024-11-26T10:00:00.000Z",
        mapAssetId: "map-a",
        teamOutcomes: [MatchOutcome.Win, MatchOutcome.Loss],
      }),
      anEntry({
        startTime: "2024-11-26T10:05:00.000Z",
        mapAssetId: "map-b",
        teamOutcomes: [MatchOutcome.Win, MatchOutcome.Loss],
      }),
      anEntry({
        startTime: "2024-11-26T10:10:00.000Z",
        mapAssetId: "map-b",
        mapVersionId: "version-b",
        teamOutcomes: [MatchOutcome.Win, MatchOutcome.Loss],
      }),
    ];

    expect(computeSeriesTeamWins(entries)).toEqual([3, 0]);
  });

  it("does not count ties or losses, leaving a team with no wins at 0", () => {
    const entries = [
      anEntry({
        startTime: "2024-11-26T10:00:00.000Z",
        gameVariantCategory: 1,
        teamOutcomes: [MatchOutcome.Win, MatchOutcome.Loss],
      }),
      anEntry({
        startTime: "2024-11-26T10:10:00.000Z",
        gameVariantCategory: 2,
        teamOutcomes: [MatchOutcome.Tie, MatchOutcome.Tie],
      }),
    ];

    expect(computeSeriesTeamWins(entries)).toEqual([1, 0]);
  });

  it("returns an empty array for empty input", () => {
    expect(computeSeriesTeamWins([])).toEqual([]);
  });
});
