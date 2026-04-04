import { describe, it, expect } from "vitest";
import { mergeCoreStats, adjustAveragesInCoreStats } from "../series-core-stats.mjs";
import { aFakeCoreStatsWith } from "../fakes/data.mjs";

describe("mergeCoreStats", () => {
  it("merges numeric stats by summing", () => {
    const existing = aFakeCoreStatsWith({ Kills: 10, Deaths: 5 });
    const incoming = aFakeCoreStatsWith({ Kills: 15, Deaths: 8 });

    const result = mergeCoreStats(existing, incoming);

    expect(result.Kills).toBe(25);
    expect(result.Deaths).toBe(13);
  });

  it("concatenates average life durations", () => {
    const existing = aFakeCoreStatsWith({ AverageLifeDuration: "PT30S" });
    const incoming = aFakeCoreStatsWith({ AverageLifeDuration: "PT45S" });

    const result = mergeCoreStats(existing, incoming);

    expect(result.AverageLifeDuration).toBe("PT30S,PT45S");
  });

  it("merges medals by NameId", () => {
    const existing = aFakeCoreStatsWith({
      Medals: [
        { NameId: 100, Count: 2, TotalPersonalScoreAwarded: 50 },
        { NameId: 200, Count: 1, TotalPersonalScoreAwarded: 25 },
      ],
    });
    const incoming = aFakeCoreStatsWith({
      Medals: [
        { NameId: 100, Count: 3, TotalPersonalScoreAwarded: 75 },
        { NameId: 300, Count: 1, TotalPersonalScoreAwarded: 30 },
      ],
    });

    const result = mergeCoreStats(existing, incoming);

    expect(result.Medals).toHaveLength(3);
    const medal100 = result.Medals.find((m) => m.NameId === 100);
    expect(medal100?.Count).toBe(5);
    expect(medal100?.TotalPersonalScoreAwarded).toBe(125);
  });

  it("merges PersonalScores by NameId", () => {
    const existing = aFakeCoreStatsWith({
      PersonalScores: [{ NameId: 1000, Count: 5, TotalPersonalScoreAwarded: 500 }],
    });
    const incoming = aFakeCoreStatsWith({
      PersonalScores: [{ NameId: 1000, Count: 3, TotalPersonalScoreAwarded: 300 }],
    });

    const result = mergeCoreStats(existing, incoming);

    expect(result.PersonalScores).toHaveLength(1);
    expect(result.PersonalScores[0]?.Count).toBe(8);
    expect(result.PersonalScores[0]?.TotalPersonalScoreAwarded).toBe(800);
  });
});

describe("adjustAveragesInCoreStats", () => {
  it("averages accuracy across matches", () => {
    const coreStats = aFakeCoreStatsWith({ Accuracy: 150 });

    const result = adjustAveragesInCoreStats(coreStats, 3);

    expect(result.Accuracy).toBe(50);
  });

  it("averages life duration from concatenated values", () => {
    const coreStats = aFakeCoreStatsWith({ AverageLifeDuration: "PT30S,PT45S,PT60S" });

    const result = adjustAveragesInCoreStats(coreStats, 3);

    expect(result.AverageLifeDuration).toBe("PT45.0S");
  });

  it("handles single life duration", () => {
    const coreStats = aFakeCoreStatsWith({ AverageLifeDuration: "PT38.1S" });

    const result = adjustAveragesInCoreStats(coreStats, 1);

    expect(result.AverageLifeDuration).toBe("PT38.1S");
  });
});
