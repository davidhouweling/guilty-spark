import { describe, expect, it } from "vitest";
import {
  buildSeriesGroupKey,
  getDefaultSeriesGroupSubtitle,
  getDefaultSeriesGroupTitle,
  normalizeSeriesGroupMatchIds,
} from "../series-grouping";

describe("getDefaultSeriesGroupTitle()", () => {
  it("returns the placeholder title", () => {
    expect(getDefaultSeriesGroupTitle()).toBe("Eagle vs Cobra");
  });
});

describe("getDefaultSeriesGroupSubtitle()", () => {
  it("infers Best of 3 from two wins and one loss over three logical games", () => {
    const subtitle = getDefaultSeriesGroupSubtitle([
      {
        startTime: "2024-11-26T11:00:00.000Z",
        mapAssetId: "m1",
        mapVersionId: "v1",
        gameVariantCategory: 6,
        outcome: "Win",
      },
      {
        startTime: "2024-11-26T11:10:00.000Z",
        mapAssetId: "m2",
        mapVersionId: "v2",
        gameVariantCategory: 6,
        outcome: "Loss",
      },
      {
        startTime: "2024-11-26T11:20:00.000Z",
        mapAssetId: "m3",
        mapVersionId: "v3",
        gameVariantCategory: 6,
        outcome: "Win",
      },
    ]);

    expect(subtitle).toBe("Best of 3");
  });

  it("collapses sequential duplicates before counting logical games", () => {
    const subtitle = getDefaultSeriesGroupSubtitle([
      {
        startTime: "2024-11-26T11:00:00.000Z",
        mapAssetId: "m1",
        mapVersionId: "v1",
        gameVariantCategory: 6,
        outcome: "Loss",
      },
      {
        startTime: "2024-11-26T11:10:00.000Z",
        mapAssetId: "m1",
        mapVersionId: "v1",
        gameVariantCategory: 6,
        outcome: "Win",
      },
    ]);

    expect(subtitle).toBe("Best of 1");
  });
});

describe("normalizeSeriesGroupMatchIds()", () => {
  it("sorts and de-duplicates match ids", () => {
    expect(normalizeSeriesGroupMatchIds(["b", "a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("buildSeriesGroupKey()", () => {
  it("produces a stable key regardless of input order or duplicates", () => {
    expect(buildSeriesGroupKey(["match-2", "match-1"])).toBe("match-1:match-2");
    expect(buildSeriesGroupKey(["match-1", "match-2", "match-1"])).toBe("match-1:match-2");
  });
});
