import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import {
  LeaderboardWindow,
  LeaderboardMetric,
  getLeaderboardObjectiveDescriptorByMetric,
  isObjectiveLeaderboardMetric,
} from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardObjectiveMetricDescriptor } from "@guilty-spark/shared/halo/leaderboard";
import { GameVariantCategory } from "halo-infinite-api";
import { SESSION_COOKIE_MAX_AGE_SECONDS } from "../auth/session-manager";
import type { DiscordAssociationsRow } from "./types/discord_associations";
import type { GuildConfigRow } from "./types/guild_config";
import { StatsReturnType, MapsPostType, MapsPlaylistType, MapsFormatType } from "./types/guild_config";
import type { NeatQueueConfigRow, NeatQueuePostSeriesDisplayMode } from "./types/neat_queue_config";
import type { UserSessionsRow } from "./types/user_sessions";
import type { UserCredentialsRow } from "./types/user_credentials";
import type { LinkedIdentitiesRow, IdentityProvider } from "./types/linked_identities";
import type { IndividualTrackerProfilesRow } from "./types/individual_tracker_profiles";
import type { IndividualTrackerGamesRow } from "./types/individual_tracker_games";
import type { StreamerViewSettingsRow } from "./types/streamer_view_settings";
import type { IndividualTrackersRow } from "./types/individual_trackers";
import type { LeaderboardSeriesRow } from "./types/leaderboard_series";
import type { LeaderboardSeriesPlayersRow } from "./types/leaderboard_series_players";
import type { LeaderboardGamesRow } from "./types/leaderboard_games";
import type { LeaderboardGamePlayersRow } from "./types/leaderboard_game_players";
import type { LeaderboardRankingRow } from "./types/leaderboard_ranking_row";
import type { LeaderboardPlayerStatsRow } from "./types/leaderboard_player_stats";
import type { LeaderboardPlayerMetricRank } from "./types/leaderboard_player_metric_rank";
import type { LeaderboardConfigRow } from "./types/leaderboard_config";
import type { LeaderboardPostRow } from "./types/leaderboard_post";
import type { LeaderboardResetMarkerRow } from "./types/leaderboard_reset_marker";
import type { MatchKillMatrixRow } from "./types/match_kill_matrix";
import { LeaderboardPlayerRelationshipMetric } from "./types/leaderboard_player_relationship";
import type { LeaderboardPlayerRelationshipRow } from "./types/leaderboard_player_relationship";
import type { LeaderboardPlayerPairRelationshipRow } from "./types/leaderboard_player_pair_relationship";

const DEFAULT_LEADERBOARD_ENABLED_WINDOWS_JSON = '["1W","1M","3M","6M","12M"]';
const SQLITE_MAX_VARIABLES = 999;
// D1 accepts at most 100 bound parameters per statement, so batch upserts must chunk below this cap.
const D1_SAFE_MAX_VARIABLES_PER_STATEMENT = 100;
const MAX_RANK_METRICS_PER_QUERY = 4;

type StoredGuildConfigRow = Omit<GuildConfigRow, "NeatQueueInformerMapsPlaylist"> & {
  NeatQueueInformerMapsPlaylist: GuildConfigRow["NeatQueueInformerMapsPlaylist"] | "L";
};

function normalizeGuildConfig(config: StoredGuildConfigRow): GuildConfigRow {
  return {
    ...config,
    NeatQueueInformerMapsPlaylist:
      config.NeatQueueInformerMapsPlaylist === "L"
        ? MapsPlaylistType.HCS_CURRENT
        : config.NeatQueueInformerMapsPlaylist,
  };
}

function getPerSeriesAverageSql(column: string, outerAlias: string): string {
  return `(SELECT AVG(perSeries.MetricValue) FROM (
    SELECT SUM(gpSeries.${column}) AS MetricValue
    FROM LeaderboardGamePlayers gpSeries
    INNER JOIN LeaderboardGames gSeries
      ON gSeries.GuildId = gpSeries.GuildId
      AND gSeries.QueueNumber = gpSeries.QueueNumber
      AND gSeries.MatchId = gpSeries.MatchId
    WHERE gpSeries.GuildId = ${outerAlias}.GuildId
      AND gpSeries.XboxXuid = ${outerAlias}.XboxXuid
      AND gSeries.EndedAt >= ?
      AND (? IS NULL OR gpSeries.QueueChannelId = ?)
    GROUP BY gpSeries.QueueNumber
  ) perSeries)`;
}

function getObjectiveCategoryGamesSql(category: GameVariantCategory): string {
  return `SUM(CASE WHEN g.GameVariantCategory = ${category.toString()} THEN 1 ELSE 0 END)`;
}

// Objective counters live inside ObjectiveStatsJson, so they are extracted per row and scoped to the
// game mode that produces them; games from other modes must not dilute the average.
function getObjectiveStatValueSql(descriptor: LeaderboardObjectiveMetricDescriptor): string {
  const jsonPath = `$.${descriptor.statsPath}`;
  return `CASE WHEN g.GameVariantCategory = ${descriptor.category.toString()} THEN COALESCE(CAST(json_extract(gp.ObjectiveStatsJson, '${jsonPath}') AS REAL), 0) ELSE 0 END`;
}

// A single queue scopes to one channel (or every channel when null); a player-stats query without an
// explicit queue instead scopes to a specific set of configured channels, so the filter shape differs.
function getQueueFilterSql(alias: string, queueChannelIds: string[] | undefined): string {
  if (queueChannelIds == null) {
    return `(? IS NULL OR ${alias}.QueueChannelId = ?)`;
  }

  return `${alias}.QueueChannelId IN (${queueChannelIds.map(() => "?").join(",")})`;
}

function getQueueFilterBindings(
  queueChannelId: string | null,
  queueChannelIds: string[] | undefined,
): readonly (string | null)[] {
  return queueChannelIds ?? [queueChannelId, queueChannelId];
}

function getLatestIdentityJoinSql({
  relatedTableName,
  identityTableName,
  timeColumn,
  joinClause,
  relatedAlias,
  queueChannelIds,
}: {
  relatedTableName: "LeaderboardSeriesPlayers" | "LeaderboardGamePlayers";
  identityTableName: "LeaderboardSeries" | "LeaderboardGames";
  timeColumn: "CompletedAt" | "EndedAt";
  joinClause: "" | "AND identityTable.MatchId = relatedIdentity.MatchId";
  relatedAlias: "related";
  queueChannelIds: string[] | undefined;
}): string {
  return `
    LEFT JOIN (
      SELECT GuildId, XboxXuid, DiscordUserId, GamertagSnapshot
      FROM (
        SELECT
          relatedIdentity.GuildId AS GuildId,
          relatedIdentity.XboxXuid AS XboxXuid,
          relatedIdentity.DiscordUserId AS DiscordUserId,
          relatedIdentity.GamertagSnapshot AS GamertagSnapshot,
          ROW_NUMBER() OVER (
            PARTITION BY relatedIdentity.GuildId, relatedIdentity.XboxXuid
            ORDER BY identityTable.${timeColumn} DESC, relatedIdentity.CreatedAt DESC
          ) AS IdentityRowNumber
        FROM ${relatedTableName} relatedIdentity
        INNER JOIN ${identityTableName} identityTable
          ON identityTable.GuildId = relatedIdentity.GuildId
          AND identityTable.QueueNumber = relatedIdentity.QueueNumber
          ${joinClause}
        WHERE relatedIdentity.GuildId = ?
          AND identityTable.${timeColumn} >= ?
          AND ${getQueueFilterSql("relatedIdentity", queueChannelIds)}
      )
      WHERE IdentityRowNumber = 1
    ) latestIdentity
      ON latestIdentity.GuildId = ${relatedAlias}.GuildId
      AND latestIdentity.XboxXuid = ${relatedAlias}.XboxXuid
  `;
}

const OUTCOME_LEADERBOARD_METRICS = new Set<LeaderboardMetric>([
  LeaderboardMetric.SeriesPlayed,
  LeaderboardMetric.SeriesWins,
  LeaderboardMetric.SeriesWinRate,
  LeaderboardMetric.GamesPlayed,
  LeaderboardMetric.GameWins,
  LeaderboardMetric.GamesWinRate,
]);

function isOutcomeLeaderboardMetric(metric: LeaderboardMetric): boolean {
  return OUTCOME_LEADERBOARD_METRICS.has(metric);
}

// Ratio-of-sums DamageRatio expression shared by player-stat rank aggregation, guild-wide leaderboard
// rank aggregation, and the displayed player-stats value — keeps all three consistent with each other.
const DAMAGE_RATIO_SQL =
  "CASE WHEN SUM(gp.DamageTaken) = 0 THEN CASE WHEN SUM(gp.DamageDealt) = 0 THEN 0 ELSE 1.7976931348623157e308 END ELSE CAST(SUM(gp.DamageDealt) AS REAL) / SUM(gp.DamageTaken) END";

const PLAYER_STAT_RANK_SQL_BY_METRIC = new Map<LeaderboardMetric, string>([
  [LeaderboardMetric.PersonalScore, "SUM(gp.PersonalScore)"],
  [LeaderboardMetric.AvgPersonalScorePerSeries, "CAST(SUM(gp.PersonalScore) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgPersonalScorePerGame, "AVG(gp.PersonalScore)"],
  [LeaderboardMetric.Kills, "SUM(gp.Kills)"],
  [LeaderboardMetric.AvgKillsPerSeries, "CAST(SUM(gp.Kills) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgKillsPerGame, "AVG(gp.Kills)"],
  [LeaderboardMetric.Deaths, "SUM(gp.Deaths)"],
  [LeaderboardMetric.AvgDeathsPerSeries, "CAST(SUM(gp.Deaths) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgDeathsPerGame, "AVG(gp.Deaths)"],
  [LeaderboardMetric.Assists, "SUM(gp.Assists)"],
  [LeaderboardMetric.AvgAssistsPerSeries, "CAST(SUM(gp.Assists) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgAssistsPerGame, "AVG(gp.Assists)"],
  [LeaderboardMetric.HeadshotKills, "SUM(gp.HeadshotKills)"],
  [LeaderboardMetric.AvgHeadshotKillsPerSeries, "CAST(SUM(gp.HeadshotKills) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgHeadshotKillsPerGame, "AVG(gp.HeadshotKills)"],
  [LeaderboardMetric.ShotsHit, "SUM(gp.ShotsHit)"],
  [LeaderboardMetric.AvgShotsHitPerSeries, "CAST(SUM(gp.ShotsHit) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgShotsHitPerGame, "AVG(gp.ShotsHit)"],
  [LeaderboardMetric.ShotsFired, "SUM(gp.ShotsFired)"],
  [LeaderboardMetric.AvgShotsFiredPerSeries, "CAST(SUM(gp.ShotsFired) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgShotsFiredPerGame, "AVG(gp.ShotsFired)"],
  [LeaderboardMetric.DamageDealt, "SUM(gp.DamageDealt)"],
  [LeaderboardMetric.AvgDamageDealtPerSeries, "CAST(SUM(gp.DamageDealt) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgDamageDealtPerGame, "AVG(gp.DamageDealt)"],
  [LeaderboardMetric.DamageTaken, "SUM(gp.DamageTaken)"],
  [LeaderboardMetric.AvgDamageTakenPerSeries, "CAST(SUM(gp.DamageTaken) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgDamageTakenPerGame, "AVG(gp.DamageTaken)"],
  [LeaderboardMetric.Kda, "AVG(gp.Kda)"],
  [LeaderboardMetric.Accuracy, "AVG(gp.Accuracy)"],
  [LeaderboardMetric.DamageRatio, DAMAGE_RATIO_SQL],
  [LeaderboardMetric.AvgLifeSeconds, "AVG(gp.AvgLifeSeconds)"],
  [LeaderboardMetric.AvgDamagePerLife, "AVG(gp.AvgDamagePerLife)"],
  [LeaderboardMetric.MedalPoints, "SUM(gp.MedalPoints)"],
  [LeaderboardMetric.AvgMedalPointsPerSeries, "CAST(SUM(gp.MedalPoints) AS REAL) / COUNT(DISTINCT gp.QueueNumber)"],
  [LeaderboardMetric.AvgMedalPointsPerGame, "AVG(gp.MedalPoints)"],
  [LeaderboardMetric.MythicMedals, "SUM(gp.MythicMedalCount)"],
  [
    LeaderboardMetric.AvgMythicMedalsPerSeries,
    "CAST(SUM(gp.MythicMedalCount) AS REAL) / COUNT(DISTINCT gp.QueueNumber)",
  ],
  [LeaderboardMetric.AvgMythicMedalsPerGame, "AVG(gp.MythicMedalCount)"],
  [LeaderboardMetric.ObjectiveTime, "SUM(gp.ObjectiveTimeSeconds)"],
  [LeaderboardMetric.AvgObjectiveTimePerGame, "AVG(gp.ObjectiveTimeSeconds)"],
  [LeaderboardMetric.ObjectiveTeamContribution, "AVG(gp.ObjectiveTeamContribution)"],
]);

const PLAYER_OUTCOME_RANK_SQL_BY_METRIC = new Map<LeaderboardMetric, string>([
  [LeaderboardMetric.SeriesPlayed, "COUNT(*)"],
  [LeaderboardMetric.SeriesWins, "SUM(sp.SeriesWon)"],
  [
    LeaderboardMetric.SeriesWinRate,
    "CASE WHEN COUNT(*) = 0 THEN 0 ELSE CAST(SUM(sp.SeriesWon) AS REAL) / COUNT(*) END",
  ],
  [LeaderboardMetric.GamesPlayed, "SUM(sp.GamesPlayedCount)"],
  [LeaderboardMetric.GameWins, "COALESCE(MAX(gameStats.GameWins), 0)"],
  [
    LeaderboardMetric.GamesWinRate,
    "CASE WHEN SUM(sp.GamesPlayedCount) = 0 THEN 0 ELSE CAST(COALESCE(MAX(gameStats.GameWins), 0) AS REAL) / SUM(sp.GamesPlayedCount) END",
  ],
]);

function getPlayerObjectiveSumSql(category: GameVariantCategory, path: string): string {
  return `SUM(CASE WHEN g.GameVariantCategory = ${category.toString()} THEN COALESCE(CAST(json_extract(gp.ObjectiveStatsJson, '$.${path}') AS REAL), 0) ELSE 0 END)`;
}

function isAscendingMetric(metric: LeaderboardMetric): boolean {
  return (
    metric === LeaderboardMetric.Deaths ||
    metric === LeaderboardMetric.AvgDeathsPerSeries ||
    metric === LeaderboardMetric.AvgDeathsPerGame
  );
}

interface StatMetricRankSqlParts {
  metric: LeaderboardMetric;
  valueSql: string;
  gamesPlayedSql: string;
  minGamesPlayed: number;
  sortDirection: "ASC" | "DESC";
}

// Per-metric pieces used to rank many stat metrics from one shared population scan instead of one
// full scan per metric. Eligibility (gamesPlayedSql/minGamesPlayed) legitimately varies per metric,
// since objective metrics are only eligible for players with qualifying objective games.
function getStatMetricRankSqlParts(metric: LeaderboardMetric, minGamesPlayed: number): StatMetricRankSqlParts {
  if (isObjectiveLeaderboardMetric(metric)) {
    const descriptor = getLeaderboardObjectiveDescriptorByMetric(metric);
    const gamesPlayedSql = getObjectiveCategoryGamesSql(descriptor.category);
    const valueSql =
      metric === descriptor.averageMetric
        ? `CASE WHEN ${gamesPlayedSql} = 0 THEN 0 ELSE CAST(SUM(${getObjectiveStatValueSql(descriptor)}) AS REAL) / ${gamesPlayedSql} END`
        : `SUM(${getObjectiveStatValueSql(descriptor)})`;

    return {
      metric,
      valueSql,
      gamesPlayedSql,
      minGamesPlayed: Math.max(minGamesPlayed, 1),
      sortDirection: isAscendingMetric(metric) ? "ASC" : "DESC",
    };
  }

  const valueSql = PLAYER_STAT_RANK_SQL_BY_METRIC.get(metric);
  if (valueSql == null) {
    throw new Error(`Unsupported player-stats rank metric: ${metric}`);
  }

  if (metric === LeaderboardMetric.ObjectiveTime || metric === LeaderboardMetric.AvgObjectiveTimePerGame) {
    return {
      metric,
      valueSql,
      gamesPlayedSql: "COUNT(gp.ObjectiveTimeSeconds)",
      minGamesPlayed: Math.max(minGamesPlayed, 1),
      sortDirection: isAscendingMetric(metric) ? "ASC" : "DESC",
    };
  }

  if (metric === LeaderboardMetric.ObjectiveTeamContribution) {
    return {
      metric,
      valueSql,
      gamesPlayedSql: "COUNT(gp.ObjectiveTeamContribution)",
      minGamesPlayed: Math.max(minGamesPlayed, 1),
      sortDirection: isAscendingMetric(metric) ? "ASC" : "DESC",
    };
  }

  return {
    metric,
    valueSql,
    gamesPlayedSql: "COUNT(*)",
    minGamesPlayed,
    sortDirection: isAscendingMetric(metric) ? "ASC" : "DESC",
  };
}

type PairRelationship = "with" | "against";
type PairScope = "game" | "series";
type PairValue = "count" | "win-rate";

interface PairRelationshipMetricConfig {
  relationship: PairRelationship;
  scope: PairScope;
  value: PairValue;
}

interface HeadToHeadMetricConfig {
  direction: "kills" | "deaths";
  value: "average" | "total";
}

function getPairRelationshipMetricConfig(
  metric: LeaderboardPlayerRelationshipMetric,
): PairRelationshipMetricConfig | null {
  switch (metric) {
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedWith: {
      return { relationship: "with", scope: "series", value: "count" };
    }
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedAgainst: {
      return { relationship: "against", scope: "series", value: "count" };
    }
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateWith: {
      return { relationship: "with", scope: "series", value: "win-rate" };
    }
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateAgainst: {
      return { relationship: "against", scope: "series", value: "win-rate" };
    }
    case LeaderboardPlayerRelationshipMetric.GamesPlayedWith: {
      return { relationship: "with", scope: "game", value: "count" };
    }
    case LeaderboardPlayerRelationshipMetric.GamesPlayedAgainst: {
      return { relationship: "against", scope: "game", value: "count" };
    }
    case LeaderboardPlayerRelationshipMetric.GamesWinRateWith: {
      return { relationship: "with", scope: "game", value: "win-rate" };
    }
    case LeaderboardPlayerRelationshipMetric.GamesWinRateAgainst: {
      return { relationship: "against", scope: "game", value: "win-rate" };
    }
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills:
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadDeaths:
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadKills:
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadDeaths: {
      return null;
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

function getHeadToHeadMetricConfig(metric: LeaderboardPlayerRelationshipMetric): HeadToHeadMetricConfig | null {
  switch (metric) {
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills: {
      return { direction: "kills", value: "average" };
    }
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadDeaths: {
      return { direction: "deaths", value: "average" };
    }
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadKills: {
      return { direction: "kills", value: "total" };
    }
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadDeaths: {
      return { direction: "deaths", value: "total" };
    }
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedWith:
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedAgainst:
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateWith:
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateAgainst:
    case LeaderboardPlayerRelationshipMetric.GamesPlayedWith:
    case LeaderboardPlayerRelationshipMetric.GamesPlayedAgainst:
    case LeaderboardPlayerRelationshipMetric.GamesWinRateWith:
    case LeaderboardPlayerRelationshipMetric.GamesWinRateAgainst: {
      return null;
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

function getHeadToHeadRelationshipAggregateSql({
  guildId,
  xboxXuid,
  queueChannelId,
  queueChannelIds,
  startEpochSeconds,
  config,
}: {
  guildId: string;
  xboxXuid: string;
  queueChannelId: string | null;
  queueChannelIds: string[] | undefined;
  startEpochSeconds: number;
  config: HeadToHeadMetricConfig;
}): { sql: string; bindings: readonly (string | number | null)[] } {
  const queueFilterSql = getQueueFilterSql("player", queueChannelIds);
  const queueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);
  const killerXuidSql = config.direction === "kills" ? "player.XboxXuid" : "related.XboxXuid";
  const victimXuidSql = config.direction === "kills" ? "related.XboxXuid" : "player.XboxXuid";
  const killsSql = "SUM(COALESCE(matrix.Count, 0))";
  const metricValueSql =
    config.value === "total" ? killsSql : `CASE WHEN COUNT(*) = 0 THEN 0 ELSE CAST(${killsSql} AS REAL) / COUNT(*) END`;
  return {
    sql: `
      SELECT
        related.XboxXuid AS XboxXuid,
        latestIdentity.DiscordUserId AS DiscordUserId,
        latestIdentity.GamertagSnapshot AS Gamertag,
        ${metricValueSql} AS MetricValue,
        COUNT(*) AS SharedCount,
        0 AS Wins,
        SUM(COALESCE(matrix.Perfects, 0)) AS Perfects
      FROM LeaderboardGamePlayers player
      INNER JOIN LeaderboardGames game
        ON game.GuildId = player.GuildId
        AND game.QueueNumber = player.QueueNumber
        AND game.MatchId = player.MatchId
      INNER JOIN LeaderboardGamePlayers related
        ON related.GuildId = player.GuildId
        AND related.QueueNumber = player.QueueNumber
        AND related.MatchId = player.MatchId
        AND related.XboxXuid != player.XboxXuid
        AND related.TeamId != player.TeamId
      ${getLatestIdentityJoinSql({
        relatedTableName: "LeaderboardGamePlayers",
        identityTableName: "LeaderboardGames",
        timeColumn: "EndedAt",
        joinClause: "AND identityTable.MatchId = relatedIdentity.MatchId",
        relatedAlias: "related",
        queueChannelIds,
      })}
      LEFT JOIN MatchKillMatrix matrix
        ON matrix.MatchId = game.MatchId
        AND matrix.KillerXuid = ${killerXuidSql}
        AND matrix.VictimXuid = ${victimXuidSql}
      WHERE player.GuildId = ?
        AND player.XboxXuid = ?
        AND game.EndedAt >= ?
        AND ${queueFilterSql}
        AND EXISTS (SELECT 1 FROM MatchKillMatrix matrixStatus WHERE matrixStatus.MatchId = game.MatchId)
      GROUP BY related.XboxXuid
    `,
    bindings: [
      guildId,
      startEpochSeconds,
      ...queueFilterBindings,
      guildId,
      xboxXuid,
      startEpochSeconds,
      ...queueFilterBindings,
    ],
  };
}

function getSeriesRelationshipAggregateSql({
  guildId,
  xboxXuid,
  queueChannelId,
  queueChannelIds,
  startEpochSeconds,
  config,
}: {
  guildId: string;
  xboxXuid: string;
  queueChannelId: string | null;
  queueChannelIds: string[] | undefined;
  startEpochSeconds: number;
  config: PairRelationshipMetricConfig;
}): { sql: string; bindings: readonly (string | number | null)[] } {
  const queueFilterSql = getQueueFilterSql("player", queueChannelIds);
  const queueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);
  const teamComparisonSql = config.relationship === "with" ? "=" : "!=";
  const metricValueSql =
    config.value === "count"
      ? "COUNT(*)"
      : "CASE WHEN COUNT(*) = 0 THEN 0 ELSE CAST(SUM(player.SeriesWon) AS REAL) / COUNT(*) END";
  return {
    sql: `
      SELECT
        related.XboxXuid AS XboxXuid,
        latestIdentity.DiscordUserId AS DiscordUserId,
        latestIdentity.GamertagSnapshot AS Gamertag,
        ${metricValueSql} AS MetricValue,
        COUNT(*) AS SharedCount,
        SUM(player.SeriesWon) AS Wins,
        0 AS Perfects
      FROM LeaderboardSeriesPlayers player
      INNER JOIN LeaderboardSeries series
        ON series.GuildId = player.GuildId
        AND series.QueueNumber = player.QueueNumber
      INNER JOIN LeaderboardSeriesPlayers related
        ON related.GuildId = player.GuildId
        AND related.QueueNumber = player.QueueNumber
        AND related.XboxXuid != player.XboxXuid
        AND related.TeamId ${teamComparisonSql} player.TeamId
      ${getLatestIdentityJoinSql({
        relatedTableName: "LeaderboardSeriesPlayers",
        identityTableName: "LeaderboardSeries",
        timeColumn: "CompletedAt",
        joinClause: "",
        relatedAlias: "related",
        queueChannelIds,
      })}
      WHERE player.GuildId = ?
        AND player.XboxXuid = ?
        AND series.CompletedAt >= ?
        AND ${queueFilterSql}
      GROUP BY related.XboxXuid
    `,
    bindings: [
      guildId,
      startEpochSeconds,
      ...queueFilterBindings,
      guildId,
      xboxXuid,
      startEpochSeconds,
      ...queueFilterBindings,
    ],
  };
}

function getGameRelationshipAggregateSql({
  guildId,
  xboxXuid,
  queueChannelId,
  queueChannelIds,
  startEpochSeconds,
  config,
}: {
  guildId: string;
  xboxXuid: string;
  queueChannelId: string | null;
  queueChannelIds: string[] | undefined;
  startEpochSeconds: number;
  config: PairRelationshipMetricConfig;
}): { sql: string; bindings: readonly (string | number | null)[] } {
  const queueFilterSql = getQueueFilterSql("player", queueChannelIds);
  const queueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);
  const teamComparisonSql = config.relationship === "with" ? "=" : "!=";
  const metricValueSql =
    config.value === "count"
      ? "COUNT(*)"
      : "CASE WHEN COUNT(*) = 0 THEN 0 ELSE CAST(SUM(player.GameWon) AS REAL) / COUNT(*) END";
  return {
    sql: `
      SELECT
        related.XboxXuid AS XboxXuid,
        latestIdentity.DiscordUserId AS DiscordUserId,
        latestIdentity.GamertagSnapshot AS Gamertag,
        ${metricValueSql} AS MetricValue,
        COUNT(*) AS SharedCount,
        SUM(player.GameWon) AS Wins,
        0 AS Perfects
      FROM LeaderboardGamePlayers player
      INNER JOIN LeaderboardGames game
        ON game.GuildId = player.GuildId
        AND game.QueueNumber = player.QueueNumber
        AND game.MatchId = player.MatchId
      INNER JOIN LeaderboardGamePlayers related
        ON related.GuildId = player.GuildId
        AND related.QueueNumber = player.QueueNumber
        AND related.MatchId = player.MatchId
        AND related.XboxXuid != player.XboxXuid
        AND related.TeamId ${teamComparisonSql} player.TeamId
      ${getLatestIdentityJoinSql({
        relatedTableName: "LeaderboardGamePlayers",
        identityTableName: "LeaderboardGames",
        timeColumn: "EndedAt",
        joinClause: "AND identityTable.MatchId = relatedIdentity.MatchId",
        relatedAlias: "related",
        queueChannelIds,
      })}
      WHERE player.GuildId = ?
        AND player.XboxXuid = ?
        AND game.EndedAt >= ?
        AND ${queueFilterSql}
      GROUP BY related.XboxXuid
    `,
    bindings: [
      guildId,
      startEpochSeconds,
      ...queueFilterBindings,
      guildId,
      xboxXuid,
      startEpochSeconds,
      ...queueFilterBindings,
    ],
  };
}

function getPairSeriesRelationshipAggregateSql({
  guildId,
  xboxXuid1,
  xboxXuid2,
  queueChannelId,
  queueChannelIds,
  startEpochSeconds,
}: {
  guildId: string;
  xboxXuid1: string;
  xboxXuid2: string;
  queueChannelId: string | null;
  queueChannelIds: string[] | undefined;
  startEpochSeconds: number;
}): { sql: string; bindings: readonly (string | number | null)[] } {
  const queueFilterSql = getQueueFilterSql("player", queueChannelIds);
  const queueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);

  return {
    sql: `
      SELECT
        SUM(CASE WHEN related.TeamId = player.TeamId THEN 1 ELSE 0 END) AS SeriesPlayedWith,
        SUM(CASE WHEN related.TeamId = player.TeamId THEN player.SeriesWon ELSE 0 END) AS Player1SeriesWinsWith,
        SUM(CASE WHEN related.TeamId != player.TeamId THEN 1 ELSE 0 END) AS SeriesPlayedAgainst,
        SUM(CASE WHEN related.TeamId != player.TeamId THEN player.SeriesWon ELSE 0 END) AS Player1SeriesWinsAgainst,
        SUM(CASE WHEN related.TeamId != player.TeamId THEN related.SeriesWon ELSE 0 END) AS Player2SeriesWinsAgainst
      FROM LeaderboardSeriesPlayers player
      INNER JOIN LeaderboardSeries series
        ON series.GuildId = player.GuildId
        AND series.QueueNumber = player.QueueNumber
      INNER JOIN LeaderboardSeriesPlayers related
        ON related.GuildId = player.GuildId
        AND related.QueueNumber = player.QueueNumber
        AND related.XboxXuid = ?
      WHERE player.GuildId = ?
        AND player.XboxXuid = ?
        AND series.CompletedAt >= ?
        AND ${queueFilterSql}
    `,
    bindings: [xboxXuid2, guildId, xboxXuid1, startEpochSeconds, ...queueFilterBindings],
  };
}

function getPairGameRelationshipAggregateSql({
  guildId,
  xboxXuid1,
  xboxXuid2,
  queueChannelId,
  queueChannelIds,
  startEpochSeconds,
}: {
  guildId: string;
  xboxXuid1: string;
  xboxXuid2: string;
  queueChannelId: string | null;
  queueChannelIds: string[] | undefined;
  startEpochSeconds: number;
}): { sql: string; bindings: readonly (string | number | null)[] } {
  const queueFilterSql = getQueueFilterSql("player", queueChannelIds);
  const queueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);

  return {
    sql: `
      SELECT
        SUM(CASE WHEN related.TeamId = player.TeamId THEN 1 ELSE 0 END) AS GamesPlayedWith,
        SUM(CASE WHEN related.TeamId = player.TeamId THEN player.GameWon ELSE 0 END) AS Player1GameWinsWith,
        SUM(CASE WHEN related.TeamId != player.TeamId THEN 1 ELSE 0 END) AS GamesPlayedAgainst,
        SUM(CASE WHEN related.TeamId != player.TeamId THEN player.GameWon ELSE 0 END) AS Player1GameWinsAgainst,
        SUM(CASE WHEN related.TeamId != player.TeamId THEN related.GameWon ELSE 0 END) AS Player2GameWinsAgainst
      FROM LeaderboardGamePlayers player
      INNER JOIN LeaderboardGames game
        ON game.GuildId = player.GuildId
        AND game.QueueNumber = player.QueueNumber
        AND game.MatchId = player.MatchId
      INNER JOIN LeaderboardGamePlayers related
        ON related.GuildId = player.GuildId
        AND related.QueueNumber = player.QueueNumber
        AND related.MatchId = player.MatchId
        AND related.XboxXuid = ?
      WHERE player.GuildId = ?
        AND player.XboxXuid = ?
        AND game.EndedAt >= ?
        AND ${queueFilterSql}
    `,
    bindings: [xboxXuid2, guildId, xboxXuid1, startEpochSeconds, ...queueFilterBindings],
  };
}

function getPairHeadToHeadAggregateSql({
  guildId,
  xboxXuid1,
  xboxXuid2,
  queueChannelId,
  queueChannelIds,
  startEpochSeconds,
}: {
  guildId: string;
  xboxXuid1: string;
  xboxXuid2: string;
  queueChannelId: string | null;
  queueChannelIds: string[] | undefined;
  startEpochSeconds: number;
}): { sql: string; bindings: readonly (string | number | null)[] } {
  const queueFilterSql = getQueueFilterSql("player", queueChannelIds);
  const queueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);

  return {
    sql: `
      SELECT
        COUNT(*) AS HeadToHeadGamesPlayed,
        COALESCE(SUM(player1Kills.Count), 0) AS Player1Kills,
        COALESCE(SUM(player1Kills.Perfects), 0) AS Player1Perfects,
        COALESCE(SUM(player2Kills.Count), 0) AS Player2Kills,
        COALESCE(SUM(player2Kills.Perfects), 0) AS Player2Perfects
      FROM LeaderboardGamePlayers player
      INNER JOIN LeaderboardGames game
        ON game.GuildId = player.GuildId
        AND game.QueueNumber = player.QueueNumber
        AND game.MatchId = player.MatchId
      INNER JOIN LeaderboardGamePlayers related
        ON related.GuildId = player.GuildId
        AND related.QueueNumber = player.QueueNumber
        AND related.MatchId = player.MatchId
        AND related.XboxXuid = ?
        AND related.TeamId != player.TeamId
      LEFT JOIN MatchKillMatrix player1Kills
        ON player1Kills.MatchId = game.MatchId
        AND player1Kills.KillerXuid = player.XboxXuid
        AND player1Kills.VictimXuid = related.XboxXuid
      LEFT JOIN MatchKillMatrix player2Kills
        ON player2Kills.MatchId = game.MatchId
        AND player2Kills.KillerXuid = related.XboxXuid
        AND player2Kills.VictimXuid = player.XboxXuid
      WHERE player.GuildId = ?
        AND player.XboxXuid = ?
        AND game.EndedAt >= ?
        AND ${queueFilterSql}
        AND EXISTS (SELECT 1 FROM MatchKillMatrix matrixStatus WHERE matrixStatus.MatchId = game.MatchId)
    `,
    bindings: [xboxXuid2, guildId, xboxXuid1, startEpochSeconds, ...queueFilterBindings],
  };
}

interface LeaderboardRankingsQuery {
  guildId: string;
  queueChannelId: string | null;
  startEpochSeconds: number;
  minGamesPlayed: number;
  limit: number;
  offset: number;
}

export type MatchKillMatrixReplaceRow = Omit<MatchKillMatrixRow, "MatchId">;

export interface LeaderboardDataRetentionOpts {
  leaderboardRetentionBoundary: number;
  orphanedKillMatrixRetentionBoundary: number;
}

export interface DatabaseServiceOpts {
  env: Env;
}

function getRelationshipAggregateSql(
  metric: LeaderboardPlayerRelationshipMetric,
  params: {
    guildId: string;
    xboxXuid: string;
    queueChannelId: string | null;
    queueChannelIds: string[] | undefined;
    startEpochSeconds: number;
  },
): { sql: string; bindings: readonly (string | number | null)[] } {
  switch (metric) {
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills:
    case LeaderboardPlayerRelationshipMetric.AvgHeadToHeadDeaths:
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadKills:
    case LeaderboardPlayerRelationshipMetric.TotalHeadToHeadDeaths: {
      return getHeadToHeadRelationshipAggregateSql({
        ...params,
        config: Preconditions.checkExists(getHeadToHeadMetricConfig(metric), `No head-to-head config for ${metric}`),
      });
    }
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedWith:
    case LeaderboardPlayerRelationshipMetric.SeriesPlayedAgainst:
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateWith:
    case LeaderboardPlayerRelationshipMetric.SeriesWinRateAgainst: {
      return getSeriesRelationshipAggregateSql({
        ...params,
        config: Preconditions.checkExists(getPairRelationshipMetricConfig(metric), `No pair config for ${metric}`),
      });
    }
    case LeaderboardPlayerRelationshipMetric.GamesPlayedWith:
    case LeaderboardPlayerRelationshipMetric.GamesPlayedAgainst:
    case LeaderboardPlayerRelationshipMetric.GamesWinRateWith:
    case LeaderboardPlayerRelationshipMetric.GamesWinRateAgainst: {
      return getGameRelationshipAggregateSql({
        ...params,
        config: Preconditions.checkExists(getPairRelationshipMetricConfig(metric), `No pair config for ${metric}`),
      });
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

export class DatabaseService {
  private readonly DB: D1Database;
  private readonly guildConfigCache = new Map<string, GuildConfigRow>();
  constructor({ env }: DatabaseServiceOpts) {
    this.DB = env.DB;
  }

  async getDiscordAssociations(discordIds: string[]): Promise<DiscordAssociationsRow[]> {
    if (discordIds.length === 0) {
      return [];
    }

    const placeholders = discordIds.map(() => "?").join(",");
    const query = `SELECT * FROM DiscordAssociations WHERE DiscordId IN (${placeholders})`;
    const stmt = this.DB.prepare(query).bind(...discordIds);
    const response = await stmt.all<DiscordAssociationsRow>();
    return response.results;
  }

  async getDiscordAssociationsByXboxId(xboxIds: string[]): Promise<DiscordAssociationsRow[]> {
    if (xboxIds.length === 0) {
      return [];
    }

    const placeholders = xboxIds.map(() => "?").join(",");
    const query = `SELECT * FROM DiscordAssociations WHERE XboxId IN (${placeholders})`;
    const stmt = this.DB.prepare(query).bind(...xboxIds);
    const response = await stmt.all<DiscordAssociationsRow>();
    return response.results;
  }

  async upsertMatchKillMatrix(rows: MatchKillMatrixRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const variablesPerRow = 7;
    const maxRowsPerStatement = Math.max(1, Math.floor(D1_SAFE_MAX_VARIABLES_PER_STATEMENT / variablesPerRow));
    for (let start = 0; start < rows.length; start += maxRowsPerStatement) {
      const chunk = rows.slice(start, start + maxRowsPerStatement);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
      const query = `
      INSERT INTO MatchKillMatrix (MatchId, KillerXuid, VictimXuid, Count, Perfects, CreatedAt, UpdatedAt)
      VALUES ${placeholders}
      ON CONFLICT(MatchId, KillerXuid, VictimXuid) DO UPDATE SET Count=excluded.Count, Perfects=excluded.Perfects, UpdatedAt=excluded.UpdatedAt
    `;
      const values = chunk.flatMap((row) => [
        row.MatchId,
        row.KillerXuid,
        row.VictimXuid,
        row.Count,
        row.Perfects,
        row.CreatedAt,
        row.UpdatedAt,
      ]);
      await this.DB.prepare(query)
        .bind(...values)
        .run();
    }
  }

  async replaceMatchKillMatrix(matchId: string, rows: MatchKillMatrixReplaceRow[]): Promise<void> {
    const deleteStmt = this.DB.prepare("DELETE FROM MatchKillMatrix WHERE MatchId = ?").bind(matchId);
    if (rows.length === 0) {
      await deleteStmt.run();
      return;
    }

    const variablesPerRow = 7;
    const maxRowsPerStatement = Math.max(1, Math.floor(D1_SAFE_MAX_VARIABLES_PER_STATEMENT / variablesPerRow));
    const statements: D1PreparedStatement[] = [deleteStmt];

    for (let start = 0; start < rows.length; start += maxRowsPerStatement) {
      const chunk = rows.slice(start, start + maxRowsPerStatement);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
      const query = `
      INSERT INTO MatchKillMatrix (MatchId, KillerXuid, VictimXuid, Count, Perfects, CreatedAt, UpdatedAt)
      VALUES ${placeholders}
      ON CONFLICT(MatchId, KillerXuid, VictimXuid) DO UPDATE SET Count=excluded.Count, Perfects=excluded.Perfects, UpdatedAt=excluded.UpdatedAt
    `;
      const values = chunk.flatMap((row) => [
        matchId,
        row.KillerXuid,
        row.VictimXuid,
        row.Count,
        row.Perfects,
        row.CreatedAt,
        row.UpdatedAt,
      ]);
      statements.push(this.DB.prepare(query).bind(...values));
    }

    await this.DB.batch(statements);
  }

  async getMatchKillMatrix(matchId: string): Promise<MatchKillMatrixRow[]> {
    const response = await this.DB.prepare("SELECT * FROM MatchKillMatrix WHERE MatchId = ?")
      .bind(matchId)
      .all<MatchKillMatrixRow>();
    return response.results;
  }

  async getMatchKillMatrices(matchIds: string[]): Promise<MatchKillMatrixRow[]> {
    if (matchIds.length === 0) {
      return [];
    }

    const placeholders = matchIds.map(() => "?").join(",");
    const response = await this.DB.prepare(`SELECT * FROM MatchKillMatrix WHERE MatchId IN (${placeholders})`)
      .bind(...matchIds)
      .all<MatchKillMatrixRow>();
    return response.results;
  }

  async upsertDiscordAssociations(associations: DiscordAssociationsRow[]): Promise<void> {
    if (associations.length === 0) {
      return;
    }

    const placeholders = associations.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
    const query = `
      INSERT INTO DiscordAssociations (DiscordId, XboxId, AssociationReason, AssociationDate, GamesRetrievable, DiscordDisplayNameSearched) VALUES ${placeholders}
      ON CONFLICT(DiscordId) DO UPDATE SET XboxId=excluded.XboxId, AssociationReason=excluded.AssociationReason, AssociationDate=excluded.AssociationDate, GamesRetrievable=excluded.GamesRetrievable, DiscordDisplayNameSearched=excluded.DiscordDisplayNameSearched
    `;
    const bindings = associations.flatMap((association) => [
      association.DiscordId,
      association.XboxId,
      association.AssociationReason,
      association.AssociationDate,
      association.GamesRetrievable,
      association.DiscordDisplayNameSearched,
    ]);

    const stmt = this.DB.prepare(query).bind(...bindings);
    await stmt.run();
  }

  async deleteDiscordAssociations(discordIds: string[]): Promise<void> {
    const placeholders = discordIds.map(() => "?").join(",");
    const query = `DELETE FROM DiscordAssociations WHERE DiscordId IN (${placeholders})`;
    const stmt = this.DB.prepare(query).bind(...discordIds);
    await stmt.run();
  }

  async getGuildConfig(guildId: string, autoCreate = false): Promise<GuildConfigRow> {
    if (this.guildConfigCache.has(guildId)) {
      return Preconditions.checkExists(this.guildConfigCache.get(guildId));
    }

    const query = "SELECT * FROM GuildConfig WHERE GuildId = ?";
    const stmt = this.DB.prepare(query).bind(guildId);
    const result = await stmt.first<StoredGuildConfigRow>();

    if (result) {
      const config = normalizeGuildConfig(result);
      this.guildConfigCache.set(guildId, config);
      return config;
    }

    const defaultConfig: GuildConfigRow = {
      GuildId: guildId,
      StatsReturn: StatsReturnType.SERIES_ONLY,
      Medals: "Y",
      NeatQueueInformerPlayerConnections: "Y",
      NeatQueueInformerMapsPost: MapsPostType.BUTTON,
      NeatQueueInformerMapsPlaylist: MapsPlaylistType.HCS_CURRENT,
      NeatQueueInformerMapsFormat: MapsFormatType.HCS,
      NeatQueueInformerMapsCount: 5,
      NeatQueueInformerLiveTracking: "N",
      NeatQueueInformerLiveTrackingChannelName: "N",
    };

    if (autoCreate) {
      const insertStmt = this.DB.prepare(
        "INSERT INTO GuildConfig (GuildId, StatsReturn, Medals, NeatQueueInformerPlayerConnections, NeatQueueInformerMapsPost, NeatQueueInformerMapsPlaylist, NeatQueueInformerMapsFormat, NeatQueueInformerMapsCount, NeatQueueInformerLiveTracking, NeatQueueInformerLiveTrackingChannelName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        defaultConfig.GuildId,
        defaultConfig.StatsReturn,
        defaultConfig.Medals,
        defaultConfig.NeatQueueInformerPlayerConnections,
        defaultConfig.NeatQueueInformerMapsPost,
        defaultConfig.NeatQueueInformerMapsPlaylist,
        defaultConfig.NeatQueueInformerMapsFormat,
        defaultConfig.NeatQueueInformerMapsCount,
        defaultConfig.NeatQueueInformerLiveTracking,
        defaultConfig.NeatQueueInformerLiveTrackingChannelName,
      );

      await insertStmt.run();
    }

    this.guildConfigCache.set(guildId, defaultConfig);
    return defaultConfig;
  }

  async updateGuildConfig(guildId: string, updates: Partial<Omit<GuildConfigRow, "GuildId">>): Promise<void> {
    const setStatements: string[] = [];
    const values: (StatsReturnType | string | number | null)[] = [];

    type UpdatableKeys = keyof Omit<GuildConfigRow, "GuildId">;
    const createUpdateKeysArray = <T extends readonly UpdatableKeys[]>(
      keys: T &
        (UpdatableKeys extends T[number] ? unknown : "Missing keys") &
        (T[number] extends UpdatableKeys ? unknown : "Extra keys"),
    ): T => keys;

    const updateKeys = createUpdateKeysArray([
      "StatsReturn",
      "Medals",
      "NeatQueueInformerPlayerConnections",
      "NeatQueueInformerMapsPost",
      "NeatQueueInformerMapsPlaylist",
      "NeatQueueInformerMapsFormat",
      "NeatQueueInformerMapsCount",
      "NeatQueueInformerLiveTracking",
      "NeatQueueInformerLiveTrackingChannelName",
    ] as const);

    for (const key of updateKeys) {
      if (updates[key] !== undefined) {
        setStatements.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (setStatements.length === 0) {
      return;
    }

    values.push(guildId);

    const query = `UPDATE GuildConfig SET ${setStatements.join(", ")} WHERE GuildId = ?`;
    const stmt = this.DB.prepare(query).bind(...values);
    await stmt.run();

    const cachedConfig = this.guildConfigCache.get(guildId);
    if (cachedConfig) {
      const updatedConfig: GuildConfigRow = {
        ...cachedConfig,
        ...updates,
        GuildId: guildId,
      };
      this.guildConfigCache.set(guildId, updatedConfig);
    }
  }

  async getNeatQueueConfig(guildId: string, channelId: string): Promise<NeatQueueConfigRow> {
    const query = "SELECT * FROM NeatQueueConfig WHERE GuildId = ? AND ChannelId = ?";
    const stmt = this.DB.prepare(query).bind(guildId, channelId);
    const result = await stmt.first<NeatQueueConfigRow>();

    if (!result) {
      throw new Error(`No NeatQueueConfig found for GuildId: ${guildId} and ChannelId: ${channelId}`);
    }

    return result;
  }

  async findNeatQueueConfig(req: Partial<NeatQueueConfigRow>): Promise<NeatQueueConfigRow[]> {
    const whereConditions: string[] = [];
    const values: (NeatQueuePostSeriesDisplayMode | string | null)[] = [];

    const keys = Object.keys(req) as (keyof NeatQueueConfigRow)[];
    for (const key of keys) {
      if (req[key] !== undefined) {
        whereConditions.push(`${key} = ?`);
        values.push(req[key]);
      }
    }

    if (whereConditions.length === 0) {
      return [];
    }

    const query = `SELECT * FROM NeatQueueConfig WHERE ${whereConditions.join(" AND ")}`;
    const stmt = this.DB.prepare(query).bind(...values);
    const { results } = await stmt.all<NeatQueueConfigRow>();

    return results;
  }

  async getAllNeatQueueConfigs(): Promise<NeatQueueConfigRow[]> {
    const query = "SELECT * FROM NeatQueueConfig";
    const stmt = this.DB.prepare(query);
    const { results } = await stmt.all<NeatQueueConfigRow>();

    return results;
  }

  async upsertNeatQueueConfig(config: NeatQueueConfigRow): Promise<void> {
    const query = `
      INSERT INTO NeatQueueConfig (GuildId, ChannelId, WebhookSecret, ResultsChannelId, PostSeriesMode, PostSeriesChannelId) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(GuildId, ChannelId) DO UPDATE SET WebhookSecret=excluded.WebhookSecret, ResultsChannelId=excluded.ResultsChannelId, PostSeriesMode=excluded.PostSeriesMode, PostSeriesChannelId=excluded.PostSeriesChannelId
    `;
    const bindings = [
      config.GuildId,
      config.ChannelId,
      config.WebhookSecret,
      config.ResultsChannelId,
      config.PostSeriesMode,
      config.PostSeriesChannelId,
    ];
    const stmt = this.DB.prepare(query).bind(...bindings);
    await stmt.run();
  }

  async deleteNeatQueueConfig(guildId: string, channelId: string): Promise<void> {
    const query = "DELETE FROM NeatQueueConfig WHERE GuildId = ? AND ChannelId = ?";
    const stmt = this.DB.prepare(query).bind(guildId, channelId);
    await stmt.run();
  }

  async getLeaderboardConfig(guildId: string, autoCreate = false): Promise<LeaderboardConfigRow> {
    const query = "SELECT * FROM LeaderboardConfig WHERE GuildId = ?";
    const stmt = this.DB.prepare(query).bind(guildId);
    const result = await stmt.first<LeaderboardConfigRow>();

    if (result != null) {
      return result;
    }

    const defaultConfig: LeaderboardConfigRow = {
      GuildId: guildId,
      EnabledWindowsJson: DEFAULT_LEADERBOARD_ENABLED_WINDOWS_JSON,
      DefaultWindow: LeaderboardWindow.ThreeMonths,
      DefaultMetric: LeaderboardMetric.SeriesWinRate,
      MinGamesPlayed: 5,
      UpdatedAt: Math.floor(Date.now() / 1000),
    };

    if (autoCreate) {
      const insertStmt = this.DB.prepare(
        "INSERT INTO LeaderboardConfig (GuildId, EnabledWindowsJson, DefaultWindow, DefaultMetric, MinGamesPlayed, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(GuildId) DO NOTHING",
      ).bind(
        defaultConfig.GuildId,
        defaultConfig.EnabledWindowsJson,
        defaultConfig.DefaultWindow,
        defaultConfig.DefaultMetric,
        defaultConfig.MinGamesPlayed,
        defaultConfig.UpdatedAt,
      );

      await insertStmt.run();
    }

    return defaultConfig;
  }

  async upsertLeaderboardConfig(config: LeaderboardConfigRow): Promise<void> {
    const query = `
      INSERT INTO LeaderboardConfig (GuildId, EnabledWindowsJson, DefaultWindow, DefaultMetric, MinGamesPlayed, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(GuildId) DO UPDATE SET EnabledWindowsJson=excluded.EnabledWindowsJson, DefaultWindow=excluded.DefaultWindow, DefaultMetric=excluded.DefaultMetric, MinGamesPlayed=excluded.MinGamesPlayed, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
      config.GuildId,
      config.EnabledWindowsJson,
      config.DefaultWindow,
      config.DefaultMetric,
      config.MinGamesPlayed,
      config.UpdatedAt,
    );
    await stmt.run();
  }

  async upsertLeaderboardPost(post: LeaderboardPostRow): Promise<void> {
    const query = `
      INSERT INTO LeaderboardPosts (ChannelId, MessageId, GuildId, QueueChannelId)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ChannelId, MessageId) DO UPDATE SET GuildId=excluded.GuildId, QueueChannelId=excluded.QueueChannelId
    `;
    const stmt = this.DB.prepare(query).bind(post.ChannelId, post.MessageId, post.GuildId, post.QueueChannelId);
    await stmt.run();
  }

  async getLeaderboardResetMarker(
    guildId: string,
    queueChannelId: string | null,
  ): Promise<LeaderboardResetMarkerRow | null> {
    const stmt = this.DB.prepare(
      "SELECT GuildId, NULLIF(QueueChannelId, '') AS QueueChannelId, ResetAt, CreatedAt, UpdatedAt FROM LeaderboardResetMarkers WHERE GuildId = ? AND QueueChannelId = ?",
    ).bind(guildId, queueChannelId ?? "");
    return await stmt.first<LeaderboardResetMarkerRow>();
  }

  async upsertLeaderboardResetMarker(marker: LeaderboardResetMarkerRow): Promise<void> {
    const stmt = this.DB.prepare(
      `INSERT INTO LeaderboardResetMarkers (GuildId, QueueChannelId, ResetAt, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(GuildId, QueueChannelId) DO UPDATE SET ResetAt=excluded.ResetAt, UpdatedAt=excluded.UpdatedAt`,
    ).bind(marker.GuildId, marker.QueueChannelId ?? "", marker.ResetAt, marker.CreatedAt, marker.UpdatedAt);
    await stmt.run();
  }

  async findLeaderboardPostsForRefresh(guildId: string, queueChannelId: string): Promise<LeaderboardPostRow[]> {
    const query = "SELECT * FROM LeaderboardPosts WHERE GuildId = ? AND (QueueChannelId IS NULL OR QueueChannelId = ?)";
    const stmt = this.DB.prepare(query).bind(guildId, queueChannelId);
    const response = await stmt.all<LeaderboardPostRow>();
    return response.results;
  }

  async findLeaderboardPostsForGuildRefresh(guildId: string): Promise<LeaderboardPostRow[]> {
    const stmt = this.DB.prepare("SELECT * FROM LeaderboardPosts WHERE GuildId = ?").bind(guildId);
    const response = await stmt.all<LeaderboardPostRow>();
    return response.results;
  }

  async getAllLeaderboardPosts(): Promise<LeaderboardPostRow[]> {
    const stmt = this.DB.prepare("SELECT * FROM LeaderboardPosts");
    const response = await stmt.all<LeaderboardPostRow>();
    return response.results;
  }

  async deleteLeaderboardPost(channelId: string, messageId: string): Promise<void> {
    const query = "DELETE FROM LeaderboardPosts WHERE ChannelId = ? AND MessageId = ?";
    const stmt = this.DB.prepare(query).bind(channelId, messageId);
    await stmt.run();
  }

  async upsertLeaderboardSeries(series: LeaderboardSeriesRow): Promise<void> {
    const query = `
      INSERT INTO LeaderboardSeries (GuildId, QueueNumber, QueueChannelId, ResultsChannelId, StartedAt, CompletedAt, WinnerTeamIndex, SeriesScore, Source, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(GuildId, QueueNumber) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, ResultsChannelId=excluded.ResultsChannelId, StartedAt=excluded.StartedAt, CompletedAt=excluded.CompletedAt, WinnerTeamIndex=excluded.WinnerTeamIndex, SeriesScore=excluded.SeriesScore, Source=excluded.Source, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
      series.GuildId,
      series.QueueNumber,
      series.QueueChannelId,
      series.ResultsChannelId,
      series.StartedAt,
      series.CompletedAt,
      series.WinnerTeamIndex,
      series.SeriesScore,
      series.Source,
      series.CreatedAt,
      series.UpdatedAt,
    );
    await stmt.run();
  }

  async upsertLeaderboardSeriesPlayers(players: LeaderboardSeriesPlayersRow[]): Promise<void> {
    if (players.length === 0) {
      return;
    }

    const firstPlayer = Preconditions.checkExists(players[0]);
    for (const player of players) {
      const isSameSeries = player.GuildId === firstPlayer.GuildId && player.QueueNumber === firstPlayer.QueueNumber;
      if (!isSameSeries) {
        throw new Error("Expected leaderboard series players to belong to a single guild and queue");
      }
    }

    const playerXuids = [...new Set(players.map((player) => player.XboxXuid))];
    const deletePlaceholders = playerXuids.map(() => "?").join(",");
    const deleteStmt = this.DB.prepare(
      `DELETE FROM LeaderboardSeriesPlayers WHERE GuildId = ? AND QueueNumber = ? AND XboxXuid NOT IN (${deletePlaceholders})`,
    ).bind(firstPlayer.GuildId, firstPlayer.QueueNumber, ...playerXuids);

    const placeholders = players.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const query = `
      INSERT INTO LeaderboardSeriesPlayers (GuildId, QueueNumber, QueueChannelId, XboxXuid, DiscordUserId, GamertagSnapshot, TeamId, PresentAtBeginningCount, SubstituteInCount, SubstituteOutCount, GamesPlayedCount, SeriesWon, CreatedAt)
      VALUES ${placeholders}
      ON CONFLICT(GuildId, QueueNumber, XboxXuid) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, DiscordUserId=excluded.DiscordUserId, GamertagSnapshot=excluded.GamertagSnapshot, TeamId=excluded.TeamId, PresentAtBeginningCount=excluded.PresentAtBeginningCount, SubstituteInCount=excluded.SubstituteInCount, SubstituteOutCount=excluded.SubstituteOutCount, GamesPlayedCount=excluded.GamesPlayedCount, SeriesWon=excluded.SeriesWon
    `;
    const values = players.flatMap((player) => [
      player.GuildId,
      player.QueueNumber,
      player.QueueChannelId,
      player.XboxXuid,
      player.DiscordUserId,
      player.GamertagSnapshot,
      player.TeamId,
      player.PresentAtBeginningCount,
      player.SubstituteInCount,
      player.SubstituteOutCount,
      player.GamesPlayedCount,
      player.SeriesWon,
      player.CreatedAt,
    ]);
    const insertStmt = this.DB.prepare(query).bind(...values);
    await this.DB.batch([deleteStmt, insertStmt]);
  }

  async upsertLeaderboardGames(games: LeaderboardGamesRow[]): Promise<void> {
    if (games.length === 0) {
      return;
    }

    const statements: D1PreparedStatement[] = [];
    const queueNumbersByGuild = new Map<string, Set<number>>();
    for (const game of games) {
      const queueNumbers = queueNumbersByGuild.get(game.GuildId);
      if (queueNumbers == null) {
        queueNumbersByGuild.set(game.GuildId, new Set([game.QueueNumber]));
      } else {
        queueNumbers.add(game.QueueNumber);
      }
    }

    for (const [guildId, queueNumbers] of queueNumbersByGuild) {
      for (const queueNumber of queueNumbers) {
        const deleteStmt = this.DB.prepare("DELETE FROM LeaderboardGames WHERE GuildId = ? AND QueueNumber = ?").bind(
          guildId,
          queueNumber,
        );
        statements.push(deleteStmt);
      }
    }

    const placeholders = games.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const query = `
      INSERT INTO LeaderboardGames (MatchId, GuildId, QueueNumber, QueueChannelId, GameIndexInSeries, GameVariantCategory, ModeName, MapName, MapAssetId, MapVersionId, Team0Score, Team1Score, StartedAt, EndedAt, CreatedAt)
      VALUES ${placeholders}
      ON CONFLICT(GuildId, QueueNumber, MatchId) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, GameIndexInSeries=excluded.GameIndexInSeries, GameVariantCategory=excluded.GameVariantCategory, ModeName=excluded.ModeName, MapName=excluded.MapName, MapAssetId=excluded.MapAssetId, MapVersionId=excluded.MapVersionId, Team0Score=excluded.Team0Score, Team1Score=excluded.Team1Score, StartedAt=excluded.StartedAt, EndedAt=excluded.EndedAt
    `;
    const values = games.flatMap((game) => [
      game.MatchId,
      game.GuildId,
      game.QueueNumber,
      game.QueueChannelId,
      game.GameIndexInSeries,
      game.GameVariantCategory,
      game.ModeName,
      game.MapName,
      game.MapAssetId,
      game.MapVersionId,
      game.Team0Score,
      game.Team1Score,
      game.StartedAt,
      game.EndedAt,
      game.CreatedAt,
    ]);
    const stmt = this.DB.prepare(query).bind(...values);
    statements.push(stmt);
    await this.DB.batch(statements);
  }

  async upsertLeaderboardGamePlayers(players: LeaderboardGamePlayersRow[]): Promise<void> {
    if (players.length === 0) {
      return;
    }

    const variablesPerRow = 33;
    const statementVariableLimit = Math.min(SQLITE_MAX_VARIABLES, D1_SAFE_MAX_VARIABLES_PER_STATEMENT);
    const maxRowsPerStatement = Math.max(1, Math.floor(statementVariableLimit / variablesPerRow));
    const statements: D1PreparedStatement[] = [];

    for (let start = 0; start < players.length; start += maxRowsPerStatement) {
      const chunk = players.slice(start, start + maxRowsPerStatement);
      const rowPlaceholders = `(${Array.from({ length: variablesPerRow }, () => "?").join(", ")})`;
      const placeholders = chunk.map(() => rowPlaceholders).join(",");
      const query = `
        INSERT INTO LeaderboardGamePlayers (MatchId, GuildId, QueueNumber, QueueChannelId, XboxXuid, DiscordUserId, GamertagSnapshot, TeamId, PresentAtBeginning, GameWon, RankInMatch, PersonalScore, Kills, Deaths, Assists, HeadshotKills, Kda, Accuracy, ShotsHit, ShotsFired, DamageDealt, DamageTaken, DamageRatio, AvgLifeSeconds, AvgDamagePerLife, MedalCount, MedalPoints, MythicMedalCount, ObjectiveTimeSeconds, ObjectiveTeamContribution, ObjectiveStatsJson, MedalsJson, CreatedAt)
        VALUES ${placeholders}
        ON CONFLICT(GuildId, QueueNumber, MatchId, XboxXuid) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, DiscordUserId=excluded.DiscordUserId, GamertagSnapshot=excluded.GamertagSnapshot, TeamId=excluded.TeamId, PresentAtBeginning=excluded.PresentAtBeginning, GameWon=excluded.GameWon, RankInMatch=excluded.RankInMatch, PersonalScore=excluded.PersonalScore, Kills=excluded.Kills, Deaths=excluded.Deaths, Assists=excluded.Assists, HeadshotKills=excluded.HeadshotKills, Kda=excluded.Kda, Accuracy=excluded.Accuracy, ShotsHit=excluded.ShotsHit, ShotsFired=excluded.ShotsFired, DamageDealt=excluded.DamageDealt, DamageTaken=excluded.DamageTaken, DamageRatio=excluded.DamageRatio, AvgLifeSeconds=excluded.AvgLifeSeconds, AvgDamagePerLife=excluded.AvgDamagePerLife, MedalCount=excluded.MedalCount, MedalPoints=excluded.MedalPoints, MythicMedalCount=excluded.MythicMedalCount, ObjectiveTimeSeconds=excluded.ObjectiveTimeSeconds, ObjectiveTeamContribution=excluded.ObjectiveTeamContribution, ObjectiveStatsJson=excluded.ObjectiveStatsJson, MedalsJson=excluded.MedalsJson
      `;
      const values = chunk.flatMap((player) => [
        player.MatchId,
        player.GuildId,
        player.QueueNumber,
        player.QueueChannelId,
        player.XboxXuid,
        player.DiscordUserId,
        player.GamertagSnapshot,
        player.TeamId,
        player.PresentAtBeginning,
        player.GameWon,
        player.RankInMatch,
        player.PersonalScore,
        player.Kills,
        player.Deaths,
        player.Assists,
        player.HeadshotKills,
        player.Kda,
        player.Accuracy,
        player.ShotsHit,
        player.ShotsFired,
        player.DamageDealt,
        player.DamageTaken,
        player.DamageRatio,
        player.AvgLifeSeconds,
        player.AvgDamagePerLife,
        player.MedalCount,
        player.MedalPoints,
        player.MythicMedalCount,
        player.ObjectiveTimeSeconds,
        player.ObjectiveTeamContribution,
        player.ObjectiveStatsJson,
        player.MedalsJson,
        player.CreatedAt,
      ]);
      const stmt = this.DB.prepare(query).bind(...values);
      statements.push(stmt);
    }

    await this.DB.batch(statements);
  }

  async upsertLeaderboardSeriesDataBatch({
    series,
    games,
    gamePlayers,
    seriesPlayers,
  }: {
    series: LeaderboardSeriesRow;
    games: LeaderboardGamesRow[];
    gamePlayers: LeaderboardGamePlayersRow[];
    seriesPlayers: LeaderboardSeriesPlayersRow[];
  }): Promise<void> {
    const existingGameCreatedAt = await this.getLeaderboardGameCreatedAtByMatchId(series.GuildId, series.QueueNumber);
    const existingGamePlayerCreatedAt = await this.getLeaderboardGamePlayerCreatedAtByKey(
      series.GuildId,
      series.QueueNumber,
    );
    const existingSeriesPlayerCreatedAt = await this.getLeaderboardSeriesPlayerCreatedAtByXuid(
      series.GuildId,
      series.QueueNumber,
    );
    const normalizedGames = games.map((game) => ({
      ...game,
      CreatedAt: existingGameCreatedAt.get(game.MatchId) ?? game.CreatedAt,
    }));
    const normalizedGamePlayers = gamePlayers.map((player) => ({
      ...player,
      CreatedAt: existingGamePlayerCreatedAt.get(`${player.MatchId}:${player.XboxXuid}`) ?? player.CreatedAt,
    }));
    const normalizedSeriesPlayers = seriesPlayers.map((player) => ({
      ...player,
      CreatedAt: existingSeriesPlayerCreatedAt.get(player.XboxXuid) ?? player.CreatedAt,
    }));
    const statementVariableLimit = Math.min(SQLITE_MAX_VARIABLES, D1_SAFE_MAX_VARIABLES_PER_STATEMENT);

    const statements: D1PreparedStatement[] = [];
    const upsertSeriesStmt = this.DB.prepare(
      `
      INSERT INTO LeaderboardSeries (GuildId, QueueNumber, QueueChannelId, ResultsChannelId, StartedAt, CompletedAt, WinnerTeamIndex, SeriesScore, Source, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(GuildId, QueueNumber) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, ResultsChannelId=excluded.ResultsChannelId, StartedAt=excluded.StartedAt, CompletedAt=excluded.CompletedAt, WinnerTeamIndex=excluded.WinnerTeamIndex, SeriesScore=excluded.SeriesScore, Source=excluded.Source, UpdatedAt=excluded.UpdatedAt
      `,
    ).bind(
      series.GuildId,
      series.QueueNumber,
      series.QueueChannelId,
      series.ResultsChannelId,
      series.StartedAt,
      series.CompletedAt,
      series.WinnerTeamIndex,
      series.SeriesScore,
      series.Source,
      series.CreatedAt,
      series.UpdatedAt,
    );
    statements.push(upsertSeriesStmt);

    const deleteSeriesPlayersStmt = this.DB.prepare(
      "DELETE FROM LeaderboardSeriesPlayers WHERE GuildId = ? AND QueueNumber = ?",
    ).bind(series.GuildId, series.QueueNumber);
    statements.push(deleteSeriesPlayersStmt);

    const deleteGamesStmt = this.DB.prepare("DELETE FROM LeaderboardGames WHERE GuildId = ? AND QueueNumber = ?").bind(
      series.GuildId,
      series.QueueNumber,
    );
    statements.push(deleteGamesStmt);

    if (normalizedGames.length > 0) {
      const variablesPerRow = 15;
      const maxRowsPerStatement = Math.max(1, Math.floor(statementVariableLimit / variablesPerRow));

      for (let start = 0; start < normalizedGames.length; start += maxRowsPerStatement) {
        const chunk = normalizedGames.slice(start, start + maxRowsPerStatement);
        const gamesPlaceholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
        const upsertGamesStmt = this.DB.prepare(
          `
      INSERT INTO LeaderboardGames (MatchId, GuildId, QueueNumber, QueueChannelId, GameIndexInSeries, GameVariantCategory, ModeName, MapName, MapAssetId, MapVersionId, Team0Score, Team1Score, StartedAt, EndedAt, CreatedAt)
      VALUES ${gamesPlaceholders}
      ON CONFLICT(GuildId, QueueNumber, MatchId) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, GameIndexInSeries=excluded.GameIndexInSeries, GameVariantCategory=excluded.GameVariantCategory, ModeName=excluded.ModeName, MapName=excluded.MapName, MapAssetId=excluded.MapAssetId, MapVersionId=excluded.MapVersionId, Team0Score=excluded.Team0Score, Team1Score=excluded.Team1Score, StartedAt=excluded.StartedAt, EndedAt=excluded.EndedAt
    `,
        ).bind(
          ...chunk.flatMap((game) => [
            game.MatchId,
            game.GuildId,
            game.QueueNumber,
            game.QueueChannelId,
            game.GameIndexInSeries,
            game.GameVariantCategory,
            game.ModeName,
            game.MapName,
            game.MapAssetId,
            game.MapVersionId,
            game.Team0Score,
            game.Team1Score,
            game.StartedAt,
            game.EndedAt,
            game.CreatedAt,
          ]),
        );
        statements.push(upsertGamesStmt);
      }
    }

    if (normalizedGamePlayers.length > 0) {
      const variablesPerRow = 33;
      const maxRowsPerStatement = Math.max(1, Math.floor(statementVariableLimit / variablesPerRow));

      for (let start = 0; start < normalizedGamePlayers.length; start += maxRowsPerStatement) {
        const chunk = normalizedGamePlayers.slice(start, start + maxRowsPerStatement);
        const rowPlaceholders = `(${Array.from({ length: variablesPerRow }, () => "?").join(", ")})`;
        const placeholders = chunk.map(() => rowPlaceholders).join(",");
        const stmt = this.DB.prepare(
          `
        INSERT INTO LeaderboardGamePlayers (MatchId, GuildId, QueueNumber, QueueChannelId, XboxXuid, DiscordUserId, GamertagSnapshot, TeamId, PresentAtBeginning, GameWon, RankInMatch, PersonalScore, Kills, Deaths, Assists, HeadshotKills, Kda, Accuracy, ShotsHit, ShotsFired, DamageDealt, DamageTaken, DamageRatio, AvgLifeSeconds, AvgDamagePerLife, MedalCount, MedalPoints, MythicMedalCount, ObjectiveTimeSeconds, ObjectiveTeamContribution, ObjectiveStatsJson, MedalsJson, CreatedAt)
        VALUES ${placeholders}
        ON CONFLICT(GuildId, QueueNumber, MatchId, XboxXuid) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, DiscordUserId=excluded.DiscordUserId, GamertagSnapshot=excluded.GamertagSnapshot, TeamId=excluded.TeamId, PresentAtBeginning=excluded.PresentAtBeginning, GameWon=excluded.GameWon, RankInMatch=excluded.RankInMatch, PersonalScore=excluded.PersonalScore, Kills=excluded.Kills, Deaths=excluded.Deaths, Assists=excluded.Assists, HeadshotKills=excluded.HeadshotKills, Kda=excluded.Kda, Accuracy=excluded.Accuracy, ShotsHit=excluded.ShotsHit, ShotsFired=excluded.ShotsFired, DamageDealt=excluded.DamageDealt, DamageTaken=excluded.DamageTaken, DamageRatio=excluded.DamageRatio, AvgLifeSeconds=excluded.AvgLifeSeconds, AvgDamagePerLife=excluded.AvgDamagePerLife, MedalCount=excluded.MedalCount, MedalPoints=excluded.MedalPoints, MythicMedalCount=excluded.MythicMedalCount, ObjectiveTimeSeconds=excluded.ObjectiveTimeSeconds, ObjectiveTeamContribution=excluded.ObjectiveTeamContribution, ObjectiveStatsJson=excluded.ObjectiveStatsJson, MedalsJson=excluded.MedalsJson
      `,
        ).bind(
          ...chunk.flatMap((player) => [
            player.MatchId,
            player.GuildId,
            player.QueueNumber,
            player.QueueChannelId,
            player.XboxXuid,
            player.DiscordUserId,
            player.GamertagSnapshot,
            player.TeamId,
            player.PresentAtBeginning,
            player.GameWon,
            player.RankInMatch,
            player.PersonalScore,
            player.Kills,
            player.Deaths,
            player.Assists,
            player.HeadshotKills,
            player.Kda,
            player.Accuracy,
            player.ShotsHit,
            player.ShotsFired,
            player.DamageDealt,
            player.DamageTaken,
            player.DamageRatio,
            player.AvgLifeSeconds,
            player.AvgDamagePerLife,
            player.MedalCount,
            player.MedalPoints,
            player.MythicMedalCount,
            player.ObjectiveTimeSeconds,
            player.ObjectiveTeamContribution,
            player.ObjectiveStatsJson,
            player.MedalsJson,
            player.CreatedAt,
          ]),
        );
        statements.push(stmt);
      }
    }

    if (normalizedSeriesPlayers.length > 0) {
      const variablesPerRow = 13;
      const maxRowsPerStatement = Math.max(1, Math.floor(statementVariableLimit / variablesPerRow));

      for (let start = 0; start < normalizedSeriesPlayers.length; start += maxRowsPerStatement) {
        const chunk = normalizedSeriesPlayers.slice(start, start + maxRowsPerStatement);
        const seriesPlayersPlaceholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
        const upsertSeriesPlayersStmt = this.DB.prepare(
          `
      INSERT INTO LeaderboardSeriesPlayers (GuildId, QueueNumber, QueueChannelId, XboxXuid, DiscordUserId, GamertagSnapshot, TeamId, PresentAtBeginningCount, SubstituteInCount, SubstituteOutCount, GamesPlayedCount, SeriesWon, CreatedAt)
      VALUES ${seriesPlayersPlaceholders}
      ON CONFLICT(GuildId, QueueNumber, XboxXuid) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, DiscordUserId=excluded.DiscordUserId, GamertagSnapshot=excluded.GamertagSnapshot, TeamId=excluded.TeamId, PresentAtBeginningCount=excluded.PresentAtBeginningCount, SubstituteInCount=excluded.SubstituteInCount, SubstituteOutCount=excluded.SubstituteOutCount, GamesPlayedCount=excluded.GamesPlayedCount, SeriesWon=excluded.SeriesWon
    `,
        ).bind(
          ...chunk.flatMap((player) => [
            player.GuildId,
            player.QueueNumber,
            player.QueueChannelId,
            player.XboxXuid,
            player.DiscordUserId,
            player.GamertagSnapshot,
            player.TeamId,
            player.PresentAtBeginningCount,
            player.SubstituteInCount,
            player.SubstituteOutCount,
            player.GamesPlayedCount,
            player.SeriesWon,
            player.CreatedAt,
          ]),
        );
        statements.push(upsertSeriesPlayersStmt);
      }
    }

    await this.DB.batch(statements);
  }

  private async getLeaderboardGameCreatedAtByMatchId(
    guildId: string,
    queueNumber: number,
  ): Promise<Map<string, number>> {
    const stmt = this.DB.prepare(
      "SELECT MatchId, CreatedAt FROM LeaderboardGames WHERE GuildId = ? AND QueueNumber = ?",
    ).bind(guildId, queueNumber);
    const response = await stmt.all<{ MatchId: string; CreatedAt: number }>();
    const rows = response.results;
    return new Map(rows.map((row) => [row.MatchId, row.CreatedAt]));
  }

  private async getLeaderboardGamePlayerCreatedAtByKey(
    guildId: string,
    queueNumber: number,
  ): Promise<Map<string, number>> {
    const stmt = this.DB.prepare(
      "SELECT MatchId, XboxXuid, CreatedAt FROM LeaderboardGamePlayers WHERE GuildId = ? AND QueueNumber = ?",
    ).bind(guildId, queueNumber);
    const response = await stmt.all<{ MatchId: string; XboxXuid: string; CreatedAt: number }>();
    const rows = response.results;
    return new Map(rows.map((row) => [`${row.MatchId}:${row.XboxXuid}`, row.CreatedAt]));
  }

  private async getLeaderboardSeriesPlayerCreatedAtByXuid(
    guildId: string,
    queueNumber: number,
  ): Promise<Map<string, number>> {
    const stmt = this.DB.prepare(
      "SELECT XboxXuid, CreatedAt FROM LeaderboardSeriesPlayers WHERE GuildId = ? AND QueueNumber = ?",
    ).bind(guildId, queueNumber);
    const response = await stmt.all<{ XboxXuid: string; CreatedAt: number }>();
    const rows = response.results;
    return new Map(rows.map((row) => [row.XboxXuid, row.CreatedAt]));
  }

  async deleteLeaderboardDataForGuild(guildId: string): Promise<void> {
    const query = "DELETE FROM LeaderboardSeries WHERE GuildId = ?";
    const stmt = this.DB.prepare(query).bind(guildId);
    await stmt.run();
  }

  async deleteLeaderboardDataForQueueChannel(guildId: string, queueChannelId: string): Promise<void> {
    const query = "DELETE FROM LeaderboardSeries WHERE GuildId = ? AND QueueChannelId = ?";
    const stmt = this.DB.prepare(query).bind(guildId, queueChannelId);
    await stmt.run();
  }

  async deleteLeaderboardSeriesByQueueNumber(guildId: string, queueNumber: number): Promise<void> {
    const query = "DELETE FROM LeaderboardSeries WHERE GuildId = ? AND QueueNumber = ?";
    const stmt = this.DB.prepare(query).bind(guildId, queueNumber);
    await stmt.run();
  }

  async deleteExpiredLeaderboardData({
    leaderboardRetentionBoundary,
    orphanedKillMatrixRetentionBoundary,
  }: LeaderboardDataRetentionOpts): Promise<void> {
    const deleteExpiredKillMatricesStmt = this.DB.prepare(
      `DELETE FROM MatchKillMatrix
       WHERE MatchId IN (
         SELECT games.MatchId
         FROM LeaderboardGames AS games
         INNER JOIN LeaderboardSeries AS series
           ON series.GuildId = games.GuildId
           AND series.QueueNumber = games.QueueNumber
         GROUP BY games.MatchId
         HAVING MAX(series.CompletedAt) < ?
       )`,
    ).bind(leaderboardRetentionBoundary);
    const deleteExpiredLeaderboardSeriesStmt = this.DB.prepare(
      "DELETE FROM LeaderboardSeries WHERE CompletedAt < ?",
    ).bind(leaderboardRetentionBoundary);
    const deleteExpiredOrphanedKillMatricesStmt = this.DB.prepare(
      `DELETE FROM MatchKillMatrix
       WHERE CreatedAt < ?
         AND NOT EXISTS (
           SELECT 1
           FROM LeaderboardGames
           WHERE LeaderboardGames.MatchId = MatchKillMatrix.MatchId
         )`,
    ).bind(orphanedKillMatrixRetentionBoundary);
    await this.DB.batch([
      deleteExpiredKillMatricesStmt,
      deleteExpiredLeaderboardSeriesStmt,
      deleteExpiredOrphanedKillMatricesStmt,
    ]);
  }

  async getLeaderboardSeriesByQueueNumber(guildId: string, queueNumber: number): Promise<LeaderboardSeriesRow | null> {
    const query = "SELECT * FROM LeaderboardSeries WHERE GuildId = ? AND QueueNumber = ?";
    const stmt = this.DB.prepare(query).bind(guildId, queueNumber);
    return await stmt.first<LeaderboardSeriesRow>();
  }

  async getLeaderboardSeriesWinRateRankings({
    guildId,
    queueChannelId,
    startEpochSeconds,
    minGamesPlayed,
    limit,
    offset,
  }: LeaderboardRankingsQuery): Promise<{ total: number; rows: LeaderboardRankingRow[] }> {
    const aggregateSql = `
      SELECT
        stats.XboxXuid AS XboxXuid,
        identity.DiscordUserId AS DiscordUserId,
        identity.GamertagSnapshot AS Gamertag,
        stats.SeriesPlayed AS SeriesPlayed,
        stats.SeriesWins AS SeriesWins,
        stats.GamesPlayed AS GamesPlayed,
        CAST(stats.SeriesWins AS REAL) / stats.SeriesPlayed AS MetricValue
      FROM (
        SELECT
          sp.XboxXuid AS XboxXuid,
          COUNT(*) AS SeriesPlayed,
          SUM(sp.SeriesWon) AS SeriesWins,
          SUM(sp.GamesPlayedCount) AS GamesPlayed
        FROM LeaderboardSeriesPlayers sp
        INNER JOIN LeaderboardSeries s
          ON s.GuildId = sp.GuildId
          AND s.QueueNumber = sp.QueueNumber
        WHERE s.GuildId = ?
          AND s.CompletedAt >= ?
          AND (? IS NULL OR s.QueueChannelId = ?)
        GROUP BY sp.XboxXuid
        HAVING SUM(sp.GamesPlayedCount) >= ?
      ) stats
      INNER JOIN (
        SELECT ranked.XboxXuid, ranked.DiscordUserId, ranked.GamertagSnapshot
        FROM (
          SELECT
            sp.XboxXuid AS XboxXuid,
            sp.DiscordUserId AS DiscordUserId,
            sp.GamertagSnapshot AS GamertagSnapshot,
            ROW_NUMBER() OVER (
              PARTITION BY sp.XboxXuid
              ORDER BY s.CompletedAt DESC, sp.CreatedAt DESC
            ) AS RowNumber
          FROM LeaderboardSeriesPlayers sp
          INNER JOIN LeaderboardSeries s
            ON s.GuildId = sp.GuildId
            AND s.QueueNumber = sp.QueueNumber
          WHERE s.GuildId = ?
            AND s.CompletedAt >= ?
            AND (? IS NULL OR s.QueueChannelId = ?)
        ) ranked
        WHERE ranked.RowNumber = 1
      ) identity
        ON identity.XboxXuid = stats.XboxXuid
    `;

    const bindings = [
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      minGamesPlayed,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
    ] as const;

    const countStmt = this.DB.prepare(`SELECT COUNT(*) AS Total FROM (${aggregateSql}) agg`).bind(...bindings);
    const countRow = await countStmt.first<{ Total: number }>();

    const rowsStmt = this.DB.prepare(
      `
        SELECT * FROM (${aggregateSql}) agg
        ORDER BY agg.MetricValue DESC, agg.SeriesWins DESC, agg.GamesPlayed DESC, agg.Gamertag ASC
        LIMIT ? OFFSET ?
      `,
    ).bind(...bindings, limit, offset);
    const rowsResponse = await rowsStmt.all<LeaderboardRankingRow>();

    return {
      total: countRow?.Total ?? 0,
      rows: rowsResponse.results,
    };
  }

  async getLeaderboardStatMetricRankings({
    guildId,
    queueChannelId,
    startEpochSeconds,
    minGamesPlayed,
    limit,
    offset,
    metric,
  }: LeaderboardRankingsQuery & {
    metric: Exclude<
      LeaderboardMetric,
      | LeaderboardMetric.SeriesPlayed
      | LeaderboardMetric.SeriesWins
      | LeaderboardMetric.SeriesWinRate
      | LeaderboardMetric.GamesPlayed
      | LeaderboardMetric.GameWins
      | LeaderboardMetric.GamesWinRate
    >;
  }): Promise<{
    total: number;
    rows: LeaderboardRankingRow[];
  }> {
    let metricSql: string;
    let metricBindings: readonly (string | number | null)[] = [];
    let metricGamesPlayedSql = "COUNT(*)";
    let metricMinGamesPlayed = minGamesPlayed;
    let objectiveGamesPlayedSql = "COUNT(gp.ObjectiveTimeSeconds)";

    if (isObjectiveLeaderboardMetric(metric)) {
      const descriptor = getLeaderboardObjectiveDescriptorByMetric(metric);
      const categoryGamesSql = getObjectiveCategoryGamesSql(descriptor.category);
      const statValueSql = getObjectiveStatValueSql(descriptor);

      metricSql =
        metric === descriptor.averageMetric
          ? `CASE WHEN ${categoryGamesSql} = 0 THEN 0 ELSE CAST(SUM(${statValueSql}) AS REAL) / ${categoryGamesSql} END`
          : `SUM(${statValueSql})`;
      metricGamesPlayedSql = categoryGamesSql;
      objectiveGamesPlayedSql = categoryGamesSql;
      metricMinGamesPlayed = Math.max(minGamesPlayed, 1);
    } else {
      switch (metric) {
        case LeaderboardMetric.Kills: {
          metricSql = "SUM(gp.Kills)";
          break;
        }
        case LeaderboardMetric.Deaths: {
          metricSql = "SUM(gp.Deaths)";
          break;
        }
        case LeaderboardMetric.Assists: {
          metricSql = "SUM(gp.Assists)";
          break;
        }
        case LeaderboardMetric.HeadshotKills: {
          metricSql = "SUM(gp.HeadshotKills)";
          break;
        }
        case LeaderboardMetric.ShotsHit: {
          metricSql = "SUM(gp.ShotsHit)";
          break;
        }
        case LeaderboardMetric.ShotsFired: {
          metricSql = "SUM(gp.ShotsFired)";
          break;
        }
        case LeaderboardMetric.Kda: {
          metricSql = "AVG(gp.Kda)";
          break;
        }
        case LeaderboardMetric.Accuracy: {
          metricSql = "AVG(gp.Accuracy)";
          break;
        }
        case LeaderboardMetric.DamageDealt: {
          metricSql = "SUM(gp.DamageDealt)";
          break;
        }
        case LeaderboardMetric.DamageTaken: {
          metricSql = "SUM(gp.DamageTaken)";
          break;
        }
        case LeaderboardMetric.DamageRatio: {
          metricSql = DAMAGE_RATIO_SQL;
          break;
        }
        case LeaderboardMetric.AvgLifeSeconds: {
          metricSql = "AVG(gp.AvgLifeSeconds)";
          break;
        }
        case LeaderboardMetric.AvgDamagePerLife: {
          metricSql = "AVG(gp.AvgDamagePerLife)";
          break;
        }
        case LeaderboardMetric.PersonalScore: {
          metricSql = "SUM(gp.PersonalScore)";
          break;
        }
        case LeaderboardMetric.MedalPoints: {
          metricSql = "SUM(gp.MedalPoints)";
          break;
        }
        case LeaderboardMetric.AvgMedalPointsPerSeries: {
          metricSql = getPerSeriesAverageSql("MedalPoints", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgMedalPointsPerGame: {
          metricSql = "AVG(gp.MedalPoints)";
          break;
        }
        case LeaderboardMetric.MythicMedals: {
          metricSql = "SUM(gp.MythicMedalCount)";
          break;
        }
        case LeaderboardMetric.AvgMythicMedalsPerSeries: {
          metricSql = getPerSeriesAverageSql("MythicMedalCount", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgMythicMedalsPerGame: {
          metricSql = "AVG(gp.MythicMedalCount)";
          break;
        }
        case LeaderboardMetric.ObjectiveTime: {
          metricSql = "SUM(gp.ObjectiveTimeSeconds)";
          metricGamesPlayedSql = "COUNT(gp.ObjectiveTimeSeconds)";
          metricMinGamesPlayed = Math.max(minGamesPlayed, 1);
          break;
        }
        case LeaderboardMetric.AvgObjectiveTimePerGame: {
          metricSql = "AVG(gp.ObjectiveTimeSeconds)";
          metricGamesPlayedSql = "COUNT(gp.ObjectiveTimeSeconds)";
          metricMinGamesPlayed = Math.max(minGamesPlayed, 1);
          break;
        }
        case LeaderboardMetric.ObjectiveTeamContribution: {
          metricSql = "AVG(gp.ObjectiveTeamContribution)";
          metricGamesPlayedSql = "COUNT(gp.ObjectiveTeamContribution)";
          objectiveGamesPlayedSql = "COUNT(gp.ObjectiveTeamContribution)";
          metricMinGamesPlayed = Math.max(minGamesPlayed, 1);
          break;
        }
        case LeaderboardMetric.AvgPersonalScorePerSeries: {
          metricSql = getPerSeriesAverageSql("PersonalScore", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgPersonalScorePerGame: {
          metricSql = "AVG(gp.PersonalScore)";
          break;
        }
        case LeaderboardMetric.AvgKillsPerSeries: {
          metricSql = getPerSeriesAverageSql("Kills", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgKillsPerGame: {
          metricSql = "AVG(gp.Kills)";
          break;
        }
        case LeaderboardMetric.AvgDeathsPerSeries: {
          metricSql = getPerSeriesAverageSql("Deaths", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgDeathsPerGame: {
          metricSql = "AVG(gp.Deaths)";
          break;
        }
        case LeaderboardMetric.AvgAssistsPerSeries: {
          metricSql = getPerSeriesAverageSql("Assists", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgAssistsPerGame: {
          metricSql = "AVG(gp.Assists)";
          break;
        }
        case LeaderboardMetric.AvgHeadshotKillsPerSeries: {
          metricSql = getPerSeriesAverageSql("HeadshotKills", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgHeadshotKillsPerGame: {
          metricSql = "AVG(gp.HeadshotKills)";
          break;
        }
        case LeaderboardMetric.AvgShotsHitPerSeries: {
          metricSql = getPerSeriesAverageSql("ShotsHit", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgShotsHitPerGame: {
          metricSql = "AVG(gp.ShotsHit)";
          break;
        }
        case LeaderboardMetric.AvgShotsFiredPerSeries: {
          metricSql = getPerSeriesAverageSql("ShotsFired", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgShotsFiredPerGame: {
          metricSql = "AVG(gp.ShotsFired)";
          break;
        }
        case LeaderboardMetric.AvgDamageDealtPerSeries: {
          metricSql = getPerSeriesAverageSql("DamageDealt", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgDamageDealtPerGame: {
          metricSql = "AVG(gp.DamageDealt)";
          break;
        }
        case LeaderboardMetric.AvgDamageTakenPerSeries: {
          metricSql = getPerSeriesAverageSql("DamageTaken", "gp");
          metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
          break;
        }
        case LeaderboardMetric.AvgDamageTakenPerGame: {
          metricSql = "AVG(gp.DamageTaken)";
          break;
        }
        default: {
          throw new UnreachableError(metric);
        }
      }
    }

    const aggregateSql = `
      SELECT
        stats.XboxXuid AS XboxXuid,
        identity.DiscordUserId AS DiscordUserId,
        identity.GamertagSnapshot AS Gamertag,
        COALESCE(seriesStats.SeriesPlayed, stats.SeriesPlayed) AS SeriesPlayed,
        COALESCE(seriesStats.SeriesWins, 0) AS SeriesWins,
        stats.GamesPlayed AS GamesPlayed,
        stats.GameWins AS GameWins,
        stats.MedalCount AS MedalCount,
        stats.ObjectiveGamesPlayed AS ObjectiveGamesPlayed,
        stats.ObjectiveTimeSeconds AS ObjectiveTimeSeconds,
        stats.MetricValue AS MetricValue
      FROM (
        SELECT
          gp.XboxXuid AS XboxXuid,
          COUNT(DISTINCT gp.QueueNumber) AS SeriesPlayed,
          COUNT(*) AS GamesPlayed,
          SUM(gp.GameWon) AS GameWins,
          SUM(gp.MedalCount) AS MedalCount,
          ${objectiveGamesPlayedSql} AS ObjectiveGamesPlayed,
          SUM(COALESCE(gp.ObjectiveTimeSeconds, 0)) AS ObjectiveTimeSeconds,
          ${metricSql} AS MetricValue
        FROM LeaderboardGamePlayers gp
        INNER JOIN LeaderboardGames g
          ON g.GuildId = gp.GuildId
          AND g.QueueNumber = gp.QueueNumber
          AND g.MatchId = gp.MatchId
        WHERE gp.GuildId = ?
          AND g.EndedAt >= ?
          AND (? IS NULL OR gp.QueueChannelId = ?)
        GROUP BY gp.XboxXuid
        HAVING ${metricGamesPlayedSql} >= ?
      ) stats
      LEFT JOIN (
        SELECT
          sp.XboxXuid AS XboxXuid,
          COUNT(*) AS SeriesPlayed,
          SUM(sp.SeriesWon) AS SeriesWins
        FROM LeaderboardSeriesPlayers sp
        INNER JOIN LeaderboardSeries s
          ON s.GuildId = sp.GuildId
          AND s.QueueNumber = sp.QueueNumber
        WHERE s.GuildId = ?
          AND s.CompletedAt >= ?
          AND (? IS NULL OR s.QueueChannelId = ?)
        GROUP BY sp.XboxXuid
      ) seriesStats
        ON seriesStats.XboxXuid = stats.XboxXuid
      INNER JOIN (
        SELECT ranked.XboxXuid, ranked.DiscordUserId, ranked.GamertagSnapshot
        FROM (
          SELECT
            gp.XboxXuid AS XboxXuid,
            gp.DiscordUserId AS DiscordUserId,
            gp.GamertagSnapshot AS GamertagSnapshot,
            ROW_NUMBER() OVER (
              PARTITION BY gp.XboxXuid
              ORDER BY g.EndedAt DESC, gp.CreatedAt DESC
            ) AS RowNumber
          FROM LeaderboardGamePlayers gp
          INNER JOIN LeaderboardGames g
            ON g.GuildId = gp.GuildId
            AND g.QueueNumber = gp.QueueNumber
            AND g.MatchId = gp.MatchId
          WHERE gp.GuildId = ?
            AND g.EndedAt >= ?
            AND (? IS NULL OR gp.QueueChannelId = ?)
        ) ranked
        WHERE ranked.RowNumber = 1
      ) identity
        ON identity.XboxXuid = stats.XboxXuid
    `;

    const bindings = [
      ...metricBindings,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      metricMinGamesPlayed,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
    ] as const;

    const countStmt = this.DB.prepare(`SELECT COUNT(*) AS Total FROM (${aggregateSql}) agg`).bind(...bindings);
    const countRow = await countStmt.first<{ Total: number }>();

    const metricSortDirection = isAscendingMetric(metric) ? "ASC" : "DESC";
    const rowsStmt = this.DB.prepare(
      `
        SELECT * FROM (${aggregateSql}) agg
        ORDER BY agg.MetricValue ${metricSortDirection}, agg.GamesPlayed DESC, agg.Gamertag ASC
        LIMIT ? OFFSET ?
      `,
    ).bind(...bindings, limit, offset);
    const rowsResponse = await rowsStmt.all<LeaderboardRankingRow>();

    return {
      total: countRow?.Total ?? 0,
      rows: rowsResponse.results,
    };
  }

  async getLeaderboardPlayerStats({
    guildId,
    xboxXuid,
    queueChannelId,
    queueChannelIds,
    startEpochSeconds,
  }: {
    guildId: string;
    xboxXuid: string;
    queueChannelId: string | null;
    queueChannelIds?: string[];
    startEpochSeconds: number;
  }): Promise<LeaderboardPlayerStatsRow | null> {
    if (queueChannelIds?.length === 0) {
      return null;
    }

    const ctf = GameVariantCategory.MultiplayerCtf;
    const strongholds = GameVariantCategory.MultiplayerStrongholds;
    const koth = GameVariantCategory.MultiplayerKingOfTheHill;
    const oddball = GameVariantCategory.MultiplayerOddball;
    const queueFilter = getQueueFilterSql("gp", queueChannelIds);
    const seriesQueueFilter = getQueueFilterSql("sp", queueChannelIds);
    const identityQueueFilter = queueFilter;
    const query = `
      WITH gameStats AS (
        SELECT
          gp.XboxXuid AS XboxXuid,
          COUNT(*) AS GamesPlayed,
          SUM(gp.GameWon) AS GameWins,
          SUM(gp.PersonalScore) AS PersonalScore,
          AVG(gp.PersonalScore) AS AvgPersonalScorePerGame,
          SUM(gp.Kills) AS Kills,
          AVG(gp.Kills) AS AvgKillsPerGame,
          SUM(gp.Deaths) AS Deaths,
          AVG(gp.Deaths) AS AvgDeathsPerGame,
          SUM(gp.Assists) AS Assists,
          AVG(gp.Assists) AS AvgAssistsPerGame,
          SUM(gp.HeadshotKills) AS HeadshotKills,
          AVG(gp.HeadshotKills) AS AvgHeadshotKillsPerGame,
          SUM(gp.ShotsHit) AS ShotsHit,
          AVG(gp.ShotsHit) AS AvgShotsHitPerGame,
          SUM(gp.ShotsFired) AS ShotsFired,
          AVG(gp.ShotsFired) AS AvgShotsFiredPerGame,
          SUM(gp.DamageDealt) AS DamageDealt,
          AVG(gp.DamageDealt) AS AvgDamageDealtPerGame,
          SUM(gp.DamageTaken) AS DamageTaken,
          AVG(gp.DamageTaken) AS AvgDamageTakenPerGame,
          AVG(gp.Kda) AS Kda,
          AVG(gp.Accuracy) AS Accuracy,
          ${DAMAGE_RATIO_SQL} AS DamageRatio,
          AVG(gp.AvgLifeSeconds) AS AvgLifeSeconds,
          AVG(gp.AvgDamagePerLife) AS AvgDamagePerLife,
          SUM(gp.MedalCount) AS MedalCount,
          SUM(gp.MedalPoints) AS MedalPoints,
          SUM(gp.MythicMedalCount) AS MythicMedalCount,
          COUNT(gp.ObjectiveTimeSeconds) AS ObjectiveGamesPlayed,
          SUM(COALESCE(gp.ObjectiveTimeSeconds, 0)) AS ObjectiveTimeSeconds,
          COALESCE(AVG(gp.ObjectiveTimeSeconds), 0) AS AvgObjectiveTimeSeconds,
          COALESCE(AVG(gp.ObjectiveTeamContribution), 0) AS ObjectiveTeamContribution,
          COUNT(gp.ObjectiveTeamContribution) AS ObjectiveTeamContributionGamesPlayed,
          SUM(CASE WHEN g.GameVariantCategory = ${ctf.toString()} THEN 1 ELSE 0 END) AS CtfGamesPlayed,
          SUM(CASE WHEN g.GameVariantCategory = ${strongholds.toString()} THEN 1 ELSE 0 END) AS StrongholdGamesPlayed,
          SUM(CASE WHEN g.GameVariantCategory = ${koth.toString()} THEN 1 ELSE 0 END) AS HillGamesPlayed,
          SUM(CASE WHEN g.GameVariantCategory = ${oddball.toString()} THEN 1 ELSE 0 END) AS BallGamesPlayed,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.FlagCaptures")} AS FlagCaptures,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.FlagCaptureAssists")} AS FlagCaptureAssists,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.FlagGrabs")} AS FlagGrabs,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.FlagReturns")} AS FlagReturns,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.FlagSecures")} AS FlagSecures,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.FlagSteals")} AS FlagSteals,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.FlagCarriersKilled")} AS FlagCarriersKilled,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.FlagReturnersKilled")} AS FlagReturnersKilled,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.KillsAsFlagCarrier")} AS FlagCarrierKills,
          ${getPlayerObjectiveSumSql(ctf, "CaptureTheFlagStats.KillsAsFlagReturner")} AS FlagReturnerKills,
          ${getPlayerObjectiveSumSql(strongholds, "ZonesStats.StrongholdCaptures")} AS StrongholdCaptures,
          ${getPlayerObjectiveSumSql(strongholds, "ZonesStats.StrongholdSecures")} AS StrongholdSecures,
          ${getPlayerObjectiveSumSql(strongholds, "ZonesStats.StrongholdOffensiveKills")} AS StrongholdOffensiveKills,
          ${getPlayerObjectiveSumSql(strongholds, "ZonesStats.StrongholdDefensiveKills")} AS StrongholdDefensiveKills,
          ${getPlayerObjectiveSumSql(koth, "ZonesStats.StrongholdScoringTicks")} AS HillScoringTicks,
          ${getPlayerObjectiveSumSql(koth, "ZonesStats.StrongholdOffensiveKills")} AS HillOffensiveKills,
          ${getPlayerObjectiveSumSql(koth, "ZonesStats.StrongholdDefensiveKills")} AS HillDefensiveKills,
          ${getPlayerObjectiveSumSql(oddball, "OddballStats.SkullScoringTicks")} AS BallScoringTicks,
          ${getPlayerObjectiveSumSql(oddball, "OddballStats.SkullGrabs")} AS BallGrabs,
          ${getPlayerObjectiveSumSql(oddball, "OddballStats.SkullCarriersKilled")} AS BallCarriersKilled,
          ${getPlayerObjectiveSumSql(oddball, "OddballStats.KillsAsSkullCarrier")} AS BallCarrierKills
        FROM LeaderboardGamePlayers gp
        INNER JOIN LeaderboardGames g
          ON g.GuildId = gp.GuildId AND g.QueueNumber = gp.QueueNumber AND g.MatchId = gp.MatchId
        WHERE gp.GuildId = ? AND gp.XboxXuid = ? AND g.EndedAt >= ?
          AND ${queueFilter}
        GROUP BY gp.XboxXuid
      ), seriesStats AS (
        SELECT COUNT(*) AS SeriesPlayed, COALESCE(SUM(sp.SeriesWon), 0) AS SeriesWins
        FROM LeaderboardSeriesPlayers sp
        INNER JOIN LeaderboardSeries s ON s.GuildId = sp.GuildId AND s.QueueNumber = sp.QueueNumber
        WHERE sp.GuildId = ? AND sp.XboxXuid = ? AND s.CompletedAt >= ?
          AND ${seriesQueueFilter}
      ), identity AS (
        SELECT gp.XboxXuid, gp.DiscordUserId, gp.GamertagSnapshot AS Gamertag
        FROM LeaderboardGamePlayers gp
        INNER JOIN LeaderboardGames g
          ON g.GuildId = gp.GuildId AND g.QueueNumber = gp.QueueNumber AND g.MatchId = gp.MatchId
        WHERE gp.GuildId = ? AND gp.XboxXuid = ? AND g.EndedAt >= ?
          AND ${identityQueueFilter}
        ORDER BY g.EndedAt DESC, gp.CreatedAt DESC
        LIMIT 1
      )
      SELECT identity.DiscordUserId, identity.Gamertag,
        seriesStats.SeriesPlayed, seriesStats.SeriesWins,
        gameStats.*
      FROM identity
      CROSS JOIN seriesStats
      INNER JOIN gameStats ON gameStats.XboxXuid = identity.XboxXuid
    `;
    const queueBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);
    const bindings = [
      guildId,
      xboxXuid,
      startEpochSeconds,
      ...queueBindings,
      guildId,
      xboxXuid,
      startEpochSeconds,
      ...queueBindings,
      guildId,
      xboxXuid,
      startEpochSeconds,
      ...queueBindings,
    ] as const;
    const stmt = this.DB.prepare(query).bind(...bindings);
    return await stmt.first<LeaderboardPlayerStatsRow>();
  }

  /**
   * Returns ranks for every requested metric using the same population and tie-break rules as the
   * corresponding leaderboard queries. A metric maps to null when the player does not meet that
   * metric's eligibility threshold; otherwise it maps to its rank and eligible-player total.
   */
  async getLeaderboardPlayerMetricRanks({
    guildId,
    queueChannelId,
    queueChannelIds,
    startEpochSeconds,
    minGamesPlayed,
    metrics,
    xboxXuid,
  }: {
    guildId: string;
    queueChannelId: string | null;
    queueChannelIds?: string[];
    startEpochSeconds: number;
    minGamesPlayed: number;
    metrics: readonly LeaderboardMetric[];
    xboxXuid: string;
  }): Promise<Map<LeaderboardMetric, LeaderboardPlayerMetricRank | null>> {
    if (queueChannelIds?.length === 0) {
      return new Map(metrics.map((metric) => [metric, null]));
    }

    const statMetrics = metrics.filter((metric) => !isOutcomeLeaderboardMetric(metric));
    const outcomeMetrics = metrics.filter((metric) => isOutcomeLeaderboardMetric(metric));

    const [statResults, outcomeResults] = await Promise.all([
      this.queryStatMetricRanks({
        guildId,
        queueChannelId,
        ...(queueChannelIds == null ? {} : { queueChannelIds }),
        startEpochSeconds,
        minGamesPlayed,
        metrics: statMetrics,
        xboxXuid,
      }),
      this.queryOutcomeMetricRanks({
        guildId,
        queueChannelId,
        ...(queueChannelIds == null ? {} : { queueChannelIds }),
        startEpochSeconds,
        minGamesPlayed,
        metrics: outcomeMetrics,
        xboxXuid,
      }),
    ]);

    return new Map(metrics.map((metric) => [metric, statResults.get(metric) ?? outcomeResults.get(metric) ?? null]));
  }

  async getLeaderboardPlayerRelationships({
    guildId,
    xboxXuid,
    queueChannelId,
    queueChannelIds,
    startEpochSeconds,
    metric,
  }: {
    guildId: string;
    xboxXuid: string;
    queueChannelId: string | null;
    queueChannelIds?: string[];
    startEpochSeconds: number;
    metric: LeaderboardPlayerRelationshipMetric;
  }): Promise<LeaderboardPlayerRelationshipRow[]> {
    if (queueChannelIds?.length === 0) {
      return [];
    }

    const pairConfig = getPairRelationshipMetricConfig(metric);
    const aggregate = getRelationshipAggregateSql(metric, {
      guildId,
      xboxXuid,
      queueChannelId,
      queueChannelIds,
      startEpochSeconds,
    });
    const minimumSharedCount = pairConfig?.value === "win-rate" ? (pairConfig.scope === "series" ? 3 : 5) : 1;
    const query = `
      SELECT XboxXuid, DiscordUserId, Gamertag, MetricValue, SharedCount, Wins, Perfects
      FROM (${aggregate.sql}) relationship
      WHERE SharedCount >= ?
      ORDER BY MetricValue DESC, SharedCount DESC, Gamertag COLLATE NOCASE ASC, XboxXuid ASC
      LIMIT 10
    `;
    const response = await this.DB.prepare(query)
      .bind(...aggregate.bindings, minimumSharedCount)
      .all<LeaderboardPlayerRelationshipRow>();
    return response.results;
  }

  async getLeaderboardPlayerPairRelationship({
    guildId,
    xboxXuid1,
    xboxXuid2,
    queueChannelId,
    queueChannelIds,
    startEpochSeconds,
  }: {
    guildId: string;
    xboxXuid1: string;
    xboxXuid2: string;
    queueChannelId: string | null;
    queueChannelIds?: string[];
    startEpochSeconds: number;
  }): Promise<LeaderboardPlayerPairRelationshipRow> {
    const emptyRow: LeaderboardPlayerPairRelationshipRow = {
      SeriesPlayedWith: 0,
      Player1SeriesWinsWith: 0,
      SeriesPlayedAgainst: 0,
      Player1SeriesWinsAgainst: 0,
      Player2SeriesWinsAgainst: 0,
      GamesPlayedWith: 0,
      Player1GameWinsWith: 0,
      GamesPlayedAgainst: 0,
      Player1GameWinsAgainst: 0,
      Player2GameWinsAgainst: 0,
      HeadToHeadGamesPlayed: 0,
      Player1Kills: 0,
      Player1Perfects: 0,
      Player2Kills: 0,
      Player2Perfects: 0,
    };
    if (queueChannelIds?.length === 0) {
      return emptyRow;
    }

    const params = { guildId, xboxXuid1, xboxXuid2, queueChannelId, queueChannelIds, startEpochSeconds };
    const seriesAggregate = getPairSeriesRelationshipAggregateSql(params);
    const gameAggregate = getPairGameRelationshipAggregateSql(params);
    const headToHeadAggregate = getPairHeadToHeadAggregateSql(params);

    const [seriesRow, gameRow, headToHeadRow] = await Promise.all([
      this.DB.prepare(seriesAggregate.sql)
        .bind(...seriesAggregate.bindings)
        .first<
          Pick<
            LeaderboardPlayerPairRelationshipRow,
            | "SeriesPlayedWith"
            | "Player1SeriesWinsWith"
            | "SeriesPlayedAgainst"
            | "Player1SeriesWinsAgainst"
            | "Player2SeriesWinsAgainst"
          >
        >(),
      this.DB.prepare(gameAggregate.sql)
        .bind(...gameAggregate.bindings)
        .first<
          Pick<
            LeaderboardPlayerPairRelationshipRow,
            | "GamesPlayedWith"
            | "Player1GameWinsWith"
            | "GamesPlayedAgainst"
            | "Player1GameWinsAgainst"
            | "Player2GameWinsAgainst"
          >
        >(),
      this.DB.prepare(headToHeadAggregate.sql)
        .bind(...headToHeadAggregate.bindings)
        .first<
          Pick<
            LeaderboardPlayerPairRelationshipRow,
            "HeadToHeadGamesPlayed" | "Player1Kills" | "Player1Perfects" | "Player2Kills" | "Player2Perfects"
          >
        >(),
    ]);

    return {
      SeriesPlayedWith: seriesRow?.SeriesPlayedWith ?? 0,
      Player1SeriesWinsWith: seriesRow?.Player1SeriesWinsWith ?? 0,
      SeriesPlayedAgainst: seriesRow?.SeriesPlayedAgainst ?? 0,
      Player1SeriesWinsAgainst: seriesRow?.Player1SeriesWinsAgainst ?? 0,
      Player2SeriesWinsAgainst: seriesRow?.Player2SeriesWinsAgainst ?? 0,
      GamesPlayedWith: gameRow?.GamesPlayedWith ?? 0,
      Player1GameWinsWith: gameRow?.Player1GameWinsWith ?? 0,
      GamesPlayedAgainst: gameRow?.GamesPlayedAgainst ?? 0,
      Player1GameWinsAgainst: gameRow?.Player1GameWinsAgainst ?? 0,
      Player2GameWinsAgainst: gameRow?.Player2GameWinsAgainst ?? 0,
      HeadToHeadGamesPlayed: headToHeadRow?.HeadToHeadGamesPlayed ?? 0,
      Player1Kills: headToHeadRow?.Player1Kills ?? 0,
      Player1Perfects: headToHeadRow?.Player1Perfects ?? 0,
      Player2Kills: headToHeadRow?.Player2Kills ?? 0,
      Player2Perfects: headToHeadRow?.Player2Perfects ?? 0,
    };
  }

  /**
   * Ranks every requested stat metric (game-fact based, e.g. Kills, DamageDealt, objective metrics)
   * against bounded shared population scans. Each batch runs the underlying join/GROUP BY once,
   * avoiding per-metric queries while keeping D1's generated expression tree below its maximum
   * depth. The identity CTE keeps the leaderboard's Gamertag tie-break without repeating a
   * correlated lookup for each aggregated player.
   */
  private async queryStatMetricRanks({
    guildId,
    queueChannelId,
    queueChannelIds,
    startEpochSeconds,
    minGamesPlayed,
    metrics,
    xboxXuid,
  }: {
    guildId: string;
    queueChannelId: string | null;
    queueChannelIds?: string[];
    startEpochSeconds: number;
    minGamesPlayed: number;
    metrics: readonly LeaderboardMetric[];
    xboxXuid: string;
  }): Promise<Map<LeaderboardMetric, LeaderboardPlayerMetricRank | null>> {
    if (metrics.length === 0) {
      return new Map();
    }

    const batches: LeaderboardMetric[][] = [];
    for (let start = 0; start < metrics.length; start += MAX_RANK_METRICS_PER_QUERY) {
      batches.push(metrics.slice(start, start + MAX_RANK_METRICS_PER_QUERY));
    }

    const batchResults = await Promise.all(
      batches.map(async (batch) => {
        const batchRanks = await this.queryStatMetricRanksBatch({
          guildId,
          queueChannelId,
          ...(queueChannelIds == null ? {} : { queueChannelIds }),
          startEpochSeconds,
          minGamesPlayed,
          metrics: batch,
          xboxXuid,
        });
        return batchRanks;
      }),
    );
    const ranks = new Map<LeaderboardMetric, LeaderboardPlayerMetricRank | null>();
    for (const batchRanks of batchResults) {
      for (const [metric, rank] of batchRanks) {
        ranks.set(metric, rank);
      }
    }

    return ranks;
  }

  private async queryStatMetricRanksBatch({
    guildId,
    queueChannelId,
    queueChannelIds,
    startEpochSeconds,
    minGamesPlayed,
    metrics,
    xboxXuid,
  }: {
    guildId: string;
    queueChannelId: string | null;
    queueChannelIds?: string[];
    startEpochSeconds: number;
    minGamesPlayed: number;
    metrics: readonly LeaderboardMetric[];
    xboxXuid: string;
  }): Promise<Map<LeaderboardMetric, LeaderboardPlayerMetricRank | null>> {
    const parts = metrics.map((metric) => getStatMetricRankSqlParts(metric, minGamesPlayed));
    const queueFilterSql = getQueueFilterSql("gp", queueChannelIds);
    const queueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);

    const aggColumns = parts
      .map((part) => `${part.valueSql} AS Value_${part.metric}, ${part.gamesPlayedSql} AS Games_${part.metric}`)
      .join(",\n        ");
    const rankColumns = parts
      .map((part) => {
        const eligibleSql = `CASE WHEN agg.Games_${part.metric} >= ? THEN 1 ELSE 0 END`;
        return `
        CASE WHEN ${eligibleSql} THEN ROW_NUMBER() OVER (
          PARTITION BY ${eligibleSql}
          ORDER BY agg.Value_${part.metric} ${part.sortDirection}, agg.GamesPlayed DESC, identity.Gamertag ASC, agg.XboxXuid ASC
        ) ELSE NULL END AS Rank_${part.metric},
        SUM(${eligibleSql}) OVER () AS Total_${part.metric}`;
      })
      .join(",\n        ");

    const query = `
      WITH identityRanked AS (
        SELECT
          gp.XboxXuid AS XboxXuid,
          gp.GamertagSnapshot AS Gamertag,
          ROW_NUMBER() OVER (
            PARTITION BY gp.XboxXuid
            ORDER BY g.EndedAt DESC, gp.CreatedAt DESC
          ) AS RowNumber
        FROM LeaderboardGamePlayers gp
        INNER JOIN LeaderboardGames g
          ON g.GuildId = gp.GuildId
          AND g.QueueNumber = gp.QueueNumber
          AND g.MatchId = gp.MatchId
        WHERE gp.GuildId = ?
          AND g.EndedAt >= ?
          AND ${queueFilterSql}
      ),
      identity AS (
        SELECT XboxXuid, Gamertag
        FROM identityRanked
        WHERE RowNumber = 1
      ),
      agg AS (
        SELECT
          gp.XboxXuid AS XboxXuid,
          COUNT(*) AS GamesPlayed,
          ${aggColumns}
        FROM LeaderboardGamePlayers gp
        INNER JOIN LeaderboardGames g
          ON g.GuildId = gp.GuildId
          AND g.QueueNumber = gp.QueueNumber
          AND g.MatchId = gp.MatchId
        WHERE gp.GuildId = ?
          AND g.EndedAt >= ?
          AND ${queueFilterSql}
        GROUP BY gp.XboxXuid
      ),
      ranked AS (
        SELECT agg.XboxXuid, ${rankColumns}
        FROM agg
        LEFT JOIN identity
          ON identity.XboxXuid = agg.XboxXuid
      )
      SELECT * FROM ranked WHERE XboxXuid = ?
    `;

    // Each metric's eligibility CASE expression is repeated three times in rankColumns (the outer
    // CASE, PARTITION BY, and SUM), so its bound minGamesPlayed value must repeat three times too.
    const rankBindings = parts.flatMap((part) => [part.minGamesPlayed, part.minGamesPlayed, part.minGamesPlayed]);
    const bindings = [
      guildId,
      startEpochSeconds,
      ...queueFilterBindings,
      guildId,
      startEpochSeconds,
      ...queueFilterBindings,
      ...rankBindings,
      xboxXuid,
    ];
    const row = await this.DB.prepare(query)
      .bind(...bindings)
      .first<Record<string, number | string | null>>();

    return new Map(
      parts.map((part) => {
        const rank = row?.[`Rank_${part.metric}`] ?? null;
        const total = row?.[`Total_${part.metric}`] ?? null;
        return [part.metric, typeof rank !== "number" || typeof total !== "number" ? null : { rank, total }];
      }),
    );
  }

  /**
   * Ranks every requested outcome metric (series/game win-loss facts) the same way
   * queryStatMetricRanks() does for stat metrics: one shared population scan instead of one scan per
   * metric, with per-metric window functions computing rank/total from it.
   */
  private async queryOutcomeMetricRanks({
    guildId,
    queueChannelId,
    queueChannelIds,
    startEpochSeconds,
    minGamesPlayed,
    metrics,
    xboxXuid,
  }: {
    guildId: string;
    queueChannelId: string | null;
    queueChannelIds?: string[];
    startEpochSeconds: number;
    minGamesPlayed: number;
    metrics: readonly LeaderboardMetric[];
    xboxXuid: string;
  }): Promise<Map<LeaderboardMetric, LeaderboardPlayerMetricRank | null>> {
    if (metrics.length === 0) {
      return new Map();
    }

    const valueSqlByMetric = metrics.map((metric) => {
      const valueSql = PLAYER_OUTCOME_RANK_SQL_BY_METRIC.get(metric);
      if (valueSql == null) {
        throw new Error(`Unsupported player-stats rank metric: ${metric}`);
      }
      return { metric, valueSql };
    });

    const gamesQueueFilterSql = getQueueFilterSql("sGames", queueChannelIds);
    const gamesQueueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);
    const seriesQueueFilterSql = getQueueFilterSql("s", queueChannelIds);
    const seriesQueueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);
    const identityQueueFilterSql = getQueueFilterSql("gp", queueChannelIds);
    const identityQueueFilterBindings = getQueueFilterBindings(queueChannelId, queueChannelIds);

    const aggColumns = valueSqlByMetric.map((part) => `${part.valueSql} AS Value_${part.metric}`).join(",\n        ");
    const rankColumns = valueSqlByMetric
      .map((part) => {
        const eligibleSql = "CASE WHEN agg.GamesPlayed >= ? THEN 1 ELSE 0 END";
        return `
        CASE WHEN ${eligibleSql} THEN ROW_NUMBER() OVER (
          PARTITION BY ${eligibleSql}
          ORDER BY agg.Value_${part.metric} DESC, agg.GamesPlayed DESC, identity.Gamertag ASC, agg.XboxXuid ASC
        ) ELSE NULL END AS Rank_${part.metric},
        SUM(${eligibleSql}) OVER () AS Total_${part.metric}`;
      })
      .join(",\n        ");

    const query = `
      WITH identityRanked AS (
        SELECT
          gp.XboxXuid AS XboxXuid,
          gp.GamertagSnapshot AS Gamertag,
          ROW_NUMBER() OVER (
            PARTITION BY gp.XboxXuid
            ORDER BY g.EndedAt DESC, gp.CreatedAt DESC
          ) AS RowNumber
        FROM LeaderboardGamePlayers gp
        INNER JOIN LeaderboardGames g
          ON g.GuildId = gp.GuildId
          AND g.QueueNumber = gp.QueueNumber
          AND g.MatchId = gp.MatchId
        WHERE gp.GuildId = ?
          AND g.EndedAt >= ?
          AND ${identityQueueFilterSql}
      ),
      identity AS (
        SELECT XboxXuid, Gamertag
        FROM identityRanked
        WHERE RowNumber = 1
      ),
      agg AS (
        SELECT
          sp.XboxXuid AS XboxXuid,
          SUM(sp.GamesPlayedCount) AS GamesPlayed,
          ${aggColumns}
        FROM LeaderboardSeriesPlayers sp
        INNER JOIN LeaderboardSeries s
          ON s.GuildId = sp.GuildId AND s.QueueNumber = sp.QueueNumber
        LEFT JOIN (
          SELECT gp.XboxXuid, SUM(gp.GameWon) AS GameWins
          FROM LeaderboardGamePlayers gp
          INNER JOIN LeaderboardSeries sGames
            ON sGames.GuildId = gp.GuildId AND sGames.QueueNumber = gp.QueueNumber
          WHERE gp.GuildId = ?
            AND sGames.CompletedAt >= ?
            AND ${gamesQueueFilterSql}
          GROUP BY gp.XboxXuid
        ) gameStats
          ON gameStats.XboxXuid = sp.XboxXuid
        WHERE s.GuildId = ?
          AND s.CompletedAt >= ?
          AND ${seriesQueueFilterSql}
        GROUP BY sp.XboxXuid
      ),
      ranked AS (
        SELECT agg.XboxXuid, ${rankColumns}
        FROM agg
        LEFT JOIN identity
          ON identity.XboxXuid = agg.XboxXuid
      )
      SELECT * FROM ranked WHERE XboxXuid = ?
    `;

    const rankBindings = valueSqlByMetric.flatMap(() => [minGamesPlayed, minGamesPlayed, minGamesPlayed]);
    const bindings = [
      guildId,
      startEpochSeconds,
      ...identityQueueFilterBindings,
      guildId,
      startEpochSeconds,
      ...gamesQueueFilterBindings,
      guildId,
      startEpochSeconds,
      ...seriesQueueFilterBindings,
      ...rankBindings,
      xboxXuid,
    ];
    const row = await this.DB.prepare(query)
      .bind(...bindings)
      .first<Record<string, number | string | null>>();

    return new Map(
      valueSqlByMetric.map((part) => {
        const rank = row?.[`Rank_${part.metric}`] ?? null;
        const total = row?.[`Total_${part.metric}`] ?? null;
        return [part.metric, typeof rank !== "number" || typeof total !== "number" ? null : { rank, total }];
      }),
    );
  }

  async getLeaderboardOutcomeMetricRankings({
    guildId,
    queueChannelId,
    startEpochSeconds,
    minGamesPlayed,
    limit,
    offset,
    metric,
  }: LeaderboardRankingsQuery & {
    metric:
      | LeaderboardMetric.SeriesPlayed
      | LeaderboardMetric.SeriesWins
      | LeaderboardMetric.GamesPlayed
      | LeaderboardMetric.GameWins
      | LeaderboardMetric.SeriesWinRate
      | LeaderboardMetric.GamesWinRate;
  }): Promise<{ total: number; rows: LeaderboardRankingRow[] }> {
    const metricSql = ((): string => {
      switch (metric) {
        case LeaderboardMetric.SeriesPlayed: {
          return "stats.SeriesPlayed";
        }
        case LeaderboardMetric.SeriesWins: {
          return "stats.SeriesWins";
        }
        case LeaderboardMetric.GamesPlayed: {
          return "stats.GamesPlayed";
        }
        case LeaderboardMetric.GameWins: {
          return "stats.GameWins";
        }
        case LeaderboardMetric.SeriesWinRate: {
          return "CASE WHEN stats.SeriesPlayed = 0 THEN 0 ELSE CAST(stats.SeriesWins AS REAL) / stats.SeriesPlayed END";
        }
        case LeaderboardMetric.GamesWinRate: {
          return "CASE WHEN stats.GamesPlayed = 0 THEN 0 ELSE CAST(stats.GameWins AS REAL) / stats.GamesPlayed END";
        }
        default: {
          throw new UnreachableError(metric);
        }
      }
    })();

    const aggregateSql = `
      SELECT
        stats.XboxXuid AS XboxXuid,
        identity.DiscordUserId AS DiscordUserId,
        identity.GamertagSnapshot AS Gamertag,
        stats.SeriesPlayed AS SeriesPlayed,
        stats.SeriesWins AS SeriesWins,
        stats.GamesPlayed AS GamesPlayed,
        stats.GameWins AS GameWins,
        0 AS MedalCount,
        0 AS ObjectiveGamesPlayed,
        0 AS ObjectiveTimeSeconds,
        ${metricSql} AS MetricValue
      FROM (
        SELECT
          sp.XboxXuid AS XboxXuid,
          COUNT(*) AS SeriesPlayed,
          SUM(sp.SeriesWon) AS SeriesWins,
          SUM(sp.GamesPlayedCount) AS GamesPlayed,
          COALESCE(gameStats.GameWins, 0) AS GameWins
        FROM LeaderboardSeriesPlayers sp
        INNER JOIN LeaderboardSeries s
          ON s.GuildId = sp.GuildId
          AND s.QueueNumber = sp.QueueNumber
        LEFT JOIN (
          SELECT gp.XboxXuid, SUM(gp.GameWon) AS GameWins
          FROM LeaderboardGamePlayers gp
          INNER JOIN LeaderboardSeries sGames
            ON sGames.GuildId = gp.GuildId
            AND sGames.QueueNumber = gp.QueueNumber
          WHERE gp.GuildId = ?
            AND sGames.CompletedAt >= ?
            AND (? IS NULL OR sGames.QueueChannelId = ?)
          GROUP BY gp.XboxXuid
        ) gameStats
          ON gameStats.XboxXuid = sp.XboxXuid
        WHERE s.GuildId = ?
          AND s.CompletedAt >= ?
          AND (? IS NULL OR s.QueueChannelId = ?)
        GROUP BY sp.XboxXuid
        HAVING SUM(sp.GamesPlayedCount) >= ?
      ) stats
      INNER JOIN (
        SELECT ranked.XboxXuid, ranked.DiscordUserId, ranked.GamertagSnapshot
        FROM (
          SELECT
            gp.XboxXuid AS XboxXuid,
            gp.DiscordUserId AS DiscordUserId,
            gp.GamertagSnapshot AS GamertagSnapshot,
            ROW_NUMBER() OVER (
              PARTITION BY gp.XboxXuid
              ORDER BY g.EndedAt DESC, gp.CreatedAt DESC
            ) AS RowNumber
          FROM LeaderboardGamePlayers gp
          INNER JOIN LeaderboardGames g
            ON g.GuildId = gp.GuildId
            AND g.QueueNumber = gp.QueueNumber
            AND g.MatchId = gp.MatchId
          WHERE gp.GuildId = ?
            AND g.EndedAt >= ?
            AND (? IS NULL OR gp.QueueChannelId = ?)
        ) ranked
        WHERE ranked.RowNumber = 1
      ) identity
        ON identity.XboxXuid = stats.XboxXuid
    `;

    const bindings = [
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      minGamesPlayed,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
    ] as const;
    const countStmt = this.DB.prepare(`SELECT COUNT(*) AS Total FROM (${aggregateSql}) agg`).bind(...bindings);
    const countRow = await countStmt.first<{ Total: number }>();
    const rowsStmt = this.DB.prepare(
      `SELECT * FROM (${aggregateSql}) agg ORDER BY agg.MetricValue DESC, agg.GamesPlayed DESC, agg.Gamertag ASC LIMIT ? OFFSET ?`,
    ).bind(...bindings, limit, offset);
    const rowsResponse = await rowsStmt.all<LeaderboardRankingRow>();

    return { total: countRow?.Total ?? 0, rows: rowsResponse.results };
  }

  async getUserSession(sessionId: string): Promise<UserSessionsRow | null> {
    const query = "SELECT * FROM UserSessions WHERE SessionId = ?";
    const stmt = this.DB.prepare(query).bind(sessionId);
    return await stmt.first<UserSessionsRow>();
  }

  async upsertUserSession(session: UserSessionsRow): Promise<void> {
    const query = `
      INSERT INTO UserSessions (SessionId, UserId, AccessToken, RefreshToken, ExpiresAt, CreatedAt, LastRefreshedAt, AuthMetadataJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(SessionId) DO UPDATE SET UserId=excluded.UserId, AccessToken=excluded.AccessToken, RefreshToken=excluded.RefreshToken, ExpiresAt=excluded.ExpiresAt, CreatedAt=excluded.CreatedAt, LastRefreshedAt=excluded.LastRefreshedAt, AuthMetadataJson=excluded.AuthMetadataJson
    `;
    const stmt = this.DB.prepare(query).bind(
      session.SessionId,
      session.UserId,
      session.AccessToken,
      session.RefreshToken,
      session.ExpiresAt,
      session.CreatedAt,
      session.LastRefreshedAt,
      session.AuthMetadataJson,
    );
    await stmt.run();
  }

  async updateSessionAuthMetadata(sessionId: string, authMetadataJson: string): Promise<void> {
    const query = "UPDATE UserSessions SET AuthMetadataJson = ? WHERE SessionId = ?";
    const stmt = this.DB.prepare(query).bind(authMetadataJson, sessionId);
    await stmt.run();
  }

  async deleteUserSession(sessionId: string): Promise<void> {
    const query = "DELETE FROM UserSessions WHERE SessionId = ?";
    const stmt = this.DB.prepare(query).bind(sessionId);
    await stmt.run();
  }

  async deleteExpiredUserSessions(nowEpochSeconds: number): Promise<void> {
    const sessionExpiryCutoffEpochSeconds = nowEpochSeconds - SESSION_COOKIE_MAX_AGE_SECONDS;
    const query = "DELETE FROM UserSessions WHERE CreatedAt <= ?";
    const stmt = this.DB.prepare(query).bind(sessionExpiryCutoffEpochSeconds);
    await stmt.run();
  }

  async getUserCredentials(userId: string): Promise<UserCredentialsRow | null> {
    const query = "SELECT * FROM UserCredentials WHERE UserId = ?";
    const stmt = this.DB.prepare(query).bind(userId);
    return await stmt.first<UserCredentialsRow>();
  }

  async upsertUserCredentials(row: UserCredentialsRow): Promise<void> {
    const query = `
      INSERT INTO UserCredentials (UserId, RefreshToken, UpdatedAt) VALUES (?, ?, ?)
      ON CONFLICT(UserId) DO UPDATE SET RefreshToken=excluded.RefreshToken, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(row.UserId, row.RefreshToken, row.UpdatedAt);
    await stmt.run();
  }

  async deleteUserCredentials(userId: string): Promise<void> {
    const query = "DELETE FROM UserCredentials WHERE UserId = ?";
    const stmt = this.DB.prepare(query).bind(userId);
    await stmt.run();
  }

  async findLinkedIdentitiesByUserId(userId: string): Promise<LinkedIdentitiesRow[]> {
    const query = "SELECT * FROM LinkedIdentities WHERE UserId = ? ORDER BY CreatedAt DESC";
    const stmt = this.DB.prepare(query).bind(userId);
    const response = await stmt.all<LinkedIdentitiesRow>();
    return response.results;
  }

  async getLinkedIdentityByProvider(
    provider: IdentityProvider,
    providerUserId: string,
  ): Promise<LinkedIdentitiesRow | null> {
    const query = "SELECT * FROM LinkedIdentities WHERE Provider = ? AND ProviderUserId = ?";
    const stmt = this.DB.prepare(query).bind(provider, providerUserId);
    return await stmt.first<LinkedIdentitiesRow>();
  }

  async findActiveXboxIdentityByGamertag(gamertag: string): Promise<LinkedIdentitiesRow | null> {
    const query =
      "SELECT * FROM LinkedIdentities WHERE Provider = 'xbox' AND IsActive = 1 AND Gamertag = ? ORDER BY UpdatedAt DESC";
    const stmt = this.DB.prepare(query).bind(gamertag);
    return await stmt.first<LinkedIdentitiesRow>();
  }

  async upsertLinkedIdentity(identity: LinkedIdentitiesRow): Promise<void> {
    const query = `
      INSERT INTO LinkedIdentities (IdentityId, UserId, Provider, ProviderUserId, Gamertag, TwitchId, IsActive, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(Provider, ProviderUserId) DO UPDATE SET UserId=excluded.UserId, Gamertag=excluded.Gamertag, TwitchId=excluded.TwitchId, IsActive=excluded.IsActive, CreatedAt=excluded.CreatedAt, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
      identity.IdentityId,
      identity.UserId,
      identity.Provider,
      identity.ProviderUserId,
      identity.Gamertag,
      identity.TwitchId,
      identity.IsActive,
      identity.CreatedAt,
      identity.UpdatedAt,
    );
    await stmt.run();
  }

  async createIndividualTrackerProfile(profile: IndividualTrackerProfilesRow): Promise<void> {
    const query =
      "INSERT INTO IndividualTrackerProfiles (ProfileId, UserId, ActiveIdentityId, Name, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?)";
    const stmt = this.DB.prepare(query).bind(
      profile.ProfileId,
      profile.UserId,
      profile.ActiveIdentityId,
      profile.Name,
      profile.CreatedAt,
      profile.UpdatedAt,
    );
    await stmt.run();
  }

  async getIndividualTrackerProfile(profileId: string): Promise<IndividualTrackerProfilesRow | null> {
    const query = "SELECT * FROM IndividualTrackerProfiles WHERE ProfileId = ?";
    const stmt = this.DB.prepare(query).bind(profileId);
    return await stmt.first<IndividualTrackerProfilesRow>();
  }

  async findIndividualTrackerProfilesByUserId(userId: string): Promise<IndividualTrackerProfilesRow[]> {
    const query = "SELECT * FROM IndividualTrackerProfiles WHERE UserId = ? ORDER BY CreatedAt ASC";
    const stmt = this.DB.prepare(query).bind(userId);
    const response = await stmt.all<IndividualTrackerProfilesRow>();
    return response.results;
  }

  async updateIndividualTrackerProfile(
    profileId: string,
    updates: Partial<Pick<IndividualTrackerProfilesRow, "ActiveIdentityId" | "Name" | "UpdatedAt">>,
  ): Promise<void> {
    const setStatements: string[] = [];
    const values: (string | number | null)[] = [];

    type UpdatableKeys = keyof Pick<IndividualTrackerProfilesRow, "ActiveIdentityId" | "Name" | "UpdatedAt">;
    const updateKeys: UpdatableKeys[] = ["ActiveIdentityId", "Name", "UpdatedAt"];

    for (const key of updateKeys) {
      if (updates[key] !== undefined) {
        setStatements.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (setStatements.length === 0) {
      return;
    }

    values.push(profileId);

    const query = `UPDATE IndividualTrackerProfiles SET ${setStatements.join(", ")} WHERE ProfileId = ?`;
    const stmt = this.DB.prepare(query).bind(...values);
    await stmt.run();
  }

  async getIndividualTrackerGames(profileId: string): Promise<IndividualTrackerGamesRow[]> {
    const query = "SELECT * FROM IndividualTrackerGames WHERE ProfileId = ? ORDER BY Position ASC";
    const stmt = this.DB.prepare(query).bind(profileId);
    const response = await stmt.all<IndividualTrackerGamesRow>();
    return response.results;
  }

  async replaceIndividualTrackerGames(profileId: string, games: IndividualTrackerGamesRow[]): Promise<void> {
    const deleteStmt = this.DB.prepare("DELETE FROM IndividualTrackerGames WHERE ProfileId = ?").bind(profileId);

    if (games.length === 0) {
      await deleteStmt.run();
      return;
    }

    const placeholders = games.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
    const query = `
      INSERT INTO IndividualTrackerGames (ProfileId, MatchId, Position, Included, AnnotationsJson, CreatedAt, UpdatedAt)
      VALUES ${placeholders}
    `;
    const values = games.flatMap((game) => [
      profileId,
      game.MatchId,
      game.Position,
      game.Included,
      game.AnnotationsJson,
      game.CreatedAt,
      game.UpdatedAt,
    ]);
    const insertStmt = this.DB.prepare(query).bind(...values);
    await this.DB.batch([deleteStmt, insertStmt]);
  }

  async getStreamerViewSettings(profileId: string): Promise<StreamerViewSettingsRow | null> {
    const query = "SELECT * FROM StreamerViewSettings WHERE ProfileId = ?";
    const stmt = this.DB.prepare(query).bind(profileId);
    return await stmt.first<StreamerViewSettingsRow>();
  }

  async upsertStreamerViewSettings(settings: StreamerViewSettingsRow): Promise<void> {
    const query = `
      INSERT INTO StreamerViewSettings (ProfileId, LayoutOptionsJson, VisibleSectionsJson, StyleFlagsJson, UpdatedAt) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(ProfileId) DO UPDATE SET LayoutOptionsJson=excluded.LayoutOptionsJson, VisibleSectionsJson=excluded.VisibleSectionsJson, StyleFlagsJson=excluded.StyleFlagsJson, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
      settings.ProfileId,
      settings.LayoutOptionsJson,
      settings.VisibleSectionsJson,
      settings.StyleFlagsJson,
      settings.UpdatedAt,
    );
    await stmt.run();
  }

  async findIndividualTrackersByUserId(userId: string): Promise<IndividualTrackersRow[]> {
    const query = "SELECT * FROM IndividualTrackers WHERE UserId = ? ORDER BY CreatedAt ASC";
    const stmt = this.DB.prepare(query).bind(userId);
    const response = await stmt.all<IndividualTrackersRow>();
    return response.results;
  }

  async getIndividualTracker(trackerId: string): Promise<IndividualTrackersRow | null> {
    const query = "SELECT * FROM IndividualTrackers WHERE TrackerId = ?";
    const stmt = this.DB.prepare(query).bind(trackerId);
    return await stmt.first<IndividualTrackersRow>();
  }

  async findIndividualTrackersByXuids(xuids: string[]): Promise<IndividualTrackersRow[]> {
    if (xuids.length === 0) {
      return [];
    }
    const placeholders = xuids.map(() => "?").join(",");
    const query = `SELECT * FROM IndividualTrackers WHERE Xuid IN (${placeholders})`;
    const stmt = this.DB.prepare(query).bind(...xuids);
    const response = await stmt.all<IndividualTrackersRow>();
    return response.results;
  }

  async findLiveIndividualTrackerByUserId(userId: string): Promise<IndividualTrackersRow | null> {
    const query = "SELECT * FROM IndividualTrackers WHERE UserId = ? AND IsLive = 1";
    const stmt = this.DB.prepare(query).bind(userId);
    return await stmt.first<IndividualTrackersRow>();
  }

  async upsertIndividualTracker(tracker: IndividualTrackersRow): Promise<void> {
    const query = `
      INSERT INTO IndividualTrackers (TrackerId, UserId, Gamertag, Xuid, Status, IsLive, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(TrackerId) DO UPDATE SET Gamertag=excluded.Gamertag, Xuid=excluded.Xuid, Status=excluded.Status, IsLive=excluded.IsLive, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
      tracker.TrackerId,
      tracker.UserId,
      tracker.Gamertag,
      tracker.Xuid,
      tracker.Status,
      tracker.IsLive,
      tracker.CreatedAt,
      tracker.UpdatedAt,
    );
    await stmt.run();
  }

  async deleteIndividualTracker(trackerId: string): Promise<void> {
    const stmt = this.DB.prepare("DELETE FROM IndividualTrackers WHERE TrackerId = ?").bind(trackerId);
    await stmt.run();
  }

  async setLiveIndividualTracker(userId: string, trackerId: string): Promise<void> {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const clearStmt = this.DB.prepare(
      "UPDATE IndividualTrackers SET IsLive = 0, UpdatedAt = ? WHERE UserId = ? AND IsLive = 1 AND TrackerId != ?",
    ).bind(nowEpoch, userId, trackerId);
    const setStmt = this.DB.prepare(
      "UPDATE IndividualTrackers SET IsLive = 1, UpdatedAt = ? WHERE TrackerId = ? AND UserId = ?",
    ).bind(nowEpoch, trackerId, userId);
    await this.DB.batch([clearStmt, setStmt]);
  }
}
