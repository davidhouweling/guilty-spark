import { describe, expect, it } from "vitest";
import { collapseSequentialSeriesEntries, countSequentialSeriesGames } from "../match-enrichment";

describe("collapseSequentialSeriesEntries", () => {
  it("keeps only the final sequential entry for identical map version and game variant", () => {
    const entries = [
      {
        startTime: "2026-01-01T00:00:00.000Z",
        mapAssetId: "map-1",
        mapVersionId: "map-version-1",
        gameVariantCategory: 6,
        id: "first",
      },
      {
        startTime: "2026-01-01T00:10:00.000Z",
        mapAssetId: "map-1",
        mapVersionId: "map-version-1",
        gameVariantCategory: 6,
        id: "second",
      },
      {
        startTime: "2026-01-01T00:20:00.000Z",
        mapAssetId: "map-2",
        mapVersionId: "map-version-2",
        gameVariantCategory: 6,
        id: "third",
      },
    ] as const;

    expect(collapseSequentialSeriesEntries(entries).map((entry) => entry.id)).toEqual(["second", "third"]);
  });

  it("counts each change in map version or game variant as a separate series game", () => {
    const entries = [
      {
        startTime: "2026-01-01T00:00:00.000Z",
        mapAssetId: "map-1",
        mapVersionId: "map-version-1",
        gameVariantCategory: 6,
      },
      {
        startTime: "2026-01-01T00:10:00.000Z",
        mapAssetId: "map-1",
        mapVersionId: "map-version-2",
        gameVariantCategory: 6,
      },
      {
        startTime: "2026-01-01T00:20:00.000Z",
        mapAssetId: "map-1",
        mapVersionId: "map-version-2",
        gameVariantCategory: 7,
      },
    ] as const;

    expect(countSequentialSeriesGames(entries)).toBe(3);
  });
});
