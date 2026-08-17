import { UnreachableError } from "../base/unreachable-error";

export enum LeaderboardWindow {
  LastReset = "RESET",
  OneWeek = "1W",
  OneMonth = "1M",
  ThreeMonths = "3M",
  SixMonths = "6M",
  TwelveMonths = "12M",
}
export enum LeaderboardMetric {
  SeriesPlayed = "SERIES_PLAYED",
  SeriesWins = "SERIES_WINS",
  SeriesWinRate = "SERIES_WIN_RATE",
  GamesPlayed = "GAMES_PLAYED",
  GameWins = "GAME_WINS",
  MedalPoints = "MEDAL_POINTS",
  MythicMedals = "MYTHIC_MEDALS",
  ObjectiveTime = "OBJECTIVE_TIME",
  AvgObjectiveTimePerGame = "AVG_OBJECTIVE_TIME_PER_GAME",
  ObjectiveTeamContribution = "OBJECTIVE_TEAM_CONTRIBUTION",
  ObjectiveGameContribution = "OBJECTIVE_GAME_CONTRIBUTION",
  GamesWinRate = "GAMES_WIN_RATE",
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
  AvgPersonalScorePerSeries = "AVG_PERSONAL_SCORE_PER_SERIES",
  AvgKillsPerSeries = "AVG_KILLS_PER_SERIES",
  AvgDeathsPerSeries = "AVG_DEATHS_PER_SERIES",
  AvgAssistsPerSeries = "AVG_ASSISTS_PER_SERIES",
  AvgHeadshotKillsPerSeries = "AVG_HEADSHOT_KILLS_PER_SERIES",
  AvgShotsHitPerSeries = "AVG_SHOTS_HIT_PER_SERIES",
  AvgShotsFiredPerSeries = "AVG_SHOTS_FIRED_PER_SERIES",
  AvgDamageDealtPerSeries = "AVG_DAMAGE_DEALT_PER_SERIES",
  AvgDamageTakenPerSeries = "AVG_DAMAGE_TAKEN_PER_SERIES",
  AvgPersonalScorePerGame = "AVG_PERSONAL_SCORE_PER_GAME",
  AvgKillsPerGame = "AVG_KILLS_PER_GAME",
  AvgDeathsPerGame = "AVG_DEATHS_PER_GAME",
  AvgAssistsPerGame = "AVG_ASSISTS_PER_GAME",
  AvgHeadshotKillsPerGame = "AVG_HEADSHOT_KILLS_PER_GAME",
  AvgShotsHitPerGame = "AVG_SHOTS_HIT_PER_GAME",
  AvgShotsFiredPerGame = "AVG_SHOTS_FIRED_PER_GAME",
  AvgDamageDealtPerGame = "AVG_DAMAGE_DEALT_PER_GAME",
  AvgDamageTakenPerGame = "AVG_DAMAGE_TAKEN_PER_GAME",
}

/**
 * Stat family groups leaderboard metrics for the two-step Discord picker (family -> aggregation).
 * Every `LeaderboardMetric` belongs to exactly one family; families with one or more valid
 * aggregations expose the aggregation selector, while families with no valid aggregations are
 * treated as having an implicit aggregation and skip that selector.
 */
export enum LeaderboardMetricFamily {
  SeriesPlayed = "SERIES_PLAYED",
  SeriesWins = "SERIES_WINS",
  GamesPlayed = "GAMES_PLAYED",
  GameWins = "GAME_WINS",
  MedalPoints = "MEDAL_POINTS",
  MythicMedals = "MYTHIC_MEDALS",
  ObjectiveTime = "OBJECTIVE_TIME",
  ObjectiveTeamContribution = "OBJECTIVE_TEAM_CONTRIBUTION",
  ObjectiveGameContribution = "OBJECTIVE_GAME_CONTRIBUTION",
  GamesWinRate = "GAMES_WIN_RATE",
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

export const LEADERBOARD_METRIC_FAMILIES_IN_DISPLAY_ORDER: readonly LeaderboardMetricFamily[] = [
  LeaderboardMetricFamily.SeriesWinRate,
  LeaderboardMetricFamily.GamesWinRate,
  LeaderboardMetricFamily.Kda,
  LeaderboardMetricFamily.Accuracy,
  LeaderboardMetricFamily.DamageRatio,
  LeaderboardMetricFamily.AvgLifeSeconds,
  LeaderboardMetricFamily.AvgDamagePerLife,
  LeaderboardMetricFamily.PersonalScore,
  LeaderboardMetricFamily.Kills,
  LeaderboardMetricFamily.Deaths,
  LeaderboardMetricFamily.Assists,
  LeaderboardMetricFamily.HeadshotKills,
  LeaderboardMetricFamily.ShotsHit,
  LeaderboardMetricFamily.ShotsFired,
  LeaderboardMetricFamily.DamageDealt,
  LeaderboardMetricFamily.DamageTaken,
  LeaderboardMetricFamily.SeriesPlayed,
  LeaderboardMetricFamily.SeriesWins,
  LeaderboardMetricFamily.GamesPlayed,
  LeaderboardMetricFamily.GameWins,
  LeaderboardMetricFamily.MedalPoints,
  LeaderboardMetricFamily.MythicMedals,
  LeaderboardMetricFamily.ObjectiveTime,
  LeaderboardMetricFamily.ObjectiveTeamContribution,
  LeaderboardMetricFamily.ObjectiveGameContribution,
];

export enum LeaderboardMetricAggregation {
  OverallPerformance = "OVERALL_PERFORMANCE",
  AvgPerSeries = "AVG_PER_SERIES",
  AvgPerGame = "AVG_PER_GAME",
  Total = "TOTAL",
}

export function getLeaderboardMetricFamily(metric: LeaderboardMetric): LeaderboardMetricFamily {
  switch (metric) {
    case LeaderboardMetric.SeriesPlayed: {
      return LeaderboardMetricFamily.SeriesPlayed;
    }
    case LeaderboardMetric.SeriesWins: {
      return LeaderboardMetricFamily.SeriesWins;
    }
    case LeaderboardMetric.MedalPoints: {
      return LeaderboardMetricFamily.MedalPoints;
    }
    case LeaderboardMetric.MythicMedals: {
      return LeaderboardMetricFamily.MythicMedals;
    }
    case LeaderboardMetric.ObjectiveTime:
    case LeaderboardMetric.AvgObjectiveTimePerGame: {
      return LeaderboardMetricFamily.ObjectiveTime;
    }
    case LeaderboardMetric.ObjectiveTeamContribution: {
      return LeaderboardMetricFamily.ObjectiveTeamContribution;
    }
    case LeaderboardMetric.ObjectiveGameContribution: {
      return LeaderboardMetricFamily.ObjectiveGameContribution;
    }
    case LeaderboardMetric.GamesPlayed: {
      return LeaderboardMetricFamily.GamesPlayed;
    }
    case LeaderboardMetric.GameWins: {
      return LeaderboardMetricFamily.GameWins;
    }
    case LeaderboardMetric.GamesWinRate: {
      return LeaderboardMetricFamily.GamesWinRate;
    }
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
    case LeaderboardMetric.AvgPersonalScorePerSeries:
    case LeaderboardMetric.AvgPersonalScorePerGame: {
      return LeaderboardMetricFamily.PersonalScore;
    }
    case LeaderboardMetric.AvgKillsPerSeries:
    case LeaderboardMetric.AvgKillsPerGame: {
      return LeaderboardMetricFamily.Kills;
    }
    case LeaderboardMetric.AvgDeathsPerSeries:
    case LeaderboardMetric.AvgDeathsPerGame: {
      return LeaderboardMetricFamily.Deaths;
    }
    case LeaderboardMetric.AvgAssistsPerSeries:
    case LeaderboardMetric.AvgAssistsPerGame: {
      return LeaderboardMetricFamily.Assists;
    }
    case LeaderboardMetric.AvgHeadshotKillsPerSeries:
    case LeaderboardMetric.AvgHeadshotKillsPerGame: {
      return LeaderboardMetricFamily.HeadshotKills;
    }
    case LeaderboardMetric.AvgShotsHitPerSeries:
    case LeaderboardMetric.AvgShotsHitPerGame: {
      return LeaderboardMetricFamily.ShotsHit;
    }
    case LeaderboardMetric.AvgShotsFiredPerSeries:
    case LeaderboardMetric.AvgShotsFiredPerGame: {
      return LeaderboardMetricFamily.ShotsFired;
    }
    case LeaderboardMetric.AvgDamageDealtPerSeries:
    case LeaderboardMetric.AvgDamageDealtPerGame: {
      return LeaderboardMetricFamily.DamageDealt;
    }
    case LeaderboardMetric.AvgDamageTakenPerSeries:
    case LeaderboardMetric.AvgDamageTakenPerGame: {
      return LeaderboardMetricFamily.DamageTaken;
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

/**
 * Valid aggregations for a family in selector display order. The default aggregation is the final
 * entry returned by this function. Families with a single inherent form return
 * `OverallPerformance` only.
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
      return [
        LeaderboardMetricAggregation.AvgPerSeries,
        LeaderboardMetricAggregation.AvgPerGame,
        LeaderboardMetricAggregation.Total,
      ];
    }
    case LeaderboardMetricFamily.SeriesPlayed:
    case LeaderboardMetricFamily.SeriesWins:
    case LeaderboardMetricFamily.GamesPlayed:
    case LeaderboardMetricFamily.GameWins: {
      return [LeaderboardMetricAggregation.Total];
    }
    case LeaderboardMetricFamily.MedalPoints:
    case LeaderboardMetricFamily.MythicMedals: {
      return [LeaderboardMetricAggregation.Total];
    }
    case LeaderboardMetricFamily.ObjectiveTime: {
      return [LeaderboardMetricAggregation.AvgPerGame, LeaderboardMetricAggregation.Total];
    }
    case LeaderboardMetricFamily.ObjectiveTeamContribution:
    case LeaderboardMetricFamily.ObjectiveGameContribution: {
      return [LeaderboardMetricAggregation.OverallPerformance];
    }
    case LeaderboardMetricFamily.SeriesWinRate:
    case LeaderboardMetricFamily.GamesWinRate:
    case LeaderboardMetricFamily.Kda:
    case LeaderboardMetricFamily.Accuracy:
    case LeaderboardMetricFamily.DamageRatio:
    case LeaderboardMetricFamily.AvgLifeSeconds:
    case LeaderboardMetricFamily.AvgDamagePerLife: {
      return [LeaderboardMetricAggregation.OverallPerformance];
    }
    default: {
      throw new UnreachableError(family);
    }
  }
}

export function getDefaultLeaderboardAggregation(family: LeaderboardMetricFamily): LeaderboardMetricAggregation | null {
  const aggregations = getLeaderboardFamilyAggregations(family);
  return aggregations[aggregations.length - 1] ?? null;
}

export function getLeaderboardMetricAggregation(metric: LeaderboardMetric): LeaderboardMetricAggregation {
  const family = getLeaderboardMetricFamily(metric);
  const aggregations = getLeaderboardFamilyAggregations(family);

  if (aggregations.length === 1) {
    const [aggregation] = aggregations;
    if (aggregation != null) {
      return aggregation;
    }
  }

  if (metric.toString().includes("_PER_SERIES")) {
    return LeaderboardMetricAggregation.AvgPerSeries;
  }
  if (metric.toString().includes("_PER_GAME")) {
    return LeaderboardMetricAggregation.AvgPerGame;
  }

  return LeaderboardMetricAggregation.Total;
}

export function getLeaderboardMetricFamiliesForAggregation(
  aggregation: LeaderboardMetricAggregation,
): readonly LeaderboardMetricFamily[] {
  return LEADERBOARD_METRIC_FAMILIES_IN_DISPLAY_ORDER.filter((family) =>
    getLeaderboardFamilyAggregations(family).includes(aggregation),
  );
}

function resolveAggregationMetric(
  aggregation: LeaderboardMetricAggregation | null,
  totalMetric: LeaderboardMetric,
  seriesMetric: LeaderboardMetric,
  gameMetric: LeaderboardMetric,
): LeaderboardMetric {
  if (aggregation == null) {
    throw new Error("Leaderboard aggregation is required for this metric family");
  }

  switch (aggregation) {
    case LeaderboardMetricAggregation.OverallPerformance: {
      throw new Error("Overall performance is not valid for an aggregatable metric family");
    }
    case LeaderboardMetricAggregation.AvgPerSeries: {
      return seriesMetric;
    }
    case LeaderboardMetricAggregation.AvgPerGame: {
      return gameMetric;
    }
    case LeaderboardMetricAggregation.Total: {
      return totalMetric;
    }
    default: {
      throw new UnreachableError(aggregation);
    }
  }
}

/**
 * Resolves a (family, aggregation) selection to one concrete `LeaderboardMetric`. Callers must
 * validate the aggregation against `getLeaderboardFamilyAggregations` before calling this — an
 * unsupported combination is treated as a programming error, not user input.
 */
function resolveOverallPerformanceMetric(
  aggregation: LeaderboardMetricAggregation | null,
  metric: LeaderboardMetric,
): LeaderboardMetric {
  if (aggregation !== LeaderboardMetricAggregation.OverallPerformance) {
    throw new Error("Overall performance aggregation is required for this metric family");
  }

  return metric;
}

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
    case LeaderboardMetricFamily.SeriesPlayed: {
      return LeaderboardMetric.SeriesPlayed;
    }
    case LeaderboardMetricFamily.SeriesWins: {
      return LeaderboardMetric.SeriesWins;
    }
    case LeaderboardMetricFamily.GamesPlayed: {
      return LeaderboardMetric.GamesPlayed;
    }
    case LeaderboardMetricFamily.GameWins: {
      return LeaderboardMetric.GameWins;
    }
    case LeaderboardMetricFamily.MedalPoints: {
      return LeaderboardMetric.MedalPoints;
    }
    case LeaderboardMetricFamily.MythicMedals: {
      return LeaderboardMetric.MythicMedals;
    }
    case LeaderboardMetricFamily.ObjectiveTime: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.ObjectiveTime,
        LeaderboardMetric.ObjectiveTime,
        LeaderboardMetric.AvgObjectiveTimePerGame,
      );
    }
    case LeaderboardMetricFamily.ObjectiveTeamContribution: {
      return resolveOverallPerformanceMetric(resolvedAggregation, LeaderboardMetric.ObjectiveTeamContribution);
    }
    case LeaderboardMetricFamily.ObjectiveGameContribution: {
      return resolveOverallPerformanceMetric(resolvedAggregation, LeaderboardMetric.ObjectiveGameContribution);
    }
    case LeaderboardMetricFamily.PersonalScore: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.PersonalScore,
        LeaderboardMetric.AvgPersonalScorePerSeries,
        LeaderboardMetric.AvgPersonalScorePerGame,
      );
    }
    case LeaderboardMetricFamily.Kills: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.Kills,
        LeaderboardMetric.AvgKillsPerSeries,
        LeaderboardMetric.AvgKillsPerGame,
      );
    }
    case LeaderboardMetricFamily.Deaths: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.Deaths,
        LeaderboardMetric.AvgDeathsPerSeries,
        LeaderboardMetric.AvgDeathsPerGame,
      );
    }
    case LeaderboardMetricFamily.Assists: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.Assists,
        LeaderboardMetric.AvgAssistsPerSeries,
        LeaderboardMetric.AvgAssistsPerGame,
      );
    }
    case LeaderboardMetricFamily.HeadshotKills: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.HeadshotKills,
        LeaderboardMetric.AvgHeadshotKillsPerSeries,
        LeaderboardMetric.AvgHeadshotKillsPerGame,
      );
    }
    case LeaderboardMetricFamily.ShotsHit: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.ShotsHit,
        LeaderboardMetric.AvgShotsHitPerSeries,
        LeaderboardMetric.AvgShotsHitPerGame,
      );
    }
    case LeaderboardMetricFamily.ShotsFired: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.ShotsFired,
        LeaderboardMetric.AvgShotsFiredPerSeries,
        LeaderboardMetric.AvgShotsFiredPerGame,
      );
    }
    case LeaderboardMetricFamily.DamageDealt: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.DamageDealt,
        LeaderboardMetric.AvgDamageDealtPerSeries,
        LeaderboardMetric.AvgDamageDealtPerGame,
      );
    }
    case LeaderboardMetricFamily.DamageTaken: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.DamageTaken,
        LeaderboardMetric.AvgDamageTakenPerSeries,
        LeaderboardMetric.AvgDamageTakenPerGame,
      );
    }
    case LeaderboardMetricFamily.SeriesWinRate: {
      return resolveOverallPerformanceMetric(resolvedAggregation, LeaderboardMetric.SeriesWinRate);
    }
    case LeaderboardMetricFamily.GamesWinRate: {
      return resolveOverallPerformanceMetric(resolvedAggregation, LeaderboardMetric.GamesWinRate);
    }
    case LeaderboardMetricFamily.Kda: {
      return resolveOverallPerformanceMetric(resolvedAggregation, LeaderboardMetric.Kda);
    }
    case LeaderboardMetricFamily.Accuracy: {
      return resolveOverallPerformanceMetric(resolvedAggregation, LeaderboardMetric.Accuracy);
    }
    case LeaderboardMetricFamily.DamageRatio: {
      return resolveOverallPerformanceMetric(resolvedAggregation, LeaderboardMetric.DamageRatio);
    }
    case LeaderboardMetricFamily.AvgLifeSeconds: {
      return resolveOverallPerformanceMetric(resolvedAggregation, LeaderboardMetric.AvgLifeSeconds);
    }
    case LeaderboardMetricFamily.AvgDamagePerLife: {
      return resolveOverallPerformanceMetric(resolvedAggregation, LeaderboardMetric.AvgDamagePerLife);
    }
    default: {
      throw new UnreachableError(family);
    }
  }
}

export function getLeaderboardMetricFamilyLabel(family: LeaderboardMetricFamily): string {
  switch (family) {
    case LeaderboardMetricFamily.SeriesPlayed: {
      return "Series played";
    }
    case LeaderboardMetricFamily.SeriesWins: {
      return "Series wins";
    }
    case LeaderboardMetricFamily.GamesPlayed: {
      return "Games played";
    }
    case LeaderboardMetricFamily.GameWins: {
      return "Game wins";
    }
    case LeaderboardMetricFamily.MedalPoints: {
      return "Medals by points";
    }
    case LeaderboardMetricFamily.MythicMedals: {
      return "Mythic medals";
    }
    case LeaderboardMetricFamily.ObjectiveTime: {
      return "Objective time";
    }
    case LeaderboardMetricFamily.ObjectiveTeamContribution: {
      return "Team objective contribution";
    }
    case LeaderboardMetricFamily.ObjectiveGameContribution: {
      return "Game objective contribution";
    }
    case LeaderboardMetricFamily.GamesWinRate: {
      return "Games win rate";
    }
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
  const labelsByAggregation: Record<LeaderboardMetricAggregation, string> = {
    [LeaderboardMetricAggregation.OverallPerformance]: "Overall performance",
    [LeaderboardMetricAggregation.AvgPerSeries]: "Avg per series",
    [LeaderboardMetricAggregation.AvgPerGame]: "Avg per game",
    [LeaderboardMetricAggregation.Total]: "Total",
  };

  return labelsByAggregation[aggregation];
}
