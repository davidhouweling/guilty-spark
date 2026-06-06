import { describe, expect, it } from "vitest";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import { applyAddToAdjacentGroup, applyBreakFromGroup } from "../grouping-utils";

function aMatchWith(matchId: string, category: TrackerMatchHistoryEntry["category"]): TrackerMatchHistoryEntry {
  return {
    matchId,
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    mapAssetId: `map-${matchId}`,
    mapVersionId: `map-version-${matchId}`,
    modeAssetId: `mode-${matchId}`,
    modeVersionId: `mode-version-${matchId}`,
    gameVariantCategory: 6,
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: category === "matchmaking",
    category,
    teams: [],
    mapThumbnailUrl: "data:,",
  };
}

describe("applyAddToAdjacentGroup", () => {
  it("merges the full source series into the above series", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [
      aMatchWith("m1", "custom"),
      aMatchWith("m2", "custom"),
      aMatchWith("m3", "custom"),
      aMatchWith("m4", "custom"),
      aMatchWith("m5", "custom"),
    ];

    const groupings: readonly (readonly string[])[] = [
      ["m1", "m2"],
      ["m3", "m4"],
    ];

    const result = applyAddToAdjacentGroup(groupings, entries, "m3", "above");

    expect(result).toEqual([["m1", "m2", "m3", "m4"]]);
  });

  it("adds an individual game to the below series", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [
      aMatchWith("m1", "custom"),
      aMatchWith("m2", "custom"),
      aMatchWith("m3", "custom"),
      aMatchWith("m4", "custom"),
    ];

    const groupings: readonly (readonly string[])[] = [["m3", "m4"]];

    const result = applyAddToAdjacentGroup(groupings, entries, "m2", "below");

    expect(result).toEqual([["m2", "m3", "m4"]]);
  });

  it("creates a new series when two individual games are joined", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [aMatchWith("m1", "custom"), aMatchWith("m2", "custom")];

    const result = applyAddToAdjacentGroup([], entries, "m2", "above");

    expect(result).toEqual([["m1", "m2"]]);
  });

  it("returns unchanged groupings when matchId is not found in entries", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [aMatchWith("m1", "custom")];
    const groupings: readonly (readonly string[])[] = [["m1"]];

    const result = applyAddToAdjacentGroup(groupings, entries, "unknown", "above");

    expect(result).toEqual([["m1"]]);
  });

  it("returns unchanged groupings when match is already in the same group as adjacent", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [aMatchWith("m1", "custom"), aMatchWith("m2", "custom")];

    const groupings: readonly (readonly string[])[] = [["m1", "m2"]];

    const result = applyAddToAdjacentGroup(groupings, entries, "m2", "above");

    expect(result).toEqual([["m1", "m2"]]);
  });

  it("returns unchanged groupings when there is no adjacent entry in the direction", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [aMatchWith("m1", "custom")];

    const result = applyAddToAdjacentGroup([], entries, "m1", "above");

    expect(result).toEqual([]);
  });
});

describe("applyBreakFromGroup", () => {
  it("splits a grouped series around the selected match", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [
      aMatchWith("m1", "custom"),
      aMatchWith("m2", "custom"),
      aMatchWith("m3", "custom"),
      aMatchWith("m4", "custom"),
      aMatchWith("m5", "custom"),
      aMatchWith("m6", "custom"),
      aMatchWith("m7", "custom"),
    ];

    const groupings: readonly (readonly string[])[] = [["m1", "m2", "m3", "m4", "m5", "m6", "m7"]];

    const result = applyBreakFromGroup(groupings, entries, "m3");

    expect(result).toEqual([
      ["m1", "m2"],
      ["m4", "m5", "m6", "m7"],
    ]);
  });

  it("removes a group entirely when breaking from a two-match group", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [aMatchWith("m1", "custom"), aMatchWith("m2", "custom")];

    const groupings: readonly (readonly string[])[] = [["m1", "m2"]];

    const result = applyBreakFromGroup(groupings, entries, "m1");

    expect(result).toEqual([]);
  });

  it("leaves other groups untouched and discards sub-two-match fragments", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [
      aMatchWith("m1", "custom"),
      aMatchWith("m2", "custom"),
      aMatchWith("m3", "custom"),
      aMatchWith("m4", "custom"),
      aMatchWith("m5", "custom"),
    ];

    const groupings: readonly (readonly string[])[] = [
      ["m1", "m2", "m3"],
      ["m4", "m5"],
    ];

    const result = applyBreakFromGroup(groupings, entries, "m2");

    expect(result).toEqual([["m4", "m5"]]);
  });

  it("returns groupings unchanged when matchId is not in any group", () => {
    const entries: readonly TrackerMatchHistoryEntry[] = [aMatchWith("m1", "custom"), aMatchWith("m2", "custom")];

    const groupings: readonly (readonly string[])[] = [["m1", "m2"]];

    const result = applyBreakFromGroup(groupings, entries, "unknown");

    expect(result).toEqual([["m1", "m2"]]);
  });
});
