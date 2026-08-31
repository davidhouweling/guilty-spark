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

const metricResolutionCases = [
  {
    aggregation: LeaderboardMetricAggregation.AvgPerSeries,
    cases: [
      [LeaderboardMetricFamily.WinPercentage, LeaderboardMetric.SeriesWinRate],
      [LeaderboardMetricFamily.PersonalScore, LeaderboardMetric.AvgPersonalScorePerSeries],
      [LeaderboardMetricFamily.Kills, LeaderboardMetric.AvgKillsPerSeries],
      [LeaderboardMetricFamily.Deaths, LeaderboardMetric.AvgDeathsPerSeries],
      [LeaderboardMetricFamily.Assists, LeaderboardMetric.AvgAssistsPerSeries],
      [LeaderboardMetricFamily.HeadshotKills, LeaderboardMetric.AvgHeadshotKillsPerSeries],
      [LeaderboardMetricFamily.ShotsHit, LeaderboardMetric.AvgShotsHitPerSeries],
      [LeaderboardMetricFamily.ShotsFired, LeaderboardMetric.AvgShotsFiredPerSeries],
      [LeaderboardMetricFamily.DamageDealt, LeaderboardMetric.AvgDamageDealtPerSeries],
      [LeaderboardMetricFamily.DamageTaken, LeaderboardMetric.AvgDamageTakenPerSeries],
      [LeaderboardMetricFamily.MedalPoints, LeaderboardMetric.AvgMedalPointsPerSeries],
      [LeaderboardMetricFamily.MythicMedals, LeaderboardMetric.AvgMythicMedalsPerSeries],
    ],
  },
  {
    aggregation: LeaderboardMetricAggregation.AvgPerGame,
    cases: [
      [LeaderboardMetricFamily.WinPercentage, LeaderboardMetric.GamesWinRate],
      [LeaderboardMetricFamily.PersonalScore, LeaderboardMetric.AvgPersonalScorePerGame],
      [LeaderboardMetricFamily.Kills, LeaderboardMetric.AvgKillsPerGame],
      [LeaderboardMetricFamily.Deaths, LeaderboardMetric.AvgDeathsPerGame],
      [LeaderboardMetricFamily.Assists, LeaderboardMetric.AvgAssistsPerGame],
      [LeaderboardMetricFamily.HeadshotKills, LeaderboardMetric.AvgHeadshotKillsPerGame],
      [LeaderboardMetricFamily.ShotsHit, LeaderboardMetric.AvgShotsHitPerGame],
      [LeaderboardMetricFamily.ShotsFired, LeaderboardMetric.AvgShotsFiredPerGame],
      [LeaderboardMetricFamily.DamageDealt, LeaderboardMetric.AvgDamageDealtPerGame],
      [LeaderboardMetricFamily.DamageTaken, LeaderboardMetric.AvgDamageTakenPerGame],
      [LeaderboardMetricFamily.MedalPoints, LeaderboardMetric.AvgMedalPointsPerGame],
      [LeaderboardMetricFamily.MythicMedals, LeaderboardMetric.AvgMythicMedalsPerGame],
      [LeaderboardMetricFamily.ObjectiveTime, LeaderboardMetric.AvgObjectiveTimePerGame],
      [LeaderboardMetricFamily.ObjectiveTeamContribution, LeaderboardMetric.ObjectiveTeamContribution],
      [LeaderboardMetricFamily.Kda, LeaderboardMetric.Kda],
      [LeaderboardMetricFamily.Accuracy, LeaderboardMetric.Accuracy],
      [LeaderboardMetricFamily.DamageRatio, LeaderboardMetric.DamageRatio],
      [LeaderboardMetricFamily.AvgLifeSeconds, LeaderboardMetric.AvgLifeSeconds],
      [LeaderboardMetricFamily.AvgDamagePerLife, LeaderboardMetric.AvgDamagePerLife],
    ],
  },
  {
    aggregation: LeaderboardMetricAggregation.Total,
    cases: [
      [LeaderboardMetricFamily.SeriesPlayed, LeaderboardMetric.SeriesPlayed],
      [LeaderboardMetricFamily.SeriesWins, LeaderboardMetric.SeriesWins],
      [LeaderboardMetricFamily.GamesPlayed, LeaderboardMetric.GamesPlayed],
      [LeaderboardMetricFamily.GameWins, LeaderboardMetric.GameWins],
      [LeaderboardMetricFamily.PersonalScore, LeaderboardMetric.PersonalScore],
      [LeaderboardMetricFamily.Kills, LeaderboardMetric.Kills],
      [LeaderboardMetricFamily.Deaths, LeaderboardMetric.Deaths],
      [LeaderboardMetricFamily.Assists, LeaderboardMetric.Assists],
      [LeaderboardMetricFamily.HeadshotKills, LeaderboardMetric.HeadshotKills],
      [LeaderboardMetricFamily.ShotsHit, LeaderboardMetric.ShotsHit],
      [LeaderboardMetricFamily.ShotsFired, LeaderboardMetric.ShotsFired],
      [LeaderboardMetricFamily.DamageDealt, LeaderboardMetric.DamageDealt],
      [LeaderboardMetricFamily.DamageTaken, LeaderboardMetric.DamageTaken],
      [LeaderboardMetricFamily.ObjectiveTime, LeaderboardMetric.ObjectiveTime],
      [LeaderboardMetricFamily.MedalPoints, LeaderboardMetric.MedalPoints],
      [LeaderboardMetricFamily.MythicMedals, LeaderboardMetric.MythicMedals],
    ],
  },
  {
    aggregation: LeaderboardMetricAggregation.AvgPerObjective,
    cases: [
      [LeaderboardMetricFamily.FlagCaptures, LeaderboardMetric.AvgFlagCapturesPerObjective],
      [LeaderboardMetricFamily.FlagCaptureAssists, LeaderboardMetric.AvgFlagCaptureAssistsPerObjective],
      [LeaderboardMetricFamily.FlagGrabs, LeaderboardMetric.AvgFlagGrabsPerObjective],
      [LeaderboardMetricFamily.FlagReturns, LeaderboardMetric.AvgFlagReturnsPerObjective],
      [LeaderboardMetricFamily.FlagSecures, LeaderboardMetric.AvgFlagSecuresPerObjective],
      [LeaderboardMetricFamily.FlagSteals, LeaderboardMetric.AvgFlagStealsPerObjective],
      [LeaderboardMetricFamily.FlagCarriersKilled, LeaderboardMetric.AvgFlagCarriersKilledPerObjective],
      [LeaderboardMetricFamily.FlagReturnersKilled, LeaderboardMetric.AvgFlagReturnersKilledPerObjective],
      [LeaderboardMetricFamily.FlagCarrierKills, LeaderboardMetric.AvgFlagCarrierKillsPerObjective],
      [LeaderboardMetricFamily.FlagReturnerKills, LeaderboardMetric.AvgFlagReturnerKillsPerObjective],
      [LeaderboardMetricFamily.StrongholdCaptures, LeaderboardMetric.AvgStrongholdCapturesPerObjective],
      [LeaderboardMetricFamily.StrongholdSecures, LeaderboardMetric.AvgStrongholdSecuresPerObjective],
      [LeaderboardMetricFamily.StrongholdOffensiveKills, LeaderboardMetric.AvgStrongholdOffensiveKillsPerObjective],
      [LeaderboardMetricFamily.StrongholdDefensiveKills, LeaderboardMetric.AvgStrongholdDefensiveKillsPerObjective],
      [LeaderboardMetricFamily.HillScoringTicks, LeaderboardMetric.AvgHillScoringTicksPerObjective],
      [LeaderboardMetricFamily.HillOffensiveKills, LeaderboardMetric.AvgHillOffensiveKillsPerObjective],
      [LeaderboardMetricFamily.HillDefensiveKills, LeaderboardMetric.AvgHillDefensiveKillsPerObjective],
      [LeaderboardMetricFamily.BallScoringTicks, LeaderboardMetric.AvgBallScoringTicksPerObjective],
      [LeaderboardMetricFamily.BallGrabs, LeaderboardMetric.AvgBallGrabsPerObjective],
      [LeaderboardMetricFamily.BallCarriersKilled, LeaderboardMetric.AvgBallCarriersKilledPerObjective],
      [LeaderboardMetricFamily.BallCarrierKills, LeaderboardMetric.AvgBallCarrierKillsPerObjective],
    ],
  },
  {
    aggregation: LeaderboardMetricAggregation.TotalObjective,
    cases: [
      [LeaderboardMetricFamily.FlagCaptures, LeaderboardMetric.FlagCaptures],
      [LeaderboardMetricFamily.FlagCaptureAssists, LeaderboardMetric.FlagCaptureAssists],
      [LeaderboardMetricFamily.FlagGrabs, LeaderboardMetric.FlagGrabs],
      [LeaderboardMetricFamily.FlagReturns, LeaderboardMetric.FlagReturns],
      [LeaderboardMetricFamily.FlagSecures, LeaderboardMetric.FlagSecures],
      [LeaderboardMetricFamily.FlagSteals, LeaderboardMetric.FlagSteals],
      [LeaderboardMetricFamily.FlagCarriersKilled, LeaderboardMetric.FlagCarriersKilled],
      [LeaderboardMetricFamily.FlagReturnersKilled, LeaderboardMetric.FlagReturnersKilled],
      [LeaderboardMetricFamily.FlagCarrierKills, LeaderboardMetric.FlagCarrierKills],
      [LeaderboardMetricFamily.FlagReturnerKills, LeaderboardMetric.FlagReturnerKills],
      [LeaderboardMetricFamily.StrongholdCaptures, LeaderboardMetric.StrongholdCaptures],
      [LeaderboardMetricFamily.StrongholdSecures, LeaderboardMetric.StrongholdSecures],
      [LeaderboardMetricFamily.StrongholdOffensiveKills, LeaderboardMetric.StrongholdOffensiveKills],
      [LeaderboardMetricFamily.StrongholdDefensiveKills, LeaderboardMetric.StrongholdDefensiveKills],
      [LeaderboardMetricFamily.HillScoringTicks, LeaderboardMetric.HillScoringTicks],
      [LeaderboardMetricFamily.HillOffensiveKills, LeaderboardMetric.HillOffensiveKills],
      [LeaderboardMetricFamily.HillDefensiveKills, LeaderboardMetric.HillDefensiveKills],
      [LeaderboardMetricFamily.BallScoringTicks, LeaderboardMetric.BallScoringTicks],
      [LeaderboardMetricFamily.BallGrabs, LeaderboardMetric.BallGrabs],
      [LeaderboardMetricFamily.BallCarriersKilled, LeaderboardMetric.BallCarriersKilled],
      [LeaderboardMetricFamily.BallCarrierKills, LeaderboardMetric.BallCarrierKills],
    ],
  },
] as const;

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

  it("exposes series and game averages for Win percentage", () => {
    expect(getLeaderboardFamilyAggregations(LeaderboardMetricFamily.WinPercentage)).toEqual([
      LeaderboardMetricAggregation.AvgPerSeries,
      LeaderboardMetricAggregation.AvgPerGame,
    ]);
    expect(getDefaultLeaderboardAggregation(LeaderboardMetricFamily.WinPercentage)).toBe(
      LeaderboardMetricAggregation.AvgPerGame,
    );
  });
});

describe("resolveLeaderboardMetric", () => {
  it("resolves a count/score family with an explicit Total aggregation", () => {
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.Kills, LeaderboardMetricAggregation.Total)).toBe(
      LeaderboardMetric.Kills,
    );
  });

  it("resolves objective time as total or average per applicable game", () => {
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.ObjectiveTime, LeaderboardMetricAggregation.Total)).toBe(
      LeaderboardMetric.ObjectiveTime,
    );
    expect(
      resolveLeaderboardMetric(LeaderboardMetricFamily.ObjectiveTime, LeaderboardMetricAggregation.AvgPerGame),
    ).toBe(LeaderboardMetric.AvgObjectiveTimePerGame);
  });

  it("defaults to Total when no aggregation is provided for a count/score family", () => {
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.DamageDealt, null)).toBe(LeaderboardMetric.DamageDealt);
  });

  it("resolves KDA with Avg per game", () => {
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.Kda, LeaderboardMetricAggregation.AvgPerGame)).toBe(
      LeaderboardMetric.Kda,
    );
    expect(
      resolveLeaderboardMetric(LeaderboardMetricFamily.WinPercentage, LeaderboardMetricAggregation.AvgPerSeries),
    ).toBe(LeaderboardMetric.SeriesWinRate);
  });

  it("throws when an unsupported aggregation is passed for a per-game-only family", () => {
    expect(() => resolveLeaderboardMetric(LeaderboardMetricFamily.Kda, LeaderboardMetricAggregation.Total)).toThrow();
  });

  it("resolves medal averages and totals", () => {
    expect(
      resolveLeaderboardMetric(LeaderboardMetricFamily.MedalPoints, LeaderboardMetricAggregation.AvgPerSeries),
    ).toBe(LeaderboardMetric.AvgMedalPointsPerSeries);
    expect(
      resolveLeaderboardMetric(LeaderboardMetricFamily.MythicMedals, LeaderboardMetricAggregation.AvgPerGame),
    ).toBe(LeaderboardMetric.AvgMythicMedalsPerGame);
    expect(resolveLeaderboardMetric(LeaderboardMetricFamily.MedalPoints, LeaderboardMetricAggregation.Total)).toBe(
      LeaderboardMetric.MedalPoints,
    );
  });

  describe.each(metricResolutionCases)("$aggregation", ({ aggregation, cases }) => {
    it.each(cases.map(([family, metric]) => ({ family, metric })))(
      "resolves $family to $metric",
      ({ family, metric }) => {
        expect(resolveLeaderboardMetric(family, aggregation)).toBe(metric);
      },
    );
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
