import { describe, expect, it } from "vitest";
import { buildSeriesGroupKey } from "@guilty-spark/shared/individual-tracker/series-grouping";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import {
  alignSeriesGroupsToGroupings,
  getDefaultSeriesGroupSubtitle,
  type IndividualTrackerSeriesGroup,
} from "../series-group-metadata";

function aMatchEntryWith(
  overrides: Partial<
    Pick<
      TrackerMatchHistoryEntry,
      "startTimeIso" | "startTime" | "mapAssetId" | "mapVersionId" | "gameVariantCategory" | "outcome"
    >
  >,
): Pick<
  TrackerMatchHistoryEntry,
  "startTimeIso" | "startTime" | "mapAssetId" | "mapVersionId" | "gameVariantCategory" | "outcome"
> {
  return {
    startTime: overrides.startTime ?? "2026-01-01T12:00:00.000Z",
    startTimeIso: overrides.startTimeIso,
    mapAssetId: overrides.mapAssetId ?? "map-1",
    mapVersionId: overrides.mapVersionId ?? "map-version-1",
    gameVariantCategory: overrides.gameVariantCategory ?? 6,
    outcome: overrides.outcome ?? "Win",
  };
}

describe("buildSeriesGroupKey", () => {
  it("produces a stable key regardless of input order or duplicates", () => {
    expect(buildSeriesGroupKey(["match-2", "match-1"])).toBe("match-1:match-2");
    expect(buildSeriesGroupKey(["match-1", "match-2", "match-1"])).toBe("match-1:match-2");
  });
});

describe("getDefaultSeriesGroupSubtitle", () => {
  it("infers Best of 3 from two wins and one loss over three logical games", () => {
    const subtitle = getDefaultSeriesGroupSubtitle([
      aMatchEntryWith({
        startTimeIso: "2026-01-01T12:00:00.000Z",
        mapAssetId: "m1",
        mapVersionId: "v1",
        outcome: "Win",
      }),
      aMatchEntryWith({
        startTimeIso: "2026-01-01T12:10:00.000Z",
        mapAssetId: "m2",
        mapVersionId: "v2",
        outcome: "Loss",
      }),
      aMatchEntryWith({
        startTimeIso: "2026-01-01T12:20:00.000Z",
        mapAssetId: "m3",
        mapVersionId: "v3",
        outcome: "Win",
      }),
    ]);

    expect(subtitle).toBe("Best of 3");
  });

  it("uses startTime when startTimeIso is absent and infers Best of 3 from one win and one loss", () => {
    const subtitle = getDefaultSeriesGroupSubtitle([
      aMatchEntryWith({ startTime: "2026-01-01T12:00:00.000Z", mapAssetId: "m1", mapVersionId: "v1", outcome: "Win" }),
      aMatchEntryWith({ startTime: "2026-01-01T12:10:00.000Z", mapAssetId: "m2", mapVersionId: "v2", outcome: "Loss" }),
    ]);

    expect(subtitle).toBe("Best of 3");
  });
});

describe("alignSeriesGroupsToGroupings", () => {
  it("creates new series groups from groupings that have no existing match", () => {
    const groupings: readonly (readonly string[])[] = [["match-1", "match-2"]];
    const seriesGroups: readonly IndividualTrackerSeriesGroup[] = [];

    const result = alignSeriesGroupsToGroupings(groupings, seriesGroups);

    expect(result).toEqual([
      {
        matchIds: ["match-1", "match-2"],
        titleOverride: null,
        subtitleOverride: null,
      },
    ]);
  });

  it("preserves title and subtitle overrides from an existing matching series group", () => {
    const groupings: readonly (readonly string[])[] = [["match-2", "match-1"]];
    const seriesGroups: readonly IndividualTrackerSeriesGroup[] = [
      {
        matchIds: ["match-1", "match-2"],
        titleOverride: "Eagle vs Cobra",
        subtitleOverride: "Best of 3",
      },
    ];

    const result = alignSeriesGroupsToGroupings(groupings, seriesGroups);

    expect(result).toEqual([
      {
        matchIds: ["match-1", "match-2"],
        titleOverride: "Eagle vs Cobra",
        subtitleOverride: "Best of 3",
      },
    ]);
  });

  it("filters out groupings with fewer than two match ids", () => {
    const groupings: readonly (readonly string[])[] = [["match-1"], ["match-2", "match-3"]];
    const seriesGroups: readonly IndividualTrackerSeriesGroup[] = [];

    const result = alignSeriesGroupsToGroupings(groupings, seriesGroups);

    expect(result).toHaveLength(1);
    expect(result[0].matchIds).toEqual(["match-2", "match-3"]);
  });

  it("normalizes match id order in the output regardless of input order", () => {
    const groupings: readonly (readonly string[])[] = [["z-match", "a-match"]];
    const seriesGroups: readonly IndividualTrackerSeriesGroup[] = [];

    const result = alignSeriesGroupsToGroupings(groupings, seriesGroups);

    expect(result[0].matchIds).toEqual(["a-match", "z-match"]);
  });

  it("returns an empty array when all groupings are singletons", () => {
    const groupings: readonly (readonly string[])[] = [["match-1"], ["match-2"]];
    const seriesGroups: readonly IndividualTrackerSeriesGroup[] = [];

    const result = alignSeriesGroupsToGroupings(groupings, seriesGroups);

    expect(result).toEqual([]);
  });
});
