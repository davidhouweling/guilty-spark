import { GameVariantCategory } from "halo-infinite-api";
import { UnreachableError } from "../base/unreachable-error";
import {
  LeaderboardMetric,
  getLeaderboardMetricFamily,
  getLeaderboardMetricFamilyLabel,
  getLeaderboardObjectiveDescriptorByMetric,
  isObjectiveLeaderboardMetric,
} from "./leaderboard";

export enum LeaderboardPlayerRelationshipMetric {
  AvgHeadToHeadKills = "AVG_HEAD_TO_HEAD_KILLS",
  AvgHeadToHeadDeaths = "AVG_HEAD_TO_HEAD_DEATHS",
  TotalHeadToHeadKills = "TOTAL_HEAD_TO_HEAD_KILLS",
  TotalHeadToHeadDeaths = "TOTAL_HEAD_TO_HEAD_DEATHS",
  SeriesPlayedWith = "SERIES_PLAYED_WITH",
  SeriesPlayedAgainst = "SERIES_PLAYED_AGAINST",
  SeriesWinRateWith = "SERIES_WIN_RATE_WITH",
  SeriesWinRateAgainst = "SERIES_WIN_RATE_AGAINST",
  GamesPlayedWith = "GAMES_PLAYED_WITH",
  GamesPlayedAgainst = "GAMES_PLAYED_AGAINST",
  GamesWinRateWith = "GAMES_WIN_RATE_WITH",
  GamesWinRateAgainst = "GAMES_WIN_RATE_AGAINST",
}

export interface FormattablePlayerStatsRow {
  readonly XboxXuid: string;
  readonly DiscordUserId: string | null;
  readonly Gamertag: string;
  readonly SeriesPlayed: number;
  readonly SeriesWins: number;
  readonly GamesPlayed: number;
  readonly GameWins: number;
  readonly PersonalScore: number;
  readonly AvgPersonalScorePerGame: number;
  readonly Kills: number;
  readonly AvgKillsPerGame: number;
  readonly Deaths: number;
  readonly AvgDeathsPerGame: number;
  readonly Assists: number;
  readonly AvgAssistsPerGame: number;
  readonly HeadshotKills: number;
  readonly AvgHeadshotKillsPerGame: number;
  readonly ShotsHit: number;
  readonly AvgShotsHitPerGame: number;
  readonly ShotsFired: number;
  readonly AvgShotsFiredPerGame: number;
  readonly DamageDealt: number;
  readonly AvgDamageDealtPerGame: number;
  readonly DamageTaken: number;
  readonly AvgDamageTakenPerGame: number;
  readonly Kda: number;
  readonly Accuracy: number;
  readonly DamageRatio: number;
  readonly AvgLifeSeconds: number;
  readonly AvgDamagePerLife: number;
  readonly MedalCount: number;
  readonly MedalPoints: number;
  readonly MythicMedalCount: number;
  readonly ObjectiveGamesPlayed: number;
  readonly ObjectiveTimeSeconds: number;
  readonly AvgObjectiveTimeSeconds: number;
  readonly ObjectiveTeamContribution: number;
  readonly ObjectiveTeamContributionGamesPlayed: number;
  readonly CtfGamesPlayed: number;
  readonly StrongholdGamesPlayed: number;
  readonly HillGamesPlayed: number;
  readonly BallGamesPlayed: number;
  readonly FlagCaptures: number;
  readonly FlagCaptureAssists: number;
  readonly FlagGrabs: number;
  readonly FlagReturns: number;
  readonly FlagSecures: number;
  readonly FlagSteals: number;
  readonly FlagCarriersKilled: number;
  readonly FlagReturnersKilled: number;
  readonly FlagCarrierKills: number;
  readonly FlagReturnerKills: number;
  readonly StrongholdCaptures: number;
  readonly StrongholdSecures: number;
  readonly StrongholdOffensiveKills: number;
  readonly StrongholdDefensiveKills: number;
  readonly HillScoringTicks: number;
  readonly HillOffensiveKills: number;
  readonly HillDefensiveKills: number;
  readonly BallScoringTicks: number;
  readonly BallGrabs: number;
  readonly BallCarriersKilled: number;
  readonly BallCarrierKills: number;
}

export interface FormattableRelationshipRow {
  readonly XboxXuid: string;
  readonly DiscordUserId: string | null;
  readonly Gamertag: string;
  readonly MetricValue: number;
  readonly SharedCount: number;
  readonly Wins: number;
  readonly Perfects: number;
}

const PLAYER_RELATIONSHIP_METRIC_LABELS = new Map<LeaderboardPlayerRelationshipMetric, string>([
  [LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills, "Avg head to head - Killed most"],
  [LeaderboardPlayerRelationshipMetric.AvgHeadToHeadDeaths, "Avg head to head - Killed most by"],
  [LeaderboardPlayerRelationshipMetric.TotalHeadToHeadKills, "Total head to head - Killed most"],
  [LeaderboardPlayerRelationshipMetric.TotalHeadToHeadDeaths, "Total head to head - Killed most by"],
  [LeaderboardPlayerRelationshipMetric.SeriesPlayedWith, "Series played most with"],
  [LeaderboardPlayerRelationshipMetric.SeriesPlayedAgainst, "Series played most against"],
  [LeaderboardPlayerRelationshipMetric.SeriesWinRateWith, "Highest series win rate with"],
  [LeaderboardPlayerRelationshipMetric.SeriesWinRateAgainst, "Highest series win rate against"],
  [LeaderboardPlayerRelationshipMetric.GamesPlayedWith, "Games played most with"],
  [LeaderboardPlayerRelationshipMetric.GamesPlayedAgainst, "Games played most against"],
  [LeaderboardPlayerRelationshipMetric.GamesWinRateWith, "Highest game win rate with"],
  [LeaderboardPlayerRelationshipMetric.GamesWinRateAgainst, "Highest game win rate against"],
]);

const OBJECTIVE_GAMES_PLAYED_BY_CATEGORY = new Map<GameVariantCategory, (stats: FormattablePlayerStatsRow) => number>([
  [GameVariantCategory.MultiplayerStrongholds, (stats): number => stats.StrongholdGamesPlayed],
  [GameVariantCategory.MultiplayerKingOfTheHill, (stats): number => stats.HillGamesPlayed],
  [GameVariantCategory.MultiplayerCtf, (stats): number => stats.CtfGamesPlayed],
  [GameVariantCategory.MultiplayerOddball, (stats): number => stats.BallGamesPlayed],
]);

function average(total: number, denominator: number): number {
  return denominator === 0 ? 0 : total / denominator;
}

const PLAYER_METRIC_VALUE_GETTERS = new Map<LeaderboardMetric, (stats: FormattablePlayerStatsRow) => number>([
  [LeaderboardMetric.SeriesPlayed, (stats): number => stats.SeriesPlayed],
  [LeaderboardMetric.SeriesWins, (stats): number => stats.SeriesWins],
  [LeaderboardMetric.SeriesWinRate, (stats): number => average(stats.SeriesWins, stats.SeriesPlayed)],
  [LeaderboardMetric.GamesPlayed, (stats): number => stats.GamesPlayed],
  [LeaderboardMetric.GameWins, (stats): number => stats.GameWins],
  [LeaderboardMetric.GamesWinRate, (stats): number => average(stats.GameWins, stats.GamesPlayed)],
  [LeaderboardMetric.PersonalScore, (stats): number => stats.PersonalScore],
  [LeaderboardMetric.AvgPersonalScorePerSeries, (stats): number => average(stats.PersonalScore, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgPersonalScorePerGame, (stats): number => stats.AvgPersonalScorePerGame],
  [LeaderboardMetric.Kills, (stats): number => stats.Kills],
  [LeaderboardMetric.AvgKillsPerSeries, (stats): number => average(stats.Kills, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgKillsPerGame, (stats): number => stats.AvgKillsPerGame],
  [LeaderboardMetric.Deaths, (stats): number => stats.Deaths],
  [LeaderboardMetric.AvgDeathsPerSeries, (stats): number => average(stats.Deaths, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgDeathsPerGame, (stats): number => stats.AvgDeathsPerGame],
  [LeaderboardMetric.Assists, (stats): number => stats.Assists],
  [LeaderboardMetric.AvgAssistsPerSeries, (stats): number => average(stats.Assists, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgAssistsPerGame, (stats): number => stats.AvgAssistsPerGame],
  [LeaderboardMetric.Kda, (stats): number => stats.Kda],
  [LeaderboardMetric.Accuracy, (stats): number => stats.Accuracy],
  [LeaderboardMetric.HeadshotKills, (stats): number => stats.HeadshotKills],
  [LeaderboardMetric.AvgHeadshotKillsPerSeries, (stats): number => average(stats.HeadshotKills, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgHeadshotKillsPerGame, (stats): number => stats.AvgHeadshotKillsPerGame],
  [LeaderboardMetric.ShotsHit, (stats): number => stats.ShotsHit],
  [LeaderboardMetric.AvgShotsHitPerSeries, (stats): number => average(stats.ShotsHit, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgShotsHitPerGame, (stats): number => stats.AvgShotsHitPerGame],
  [LeaderboardMetric.ShotsFired, (stats): number => stats.ShotsFired],
  [LeaderboardMetric.AvgShotsFiredPerSeries, (stats): number => average(stats.ShotsFired, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgShotsFiredPerGame, (stats): number => stats.AvgShotsFiredPerGame],
  [LeaderboardMetric.DamageDealt, (stats): number => stats.DamageDealt],
  [LeaderboardMetric.AvgDamageDealtPerSeries, (stats): number => average(stats.DamageDealt, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgDamageDealtPerGame, (stats): number => stats.AvgDamageDealtPerGame],
  [LeaderboardMetric.DamageTaken, (stats): number => stats.DamageTaken],
  [LeaderboardMetric.AvgDamageTakenPerSeries, (stats): number => average(stats.DamageTaken, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgDamageTakenPerGame, (stats): number => stats.AvgDamageTakenPerGame],
  [LeaderboardMetric.DamageRatio, (stats): number => stats.DamageRatio],
  [LeaderboardMetric.AvgLifeSeconds, (stats): number => stats.AvgLifeSeconds],
  [LeaderboardMetric.AvgDamagePerLife, (stats): number => stats.AvgDamagePerLife],
  [LeaderboardMetric.MedalPoints, (stats): number => stats.MedalPoints],
  [LeaderboardMetric.AvgMedalPointsPerSeries, (stats): number => average(stats.MedalPoints, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgMedalPointsPerGame, (stats): number => average(stats.MedalPoints, stats.GamesPlayed)],
  [LeaderboardMetric.MythicMedals, (stats): number => stats.MythicMedalCount],
  [LeaderboardMetric.AvgMythicMedalsPerSeries, (stats): number => average(stats.MythicMedalCount, stats.SeriesPlayed)],
  [LeaderboardMetric.AvgMythicMedalsPerGame, (stats): number => average(stats.MythicMedalCount, stats.GamesPlayed)],
  [LeaderboardMetric.ObjectiveTime, (stats): number => stats.ObjectiveTimeSeconds],
  [LeaderboardMetric.AvgObjectiveTimePerGame, (stats): number => stats.AvgObjectiveTimeSeconds],
  [LeaderboardMetric.ObjectiveTeamContribution, (stats): number => stats.ObjectiveTeamContribution],
  [LeaderboardMetric.FlagCaptures, (stats): number => stats.FlagCaptures],
  [LeaderboardMetric.AvgFlagCapturesPerObjective, (stats): number => average(stats.FlagCaptures, stats.CtfGamesPlayed)],
  [LeaderboardMetric.FlagCaptureAssists, (stats): number => stats.FlagCaptureAssists],
  [
    LeaderboardMetric.AvgFlagCaptureAssistsPerObjective,
    (stats): number => average(stats.FlagCaptureAssists, stats.CtfGamesPlayed),
  ],
  [LeaderboardMetric.FlagGrabs, (stats): number => stats.FlagGrabs],
  [LeaderboardMetric.AvgFlagGrabsPerObjective, (stats): number => average(stats.FlagGrabs, stats.CtfGamesPlayed)],
  [LeaderboardMetric.FlagReturns, (stats): number => stats.FlagReturns],
  [LeaderboardMetric.AvgFlagReturnsPerObjective, (stats): number => average(stats.FlagReturns, stats.CtfGamesPlayed)],
  [LeaderboardMetric.FlagSecures, (stats): number => stats.FlagSecures],
  [LeaderboardMetric.AvgFlagSecuresPerObjective, (stats): number => average(stats.FlagSecures, stats.CtfGamesPlayed)],
  [LeaderboardMetric.FlagSteals, (stats): number => stats.FlagSteals],
  [LeaderboardMetric.AvgFlagStealsPerObjective, (stats): number => average(stats.FlagSteals, stats.CtfGamesPlayed)],
  [LeaderboardMetric.FlagCarriersKilled, (stats): number => stats.FlagCarriersKilled],
  [
    LeaderboardMetric.AvgFlagCarriersKilledPerObjective,
    (stats): number => average(stats.FlagCarriersKilled, stats.CtfGamesPlayed),
  ],
  [LeaderboardMetric.FlagReturnersKilled, (stats): number => stats.FlagReturnersKilled],
  [
    LeaderboardMetric.AvgFlagReturnersKilledPerObjective,
    (stats): number => average(stats.FlagReturnersKilled, stats.CtfGamesPlayed),
  ],
  [LeaderboardMetric.FlagCarrierKills, (stats): number => stats.FlagCarrierKills],
  [
    LeaderboardMetric.AvgFlagCarrierKillsPerObjective,
    (stats): number => average(stats.FlagCarrierKills, stats.CtfGamesPlayed),
  ],
  [LeaderboardMetric.FlagReturnerKills, (stats): number => stats.FlagReturnerKills],
  [
    LeaderboardMetric.AvgFlagReturnerKillsPerObjective,
    (stats): number => average(stats.FlagReturnerKills, stats.CtfGamesPlayed),
  ],
  [LeaderboardMetric.StrongholdCaptures, (stats): number => stats.StrongholdCaptures],
  [
    LeaderboardMetric.AvgStrongholdCapturesPerObjective,
    (stats): number => average(stats.StrongholdCaptures, stats.StrongholdGamesPlayed),
  ],
  [LeaderboardMetric.StrongholdSecures, (stats): number => stats.StrongholdSecures],
  [
    LeaderboardMetric.AvgStrongholdSecuresPerObjective,
    (stats): number => average(stats.StrongholdSecures, stats.StrongholdGamesPlayed),
  ],
  [LeaderboardMetric.StrongholdOffensiveKills, (stats): number => stats.StrongholdOffensiveKills],
  [
    LeaderboardMetric.AvgStrongholdOffensiveKillsPerObjective,
    (stats): number => average(stats.StrongholdOffensiveKills, stats.StrongholdGamesPlayed),
  ],
  [LeaderboardMetric.StrongholdDefensiveKills, (stats): number => stats.StrongholdDefensiveKills],
  [
    LeaderboardMetric.AvgStrongholdDefensiveKillsPerObjective,
    (stats): number => average(stats.StrongholdDefensiveKills, stats.StrongholdGamesPlayed),
  ],
  [LeaderboardMetric.HillScoringTicks, (stats): number => stats.HillScoringTicks],
  [
    LeaderboardMetric.AvgHillScoringTicksPerObjective,
    (stats): number => average(stats.HillScoringTicks, stats.HillGamesPlayed),
  ],
  [LeaderboardMetric.HillOffensiveKills, (stats): number => stats.HillOffensiveKills],
  [
    LeaderboardMetric.AvgHillOffensiveKillsPerObjective,
    (stats): number => average(stats.HillOffensiveKills, stats.HillGamesPlayed),
  ],
  [LeaderboardMetric.HillDefensiveKills, (stats): number => stats.HillDefensiveKills],
  [
    LeaderboardMetric.AvgHillDefensiveKillsPerObjective,
    (stats): number => average(stats.HillDefensiveKills, stats.HillGamesPlayed),
  ],
  [LeaderboardMetric.BallScoringTicks, (stats): number => stats.BallScoringTicks],
  [
    LeaderboardMetric.AvgBallScoringTicksPerObjective,
    (stats): number => average(stats.BallScoringTicks, stats.BallGamesPlayed),
  ],
  [LeaderboardMetric.BallGrabs, (stats): number => stats.BallGrabs],
  [LeaderboardMetric.AvgBallGrabsPerObjective, (stats): number => average(stats.BallGrabs, stats.BallGamesPlayed)],
  [LeaderboardMetric.BallCarriersKilled, (stats): number => stats.BallCarriersKilled],
  [
    LeaderboardMetric.AvgBallCarriersKilledPerObjective,
    (stats): number => average(stats.BallCarriersKilled, stats.BallGamesPlayed),
  ],
  [LeaderboardMetric.BallCarrierKills, (stats): number => stats.BallCarrierKills],
  [
    LeaderboardMetric.AvgBallCarrierKillsPerObjective,
    (stats): number => average(stats.BallCarrierKills, stats.BallGamesPlayed),
  ],
]);

const OBJECTIVE_SPECIFIC_POPULATION_METRICS: ReadonlySet<LeaderboardMetric> = new Set([
  LeaderboardMetric.ObjectiveTime,
  LeaderboardMetric.AvgObjectiveTimePerGame,
  LeaderboardMetric.ObjectiveTeamContribution,
]);

export function hasObjectiveSpecificPopulation(metric: LeaderboardMetric): boolean {
  return isObjectiveLeaderboardMetric(metric) || OBJECTIVE_SPECIFIC_POPULATION_METRICS.has(metric);
}

export function getObjectiveGamesPlayedForMetric(stats: FormattablePlayerStatsRow, metric: LeaderboardMetric): number {
  if (metric === LeaderboardMetric.ObjectiveTeamContribution) {
    return stats.ObjectiveTeamContributionGamesPlayed;
  }

  if (!isObjectiveLeaderboardMetric(metric)) {
    return stats.ObjectiveGamesPlayed;
  }

  const descriptor = getLeaderboardObjectiveDescriptorByMetric(metric);
  const getGamesPlayed = OBJECTIVE_GAMES_PLAYED_BY_CATEGORY.get(descriptor.category);
  if (getGamesPlayed == null) {
    throw new Error(`Unsupported objective category for player stats: ${String(descriptor.category)}`);
  }

  return getGamesPlayed(stats);
}

export function getPlayerMetricValue(stats: FormattablePlayerStatsRow, metric: LeaderboardMetric): number {
  const getValue = PLAYER_METRIC_VALUE_GETTERS.get(metric);
  if (getValue == null) {
    throw new Error(`Unsupported player-stats metric: ${metric}`);
  }

  return getValue(stats);
}

export function formatRank(rank: number): string {
  switch (rank) {
    case 1: {
      return "🥇";
    }
    case 2: {
      return "🥈";
    }
    case 3: {
      return "🥉";
    }
    default: {
      return `#${rank.toString()}`;
    }
  }
}

export function getRankText(
  metric: LeaderboardMetric,
  rank: { rank: number; total: number } | null,
  overallTotalPlayers: number | null,
): string {
  if (rank == null) {
    return "Unranked";
  }

  const rankText = formatRank(rank.rank);
  return hasObjectiveSpecificPopulation(metric) && overallTotalPlayers != null && rank.total !== overallTotalPlayers
    ? `${rankText} / ${rank.total.toString()}`
    : rankText;
}

export function formatMetricValue(
  metricValue: number,
  metric: LeaderboardMetric,
  context: {
    seriesWins: number;
    seriesPlayed: number;
    gameWins: number;
    gamesPlayed: number;
    objectiveGamesPlayed: number;
  },
  locale = "en-US",
): string {
  const pluralRules = new Intl.PluralRules(locale);
  const formatCount = (value: number, singularLabel: string, pluralLabel: string): string => {
    const roundedValue = Math.round(value);
    const label = pluralRules.select(Math.abs(roundedValue)) === "one" ? singularLabel : pluralLabel;
    return `${roundedValue.toLocaleString(locale)} ${label}`;
  };

  if (isObjectiveLeaderboardMetric(metric)) {
    const descriptor = getLeaderboardObjectiveDescriptorByMetric(metric);
    const games = formatCount(context.objectiveGamesPlayed, "game", "games");
    if (metric === descriptor.averageMetric) {
      const averageValue = metricValue.toLocaleString(locale, { maximumFractionDigits: 2 });
      return `${averageValue} avg/game (${games})`;
    }

    const value = Math.round(metricValue);
    const unit = pluralRules.select(Math.abs(value)) === "one" ? descriptor.unit.slice(0, -1) : descriptor.unit;
    return `${value.toLocaleString(locale)} ${unit} (${games})`;
  }

  switch (metric) {
    case LeaderboardMetric.SeriesWinRate: {
      return `${(metricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}% (${context.seriesWins.toLocaleString(locale)}/${context.seriesPlayed.toLocaleString(locale)})`;
    }
    case LeaderboardMetric.GamesWinRate: {
      return `${(metricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}% (${context.gameWins.toLocaleString(locale)}/${context.gamesPlayed.toLocaleString(locale)})`;
    }
    case LeaderboardMetric.Accuracy: {
      return `${metricValue.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
    }
    case LeaderboardMetric.Kda:
    case LeaderboardMetric.DamageRatio: {
      if (metricValue === Number.MAX_VALUE) {
        return "∞";
      }

      return metricValue.toLocaleString(locale, { maximumFractionDigits: 2 });
    }
    case LeaderboardMetric.AvgLifeSeconds: {
      return `${metricValue.toLocaleString(locale, { maximumFractionDigits: 1 })}s`;
    }
    case LeaderboardMetric.AvgDamagePerLife: {
      if (metricValue === Number.MAX_VALUE) {
        return "∞";
      }

      return metricValue.toLocaleString(locale, { maximumFractionDigits: 2 });
    }
    case LeaderboardMetric.AvgPersonalScorePerSeries:
    case LeaderboardMetric.AvgKillsPerSeries:
    case LeaderboardMetric.AvgDeathsPerSeries:
    case LeaderboardMetric.AvgAssistsPerSeries:
    case LeaderboardMetric.AvgHeadshotKillsPerSeries:
    case LeaderboardMetric.AvgShotsHitPerSeries:
    case LeaderboardMetric.AvgShotsFiredPerSeries:
    case LeaderboardMetric.AvgDamageDealtPerSeries:
    case LeaderboardMetric.AvgDamageTakenPerSeries:
    case LeaderboardMetric.AvgMedalPointsPerSeries:
    case LeaderboardMetric.AvgMythicMedalsPerSeries: {
      return `${metricValue.toLocaleString(locale, { maximumFractionDigits: 2 })} avg/series`;
    }
    case LeaderboardMetric.AvgPersonalScorePerGame:
    case LeaderboardMetric.AvgKillsPerGame:
    case LeaderboardMetric.AvgDeathsPerGame:
    case LeaderboardMetric.AvgAssistsPerGame:
    case LeaderboardMetric.AvgHeadshotKillsPerGame:
    case LeaderboardMetric.AvgShotsHitPerGame:
    case LeaderboardMetric.AvgShotsFiredPerGame:
    case LeaderboardMetric.AvgDamageDealtPerGame:
    case LeaderboardMetric.AvgDamageTakenPerGame:
    case LeaderboardMetric.AvgMedalPointsPerGame:
    case LeaderboardMetric.AvgMythicMedalsPerGame: {
      return `${metricValue.toLocaleString(locale, { maximumFractionDigits: 2 })} avg/game`;
    }
    case LeaderboardMetric.ObjectiveTime: {
      return `${Math.round(metricValue).toLocaleString(locale)}s`;
    }
    case LeaderboardMetric.AvgObjectiveTimePerGame: {
      return `${metricValue.toLocaleString(locale, { maximumFractionDigits: 1 })}s avg/game`;
    }
    case LeaderboardMetric.ObjectiveTeamContribution: {
      const games = formatCount(context.objectiveGamesPlayed, "game", "games");
      return `${(metricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}% avg/game (${games})`;
    }
    case LeaderboardMetric.SeriesPlayed:
    case LeaderboardMetric.SeriesWins:
    case LeaderboardMetric.GamesPlayed:
    case LeaderboardMetric.GameWins:
    case LeaderboardMetric.PersonalScore:
    case LeaderboardMetric.Kills:
    case LeaderboardMetric.Deaths:
    case LeaderboardMetric.Assists:
    case LeaderboardMetric.HeadshotKills:
    case LeaderboardMetric.ShotsHit:
    case LeaderboardMetric.ShotsFired:
    case LeaderboardMetric.DamageDealt:
    case LeaderboardMetric.DamageTaken:
    case LeaderboardMetric.MedalPoints:
    case LeaderboardMetric.MythicMedals: {
      return Math.round(metricValue).toLocaleString(locale);
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

export function formatPerfects(perfects: number, locale = "en-US"): string {
  const pluralCategory = new Intl.PluralRules(locale).select(perfects);
  return `${perfects.toLocaleString(locale)} ${pluralCategory === "one" ? "perfect" : "perfects"}`;
}

export function formatRelationshipValue(
  row: FormattableRelationshipRow,
  metric: LeaderboardPlayerRelationshipMetric,
  locale = "en-US",
): string {
  switch (metric) {
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills: {
      return `${row.MetricValue.toLocaleString(locale, { maximumFractionDigits: 1 })} kills/game (${formatPerfects(row.Perfects, locale)})`;
    }
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadDeaths: {
      return `${row.MetricValue.toLocaleString(locale, { maximumFractionDigits: 1 })} deaths/game (${formatPerfects(row.Perfects, locale)})`;
    }
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadKills: {
      return `${row.MetricValue.toLocaleString(locale)} kills (${formatPerfects(row.Perfects, locale)})`;
    }
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadDeaths: {
      return `${row.MetricValue.toLocaleString(locale)} deaths (${formatPerfects(row.Perfects, locale)})`;
    }
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedWith:
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedAgainst: {
      return `${row.SharedCount.toLocaleString(locale)} series`;
    }
    case LeaderboardPlayerRelationshipMetric.GamesPlayedWith:
    case LeaderboardPlayerRelationshipMetric.GamesPlayedAgainst: {
      return `${row.SharedCount.toLocaleString(locale)} games`;
    }
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateWith:
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateAgainst: {
      return `${(row.MetricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}% (${row.Wins.toLocaleString(locale)}/${row.SharedCount.toLocaleString(locale)} shared series)`;
    }
    case LeaderboardPlayerRelationshipMetric.GamesWinRateWith:
    case LeaderboardPlayerRelationshipMetric.GamesWinRateAgainst: {
      return `${(row.MetricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}% (${row.Wins.toLocaleString(locale)}/${row.SharedCount.toLocaleString(locale)} shared games)`;
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

export function getPlayerStatsRelationshipMetricLabel(metric: LeaderboardPlayerRelationshipMetric): string {
  const label = PLAYER_RELATIONSHIP_METRIC_LABELS.get(metric);
  if (label == null) {
    throw new Error(`Unsupported player relationship metric: ${metric}`);
  }

  return label;
}

export function getRelationshipFooter(metric: LeaderboardPlayerRelationshipMetric): string | undefined {
  switch (metric) {
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateWith:
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateAgainst: {
      return "Min shared series: 3";
    }
    case LeaderboardPlayerRelationshipMetric.GamesWinRateWith:
    case LeaderboardPlayerRelationshipMetric.GamesWinRateAgainst: {
      return "Min shared games: 5";
    }
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills:
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadDeaths:
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadKills:
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadDeaths:
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedWith:
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedAgainst:
    case LeaderboardPlayerRelationshipMetric.GamesPlayedWith:
    case LeaderboardPlayerRelationshipMetric.GamesPlayedAgainst: {
      return undefined;
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

export function getPlayerStatMetricLabel(metric: LeaderboardMetric): string {
  if (isObjectiveLeaderboardMetric(metric)) {
    const descriptor = getLeaderboardObjectiveDescriptorByMetric(metric);
    return metric === descriptor.averageMetric ? `${descriptor.label} / objective` : descriptor.label;
  }

  const family = getLeaderboardMetricFamily(metric);
  const familyLabel = getLeaderboardMetricFamilyLabel(family);

  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (metric) {
    case LeaderboardMetric.SeriesWinRate: {
      return "Series win rate";
    }
    case LeaderboardMetric.GamesWinRate: {
      return "Game win rate";
    }
    case LeaderboardMetric.AvgPersonalScorePerSeries: {
      return "Avg personal score / series";
    }
    case LeaderboardMetric.AvgPersonalScorePerGame: {
      return "Avg personal score / game";
    }
    case LeaderboardMetric.AvgKillsPerSeries: {
      return "Avg kills / series";
    }
    case LeaderboardMetric.AvgKillsPerGame: {
      return "Avg kills / game";
    }
    case LeaderboardMetric.AvgDeathsPerSeries: {
      return "Avg deaths / series";
    }
    case LeaderboardMetric.AvgDeathsPerGame: {
      return "Avg deaths / game";
    }
    case LeaderboardMetric.AvgAssistsPerSeries: {
      return "Avg assists / series";
    }
    case LeaderboardMetric.AvgAssistsPerGame: {
      return "Avg assists / game";
    }
    case LeaderboardMetric.AvgHeadshotKillsPerSeries: {
      return "Avg headshot kills / series";
    }
    case LeaderboardMetric.AvgHeadshotKillsPerGame: {
      return "Avg headshot kills / game";
    }
    case LeaderboardMetric.AvgShotsHitPerSeries: {
      return "Avg shots hit / series";
    }
    case LeaderboardMetric.AvgShotsHitPerGame: {
      return "Avg shots hit / game";
    }
    case LeaderboardMetric.AvgShotsFiredPerSeries: {
      return "Avg shots fired / series";
    }
    case LeaderboardMetric.AvgShotsFiredPerGame: {
      return "Avg shots fired / game";
    }
    case LeaderboardMetric.AvgDamageDealtPerSeries: {
      return "Avg damage dealt / series";
    }
    case LeaderboardMetric.AvgDamageDealtPerGame: {
      return "Avg damage dealt / game";
    }
    case LeaderboardMetric.AvgDamageTakenPerSeries: {
      return "Avg damage taken / series";
    }
    case LeaderboardMetric.AvgDamageTakenPerGame: {
      return "Avg damage taken / game";
    }
    case LeaderboardMetric.AvgMedalPointsPerSeries: {
      return "Avg medal points / series";
    }
    case LeaderboardMetric.AvgMedalPointsPerGame: {
      return "Avg medal points / game";
    }
    case LeaderboardMetric.AvgMythicMedalsPerSeries: {
      return "Avg mythic medals / series";
    }
    case LeaderboardMetric.AvgMythicMedalsPerGame: {
      return "Avg mythic medals / game";
    }
    case LeaderboardMetric.AvgObjectiveTimePerGame: {
      return "Avg objective time / game";
    }
    default: {
      return familyLabel;
    }
  }
}
