import { UnreachableError } from "../base/unreachable-error";

export enum LeaderboardWindow {
  OneWeek = "1W",
  OneMonth = "1M",
  ThreeMonths = "3M",
  SixMonths = "6M",
  TwelveMonths = "12M",
}

export enum LeaderboardMetric {
  SeriesWinRate = "SERIES_WIN_RATE",
  Kills = "KILLS",
  Deaths = "DEATHS",
  Assists = "ASSISTS",
  HeadshotKills = "HEADSHOT_KILLS",
  ShotsHit = "SHOTS_HIT",
  ShotsFired = "SHOTS_FIRED",
  Kda = "KDA",
  Accuracy = "ACCURACY",
  DamageDealt = "DAMAGE_DEALT",
  DamageTaken = "DAMAGE_TAKEN",
  DamageRatio = "DAMAGE_RATIO",
  AvgLifeSeconds = "AVG_LIFE_SECONDS",
  AvgDamagePerLife = "AVG_DAMAGE_PER_LIFE",
  PersonalScore = "PERSONAL_SCORE",
}

/**
 * Stat family groups leaderboard metrics for the two-step Discord picker (family -> aggregation).
 * Every `LeaderboardMetric` belongs to exactly one family; families with more than one valid
 * aggregation (e.g. total vs. average per series) will expose an aggregation selector once those
 * variants exist.
 */
export enum LeaderboardMetricFamily {
  PersonalScore = "PERSONAL_SCORE",
  Kills = "KILLS",
  Deaths = "DEATHS",
  Assists = "ASSISTS",
  HeadshotKills = "HEADSHOT_KILLS",
  ShotsHit = "SHOTS_HIT",
  ShotsFired = "SHOTS_FIRED",
  DamageDealt = "DAMAGE_DEALT",
  DamageTaken = "DAMAGE_TAKEN",
  SeriesWinRate = "SERIES_WIN_RATE",
  Kda = "KDA",
  Accuracy = "ACCURACY",
  DamageRatio = "DAMAGE_RATIO",
  AvgLifeSeconds = "AVG_LIFE_SECONDS",
  AvgDamagePerLife = "AVG_DAMAGE_PER_LIFE",
}

export enum LeaderboardMetricAggregation {
  Total = "TOTAL",
}

export function getLeaderboardMetricFamily(metric: LeaderboardMetric): LeaderboardMetricFamily {
  switch (metric) {
    case LeaderboardMetric.PersonalScore: {
      return LeaderboardMetricFamily.PersonalScore;
    }
    case LeaderboardMetric.Kills: {
      return LeaderboardMetricFamily.Kills;
    }
    case LeaderboardMetric.Deaths: {
      return LeaderboardMetricFamily.Deaths;
    }
    case LeaderboardMetric.Assists: {
      return LeaderboardMetricFamily.Assists;
    }
    case LeaderboardMetric.HeadshotKills: {
      return LeaderboardMetricFamily.HeadshotKills;
    }
    case LeaderboardMetric.ShotsHit: {
      return LeaderboardMetricFamily.ShotsHit;
    }
    case LeaderboardMetric.ShotsFired: {
      return LeaderboardMetricFamily.ShotsFired;
    }
    case LeaderboardMetric.DamageDealt: {
      return LeaderboardMetricFamily.DamageDealt;
    }
    case LeaderboardMetric.DamageTaken: {
      return LeaderboardMetricFamily.DamageTaken;
    }
    case LeaderboardMetric.SeriesWinRate: {
      return LeaderboardMetricFamily.SeriesWinRate;
    }
    case LeaderboardMetric.Kda: {
      return LeaderboardMetricFamily.Kda;
    }
    case LeaderboardMetric.Accuracy: {
      return LeaderboardMetricFamily.Accuracy;
    }
    case LeaderboardMetric.DamageRatio: {
      return LeaderboardMetricFamily.DamageRatio;
    }
    case LeaderboardMetric.AvgLifeSeconds: {
      return LeaderboardMetricFamily.AvgLifeSeconds;
    }
    case LeaderboardMetric.AvgDamagePerLife: {
      return LeaderboardMetricFamily.AvgDamagePerLife;
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

/**
 * Valid aggregations for a family, in preferred/default order. An empty array means the family
 * has a single implicit form (rate/ratio/lifetime metrics) and should not show an aggregation selector.
 */
export function getLeaderboardFamilyAggregations(
  family: LeaderboardMetricFamily,
): readonly LeaderboardMetricAggregation[] {
  switch (family) {
    case LeaderboardMetricFamily.PersonalScore:
    case LeaderboardMetricFamily.Kills:
    case LeaderboardMetricFamily.Deaths:
    case LeaderboardMetricFamily.Assists:
    case LeaderboardMetricFamily.HeadshotKills:
    case LeaderboardMetricFamily.ShotsHit:
    case LeaderboardMetricFamily.ShotsFired:
    case LeaderboardMetricFamily.DamageDealt:
    case LeaderboardMetricFamily.DamageTaken: {
      return [LeaderboardMetricAggregation.Total];
    }
    case LeaderboardMetricFamily.SeriesWinRate:
    case LeaderboardMetricFamily.Kda:
    case LeaderboardMetricFamily.Accuracy:
    case LeaderboardMetricFamily.DamageRatio:
    case LeaderboardMetricFamily.AvgLifeSeconds:
    case LeaderboardMetricFamily.AvgDamagePerLife: {
      return [];
    }
    default: {
      throw new UnreachableError(family);
    }
  }
}

export function getDefaultLeaderboardAggregation(family: LeaderboardMetricFamily): LeaderboardMetricAggregation | null {
  return getLeaderboardFamilyAggregations(family)[0] ?? null;
}

/**
 * Resolves a (family, aggregation) selection to one concrete `LeaderboardMetric`. Callers must
 * validate the aggregation against `getLeaderboardFamilyAggregations` before calling this — an
 * unsupported combination is treated as a programming error, not user input.
 */
export function resolveLeaderboardMetric(
  family: LeaderboardMetricFamily,
  aggregation: LeaderboardMetricAggregation | null,
): LeaderboardMetric {
  const supportedAggregations = getLeaderboardFamilyAggregations(family);
  const resolvedAggregation = aggregation ?? getDefaultLeaderboardAggregation(family);

  const isUnsupportedAggregation =
    supportedAggregations.length > 0
      ? resolvedAggregation == null || !supportedAggregations.includes(resolvedAggregation)
      : aggregation != null;
  if (isUnsupportedAggregation) {
    throw new Error(`Unsupported leaderboard aggregation for family "${family}"`);
  }

  switch (family) {
    case LeaderboardMetricFamily.PersonalScore: {
      return LeaderboardMetric.PersonalScore;
    }
    case LeaderboardMetricFamily.Kills: {
      return LeaderboardMetric.Kills;
    }
    case LeaderboardMetricFamily.Deaths: {
      return LeaderboardMetric.Deaths;
    }
    case LeaderboardMetricFamily.Assists: {
      return LeaderboardMetric.Assists;
    }
    case LeaderboardMetricFamily.HeadshotKills: {
      return LeaderboardMetric.HeadshotKills;
    }
    case LeaderboardMetricFamily.ShotsHit: {
      return LeaderboardMetric.ShotsHit;
    }
    case LeaderboardMetricFamily.ShotsFired: {
      return LeaderboardMetric.ShotsFired;
    }
    case LeaderboardMetricFamily.DamageDealt: {
      return LeaderboardMetric.DamageDealt;
    }
    case LeaderboardMetricFamily.DamageTaken: {
      return LeaderboardMetric.DamageTaken;
    }
    case LeaderboardMetricFamily.SeriesWinRate: {
      return LeaderboardMetric.SeriesWinRate;
    }
    case LeaderboardMetricFamily.Kda: {
      return LeaderboardMetric.Kda;
    }
    case LeaderboardMetricFamily.Accuracy: {
      return LeaderboardMetric.Accuracy;
    }
    case LeaderboardMetricFamily.DamageRatio: {
      return LeaderboardMetric.DamageRatio;
    }
    case LeaderboardMetricFamily.AvgLifeSeconds: {
      return LeaderboardMetric.AvgLifeSeconds;
    }
    case LeaderboardMetricFamily.AvgDamagePerLife: {
      return LeaderboardMetric.AvgDamagePerLife;
    }
    default: {
      throw new UnreachableError(family);
    }
  }
}

export function getLeaderboardMetricFamilyLabel(family: LeaderboardMetricFamily): string {
  switch (family) {
    case LeaderboardMetricFamily.PersonalScore: {
      return "Personal score";
    }
    case LeaderboardMetricFamily.Kills: {
      return "Kills";
    }
    case LeaderboardMetricFamily.Deaths: {
      return "Deaths";
    }
    case LeaderboardMetricFamily.Assists: {
      return "Assists";
    }
    case LeaderboardMetricFamily.HeadshotKills: {
      return "Headshot kills";
    }
    case LeaderboardMetricFamily.ShotsHit: {
      return "Shots hit";
    }
    case LeaderboardMetricFamily.ShotsFired: {
      return "Shots fired";
    }
    case LeaderboardMetricFamily.DamageDealt: {
      return "Damage dealt";
    }
    case LeaderboardMetricFamily.DamageTaken: {
      return "Damage taken";
    }
    case LeaderboardMetricFamily.SeriesWinRate: {
      return "Series win rate";
    }
    case LeaderboardMetricFamily.Kda: {
      return "KDA";
    }
    case LeaderboardMetricFamily.Accuracy: {
      return "Accuracy";
    }
    case LeaderboardMetricFamily.DamageRatio: {
      return "Damage ratio";
    }
    case LeaderboardMetricFamily.AvgLifeSeconds: {
      return "Avg life time";
    }
    case LeaderboardMetricFamily.AvgDamagePerLife: {
      return "Avg damage per life";
    }
    default: {
      throw new UnreachableError(family);
    }
  }
}

export function getLeaderboardMetricAggregationLabel(aggregation: LeaderboardMetricAggregation): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- becomes non-trivial once PR6b adds aggregations
  if (aggregation === LeaderboardMetricAggregation.Total) {
    return "Total";
  }

  throw new UnreachableError(aggregation);
}
