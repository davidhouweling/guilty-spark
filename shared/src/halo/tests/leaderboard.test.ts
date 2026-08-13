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
  it("exposes a single Total aggregation for count/score families", () => {
    expect(getLeaderboardFamilyAggregations(LeaderboardMetricFamily.Kills)).toEqual([
      LeaderboardMetricAggregation.Total,
    ]);
    expect(getDefaultLeaderboardAggregation(LeaderboardMetricFamily.Kills)).toBe(LeaderboardMetricAggregation.Total);
  });

  it("exposes no aggregations for rate/ratio/lifetime families", () => {
    expect(getLeaderboardFamilyAggregations(LeaderboardMetricFamily.SeriesWinRate)).toEqual([]);
    expect(getDefaultLeaderboardAggregation(LeaderboardMetricFamily.SeriesWinRate)).toBeNull();
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

  it("resolves a rate/ratio/lifetime family without requiring an aggregation", () => {
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.Kda, null)).toBe(LeaderboardMetric.Kda);
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.SeriesWinRate, null)).toBe(LeaderboardMetric.SeriesWinRate);
  });

  it("throws when an unsupported aggregation is passed for a rate/ratio/lifetime family", () => {
    expect(() => resolveLeaderboardMetric(LeaderboardMetricFamily.Kda, LeaderboardMetricAggregation.Total)).toThrow();
  });

  it("round-trips every LeaderboardMetric through its family and default aggregation", () => {
    for (const metric of Object.values(LeaderboardMetric)) {
      const family = getLeaderboardMetricFamily(metric);
      const defaultAggregation = getDefaultLeaderboardAggregation(family);
      expect(resolveLeaderboardMetric(family, defaultAggregation)).toBe(metric);
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
