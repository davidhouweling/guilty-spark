import { describe, expect, it } from "vitest";
import {
  LeaderboardMetric,
  LeaderboardMetricAggregation,
  LeaderboardMetricFamily,
  getDefaultLeaderboardAggregation,
  getLeaderboardFamilyAggregations,
  getLeaderboardMetricAggregationLabel,
  getLeaderboardMetricFamily,
  getLeaderboardMetricFamilyLabel,
  resolveLeaderboardMetric,
} from "../leaderboard";

describe("getLeaderboardMetricFamily", () => {
  it.each(Object.values(LeaderboardMetric))("resolves a family for every LeaderboardMetric member (%s)", (metric) => {
    expect(() => getLeaderboardMetricFamily(metric)).not.toThrow();
  });
});

describe("getLeaderboardFamilyAggregations / getDefaultLeaderboardAggregation", () => {
  it("exposes all aggregations for gameplay fact families in selector order", () => {
    expect(getLeaderboardFamilyAggregations(LeaderboardMetricFamily.Kills)).toEqual([
      LeaderboardMetricAggregation.AvgPerSeries,
      LeaderboardMetricAggregation.AvgPerGame,
      LeaderboardMetricAggregation.Total,
    ]);
    expect(getDefaultLeaderboardAggregation(LeaderboardMetricFamily.Kills)).toBe(LeaderboardMetricAggregation.Total);
  });

  it("exposes Overall performance for inherent-form families", () => {
    expect(getLeaderboardFamilyAggregations(LeaderboardMetricFamily.SeriesWinRate)).toEqual([
      LeaderboardMetricAggregation.OverallPerformance,
    ]);
    expect(getDefaultLeaderboardAggregation(LeaderboardMetricFamily.SeriesWinRate)).toBe(
      LeaderboardMetricAggregation.OverallPerformance,
    );
  });
});

describe("resolveLeaderboardMetric", () => {
  it("resolves a count/score family with an explicit Total aggregation", () => {
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.Kills, LeaderboardMetricAggregation.Total)).toBe(
      LeaderboardMetric.Kills,
    );
  });

  it("defaults to Total when no aggregation is provided for a count/score family", () => {
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.DamageDealt, null)).toBe(LeaderboardMetric.DamageDealt);
  });

  it("resolves a rate/ratio/lifetime family with Overall performance (explicit or defaulted)", () => {
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.Kda, LeaderboardMetricAggregation.OverallPerformance)).toBe(
      LeaderboardMetric.Kda,
    );
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.SeriesWinRate, null)).toBe(LeaderboardMetric.SeriesWinRate);
  });

  it("throws when an unsupported aggregation is passed for a rate/ratio/lifetime family", () => {
    expect(() => resolveLeaderboardMetric(LeaderboardMetricFamily.Kda, LeaderboardMetricAggregation.Total)).toThrow();
  });

  it("round-trips every LeaderboardMetric through its family and default aggregation", () => {
    for (const metric of Object.values(LeaderboardMetric)) {
      const family = getLeaderboardMetricFamily(metric);
      const defaultAggregation = getDefaultLeaderboardAggregation(family);
      const aggregation = metric.includes("_PER_SERIES")
        ? LeaderboardMetricAggregation.AvgPerSeries
        : metric.includes("_PER_GAME")
          ? LeaderboardMetricAggregation.AvgPerGame
          : defaultAggregation;
      expect(resolveLeaderboardMetric(family, aggregation)).toBe(metric);
    }
  });
});

describe("getLeaderboardMetricFamilyLabel / getLeaderboardMetricAggregationLabel", () => {
  it.each(Object.values(LeaderboardMetricFamily))("returns a non-empty label for family %s", (family) => {
    expect(getLeaderboardMetricFamilyLabel(family).length).toBeGreaterThan(0);
  });

  it("returns a label for the Total aggregation", () => {
    expect(getLeaderboardMetricAggregationLabel(LeaderboardMetricAggregation.Total)).toBe("Total");
  });
});
