import type {
  APIEmbed,
  APIEmbedField,
  APIMessage,
  APIMessageTopLevelComponent,
  APISelectMenuOption,
} from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { GameVariantCategory } from "halo-infinite-api";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import {
  LeaderboardMetric,
  LeaderboardMetricAggregation,
  LeaderboardWindow,
  getLeaderboardMetricFamily,
  getLeaderboardMetricFamilyLabel,
  getLeaderboardMetricAggregationLabel,
  getLeaderboardMetricFamiliesForAggregation,
  getLeaderboardObjectiveDescriptorByMetric,
  resolveLeaderboardMetric,
  isObjectiveLeaderboardMetric,
} from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardPlayerStatsRow } from "../../services/database/types/leaderboard_player_stats";
import type { LeaderboardPlayerMetricRank } from "../../services/database/types/leaderboard_player_metric_rank";
import { LeaderboardPlayerRelationshipMetric } from "../../services/database/types/leaderboard_player_relationship";
import type { LeaderboardPlayerRelationshipRow } from "../../services/database/types/leaderboard_player_relationship";
import { formatMetricValue, formatRank } from "../../services/leaderboard/leaderboard-response";

export const PLAYER_STATS_QUEUE_SELECT_CONTROL_ID = "stats_player_queue";
export const PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID = "stats_player_aggregation";
export const PLAYER_STATS_WINDOW_SELECT_CONTROL_ID = "stats_player_window";
export const PLAYER_STATS_TEMPORARY_ERROR_FOOTER = "Temporary player stats error";

export const ALL_QUEUES_VALUE = "-";
const DISCORD_EMBED_FIELD_VALUE_LIMIT = 1024;
const PLAYER_STATS_STATE_URL_PREFIX = "https://guilty-spark.app/stats/player/";

export interface PlayerStatsQueueOption {
  label: string;
  value: string | null;
}

interface PlayerStatsViewStateBase {
  xboxXuid: string;
  queueChannelId: string | null;
  window: LeaderboardWindow;
}

export interface PlayerStatsAggregateViewState extends PlayerStatsViewStateBase {
  aggregation: LeaderboardMetricAggregation;
  relationshipMetric: null;
}

export interface PlayerStatsRelationshipViewState extends PlayerStatsViewStateBase {
  aggregation: null;
  relationshipMetric: LeaderboardPlayerRelationshipMetric;
}

export type PlayerStatsViewState = PlayerStatsAggregateViewState | PlayerStatsRelationshipViewState;

interface PlayerStatTableRow {
  label: string;
  rankText: string;
  valueText: string;
}

const LEADERBOARD_WINDOW_BY_VALUE = new Map<string, LeaderboardWindow>(
  Object.values(LeaderboardWindow).map((window) => [window, window]),
);
const LEADERBOARD_AGGREGATION_BY_VALUE = new Map<string, LeaderboardMetricAggregation>(
  Object.values(LeaderboardMetricAggregation).map((aggregation) => [aggregation, aggregation]),
);
const PLAYER_RELATIONSHIP_METRIC_BY_VALUE = new Map<string, LeaderboardPlayerRelationshipMetric>(
  Object.values(LeaderboardPlayerRelationshipMetric).map((metric) => [metric, metric]),
);
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

const OBJECTIVE_GAMES_PLAYED_BY_CATEGORY = new Map<GameVariantCategory, (stats: LeaderboardPlayerStatsRow) => number>([
  [GameVariantCategory.MultiplayerStrongholds, (stats): number => stats.StrongholdGamesPlayed],
  [GameVariantCategory.MultiplayerKingOfTheHill, (stats): number => stats.HillGamesPlayed],
  [GameVariantCategory.MultiplayerCtf, (stats): number => stats.CtfGamesPlayed],
  [GameVariantCategory.MultiplayerOddball, (stats): number => stats.BallGamesPlayed],
]);

function average(total: number, denominator: number): number {
  return denominator === 0 ? 0 : total / denominator;
}

const PLAYER_METRIC_VALUE_GETTERS = new Map<LeaderboardMetric, (stats: LeaderboardPlayerStatsRow) => number>([
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

export function getPlayerStatsMetricsForAggregation(
  aggregation: LeaderboardMetricAggregation,
): readonly LeaderboardMetric[] {
  return getLeaderboardMetricFamiliesForAggregation(aggregation).map((family) =>
    resolveLeaderboardMetric(family, aggregation),
  );
}

export function createQueueSelectOptions(
  queueOptions: readonly PlayerStatsQueueOption[],
  selectedQueueChannelId: string | null,
): APISelectMenuOption[] {
  return queueOptions.map((option) => ({
    label: option.label,
    value: option.value ?? ALL_QUEUES_VALUE,
    default: option.value === selectedQueueChannelId,
  }));
}

function createStatsViewSelectOptions(state: PlayerStatsViewState): APISelectMenuOption[] {
  const aggregationOptions = Object.values(LeaderboardMetricAggregation).map((aggregation) => ({
    label: getLeaderboardMetricAggregationLabel(aggregation),
    value: aggregation,
    default: state.relationshipMetric == null && aggregation === state.aggregation,
  }));
  const relationshipOptions = Array.from(PLAYER_RELATIONSHIP_METRIC_LABELS, ([metric, label]) => ({
    label,
    value: metric,
    default: state.relationshipMetric === metric,
  }));

  return [...aggregationOptions, ...relationshipOptions];
}

export function createWindowSelectOptions(
  selectedWindow: LeaderboardWindow,
  resetAt: number | null,
): APISelectMenuOption[] {
  const windowOptions = [
    { label: "1 week", value: LeaderboardWindow.OneWeek },
    { label: "1 month", value: LeaderboardWindow.OneMonth },
    { label: "3 months", value: LeaderboardWindow.ThreeMonths },
    { label: "6 months", value: LeaderboardWindow.SixMonths },
    { label: "12 months", value: LeaderboardWindow.TwelveMonths },
  ];
  const options =
    resetAt == null ? windowOptions : [{ label: "Last reset", value: LeaderboardWindow.LastReset }, ...windowOptions];

  return options.map((option) => ({
    label: option.label,
    value: option.value,
    default: option.value === selectedWindow,
  }));
}

function shouldShowQueueSelect(state: PlayerStatsViewState, queueOptions: readonly PlayerStatsQueueOption[]): boolean {
  // Showing the select only when there's a real choice would hide it for single-queue players,
  // dropping their explicit queue selection on later interactions (the select's absence is read as
  // queueChannelId: null in getPlayerStatsStateFromMessage). Keep it visible whenever a specific
  // queue is selected so that state round-trips correctly.
  return queueOptions.length > 1 || state.queueChannelId != null;
}

function createViewControls(
  state: PlayerStatsViewState,
  queueOptions: readonly PlayerStatsQueueOption[],
  resetAt: number | null,
): APIMessageTopLevelComponent[] {
  const controls: APIMessageTopLevelComponent[] = [];

  if (shouldShowQueueSelect(state, queueOptions)) {
    controls.push({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
          placeholder: "Select queue",
          min_values: 1,
          max_values: 1,
          options: createQueueSelectOptions(queueOptions, state.queueChannelId),
        },
      ],
    });
  }

  controls.push(
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
          placeholder: "Select type",
          min_values: 1,
          max_values: 1,
          options: createStatsViewSelectOptions(state),
        },
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
          placeholder: "Select window",
          min_values: 1,
          max_values: 1,
          options: createWindowSelectOptions(state.window, resetAt),
        },
      ],
    },
  );

  return controls;
}

function getSelectedStringSelectValue(
  components: readonly APIMessageTopLevelComponent[],
  customId: string,
): string | undefined {
  for (const actionRow of components) {
    if (actionRow.type !== ComponentType.ActionRow) {
      continue;
    }

    for (const component of actionRow.components) {
      if (component.type !== ComponentType.StringSelect || component.custom_id !== customId) {
        continue;
      }

      return component.options.find((option) => option.default === true)?.value;
    }
  }

  return undefined;
}

function parseLeaderboardWindow(value: string): LeaderboardWindow | null {
  return LEADERBOARD_WINDOW_BY_VALUE.get(value) ?? null;
}

function parseLeaderboardAggregation(value: string): LeaderboardMetricAggregation | null {
  return LEADERBOARD_AGGREGATION_BY_VALUE.get(value) ?? null;
}

export function parsePlayerStatsRelationshipMetric(value: string): LeaderboardPlayerRelationshipMetric | null {
  return PLAYER_RELATIONSHIP_METRIC_BY_VALUE.get(value) ?? null;
}

export function getPlayerStatsRelationshipMetricLabel(metric: LeaderboardPlayerRelationshipMetric): string {
  const label = PLAYER_RELATIONSHIP_METRIC_LABELS.get(metric);
  if (label == null) {
    throw new Error(`Unsupported player relationship metric: ${metric}`);
  }

  return label;
}

// Objective counters are tracked per game mode (or per contribution column); the games-played
// denominator must match the population the metric was aggregated over, not the player's overall
// objective-game count (ObjectiveTimeSeconds' population), which can differ from these subsets.
function getObjectiveGamesPlayedForMetric(stats: LeaderboardPlayerStatsRow, metric: LeaderboardMetric): number {
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

function getStatsMetricValue(stats: LeaderboardPlayerStatsRow, metric: LeaderboardMetric): number {
  const getValue = PLAYER_METRIC_VALUE_GETTERS.get(metric);
  if (getValue == null) {
    throw new Error(`Unsupported player-stats metric: ${metric}`);
  }

  return getValue(stats);
}

// Metrics whose rank population in getLeaderboardPlayerMetricRank() is narrowed to players with
// qualifying objective data (COUNT of an objective column), rather than the overall GamesPlayed
// population — must mirror the metricGamesPlayedSql overrides in buildStatMetricRankAggregate().
const OBJECTIVE_SPECIFIC_POPULATION_METRICS: ReadonlySet<LeaderboardMetric> = new Set([
  LeaderboardMetric.ObjectiveTime,
  LeaderboardMetric.AvgObjectiveTimePerGame,
  LeaderboardMetric.ObjectiveTeamContribution,
]);

export function hasObjectiveSpecificPopulation(metric: LeaderboardMetric): boolean {
  return isObjectiveLeaderboardMetric(metric) || OBJECTIVE_SPECIFIC_POPULATION_METRICS.has(metric);
}

function getRankText(
  metric: LeaderboardMetric,
  rank: LeaderboardPlayerMetricRank | null,
  overallTotalPlayers: number | null,
): string {
  if (rank == null) {
    return "Unranked";
  }

  const rankText = formatRank(rank.rank);
  return hasObjectiveSpecificPopulation(metric) && rank.total !== overallTotalPlayers
    ? `${rankText} / ${rank.total.toString()}`
    : rankText;
}

/**
 * Computes a metric's raw value for one player alongside the contextual row fields
 * `formatMetricValue` needs (e.g. series/game win counts, objective games played). Shared by the
 * single-player stats table and the two-player compare table so both format identically.
 */
export function getPlayerStatsMetricValue(
  stats: LeaderboardPlayerStatsRow,
  metric: LeaderboardMetric,
): { metricValue: number; formatRow: LeaderboardResponse["rows"][number] } {
  const metricValue = getStatsMetricValue(stats, metric);
  const formatRow: LeaderboardResponse["rows"][number] = {
    rank: 0,
    xboxXuid: stats.XboxXuid,
    discordUserId: stats.DiscordUserId,
    gamertag: stats.Gamertag,
    seriesPlayed: stats.SeriesPlayed,
    seriesWins: stats.SeriesWins,
    gamesPlayed: stats.GamesPlayed,
    gameWins: stats.GameWins,
    medalCount: stats.MedalCount,
    objectiveGamesPlayed: getObjectiveGamesPlayedForMetric(stats, metric),
    objectiveTimeSeconds: stats.ObjectiveTimeSeconds,
    metricValue,
  };

  return { metricValue, formatRow };
}

function buildStatTableRow(
  stats: LeaderboardPlayerStatsRow,
  metric: LeaderboardMetric,
  rank: LeaderboardPlayerMetricRank | null,
  overallTotalPlayers: number | null,
  locale: string,
): PlayerStatTableRow {
  const { metricValue, formatRow } = getPlayerStatsMetricValue(stats, metric);

  return {
    label: getLeaderboardMetricFamilyLabel(getLeaderboardMetricFamily(metric)),
    rankText: getRankText(metric, rank, overallTotalPlayers),
    valueText: formatMetricValue(metricValue, metric, formatRow, locale),
  };
}

function createFooterText(minGamesPlayed: number, totalPlayers: number | null, locale: string): string {
  const totalPlayersText = totalPlayers == null ? "Unknown" : totalPlayers.toLocaleString(locale);
  return `Min games: ${minGamesPlayed.toString()} | Total players: ${totalPlayersText}`;
}

function getXboxXuidFromEmbedUrl(embeds: readonly APIEmbed[]): string | null {
  const url = embeds[0]?.url;
  if (url == null) {
    return null;
  }

  if (!url.startsWith(PLAYER_STATS_STATE_URL_PREFIX)) {
    return null;
  }

  const xboxXuid = url.slice(PLAYER_STATS_STATE_URL_PREFIX.length);
  return xboxXuid === "" ? null : xboxXuid;
}

function getSelectedValueForState(controlId: string, state: PlayerStatsViewState): string | null {
  switch (controlId) {
    case PLAYER_STATS_QUEUE_SELECT_CONTROL_ID: {
      return state.queueChannelId ?? ALL_QUEUES_VALUE;
    }
    case PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID: {
      return state.relationshipMetric ?? state.aggregation;
    }
    case PLAYER_STATS_WINDOW_SELECT_CONTROL_ID: {
      return state.window;
    }
    default: {
      return null;
    }
  }
}

function createComponentsForState(
  components: readonly APIMessageTopLevelComponent[],
  state: PlayerStatsViewState,
  disabled = false,
): APIMessageTopLevelComponent[] {
  return components.map((actionRow) => {
    if (actionRow.type !== ComponentType.ActionRow) {
      return actionRow;
    }

    return {
      ...actionRow,
      components: actionRow.components.map((component) => {
        if (component.type !== ComponentType.StringSelect) {
          return component;
        }

        const selectedValue = getSelectedValueForState(component.custom_id, state);

        return {
          ...component,
          disabled,
          options:
            selectedValue == null
              ? component.options
              : component.options.map((option) => ({ ...option, default: option.value === selectedValue })),
        };
      }),
    };
  });
}

/**
 * Immediate acknowledgement shown while the selected filter change is recomputed, since some
 * relationship views (e.g. head-to-head) can take noticeably longer than the aggregate pages.
 */
export function createPlayerStatsLoadingResponse(
  message: APIMessage,
  state: PlayerStatsViewState,
): { embeds: APIEmbed[]; components: APIMessageTopLevelComponent[] } {
  const [existingEmbed] = message.embeds;

  return {
    embeds: [
      {
        color: 0xf5b642,
        title: existingEmbed?.title ?? "Player stats",
        description: "Updating stats...",
        footer: { text: "This may take a few seconds" },
        url: `${PLAYER_STATS_STATE_URL_PREFIX}${state.xboxXuid}`,
      },
    ],
    components: createComponentsForState(message.components ?? [], state, true),
  };
}

export function createPlayerStatsNoQualifyingGamesResponse(
  message: APIMessage,
  state: PlayerStatsViewState,
): { embeds: APIEmbed[]; components: APIMessageTopLevelComponent[] } {
  const [existingEmbed] = message.embeds;
  const windowLabel = state.window === LeaderboardWindow.LastReset ? "Last reset" : state.window;

  return {
    embeds: [
      {
        color: 0xf5b642,
        description: `No games played in ${windowLabel} for the selected queue scope.`,
        footer: { text: "No games played" },
        title: existingEmbed?.title ?? "Player stats",
        url: `${PLAYER_STATS_STATE_URL_PREFIX}${state.xboxXuid}`,
      },
    ],
    components: createComponentsForState(message.components ?? [], state),
  };
}

function appendFieldValue(currentValue: string, nextValue: string): string {
  return currentValue.length === 0 ? nextValue : `${currentValue}\n${nextValue}`;
}

function canAppendRow(fieldValues: readonly string[], row: PlayerStatTableRow): boolean {
  const nextValues = [row.label, row.rankText, row.valueText];

  return nextValues.every((nextValue, index) => {
    const currentValue = fieldValues[index] ?? "";
    return appendFieldValue(currentValue, nextValue).length <= DISCORD_EMBED_FIELD_VALUE_LIMIT;
  });
}

function createTableFields(rows: readonly PlayerStatTableRow[]): APIEmbedField[][] {
  const fieldGroups: APIEmbedField[][] = [];
  let rowIndex = 0;

  while (rowIndex < rows.length) {
    const fieldValues: [string, string, string] = ["", "", ""];
    const groupStartIndex = rowIndex;

    while (rowIndex < rows.length) {
      const row = rows[rowIndex];
      if (row == null) {
        break;
      }

      // A row whose own values exceed the field limit can never fit alongside prior rows; force it
      // into its own (truncated) group so rowIndex always advances and the outer loop terminates.
      if (!canAppendRow(fieldValues, row) && rowIndex === groupStartIndex) {
        fieldValues[0] = row.label.slice(0, DISCORD_EMBED_FIELD_VALUE_LIMIT);
        fieldValues[1] = row.rankText.slice(0, DISCORD_EMBED_FIELD_VALUE_LIMIT);
        fieldValues[2] = row.valueText.slice(0, DISCORD_EMBED_FIELD_VALUE_LIMIT);
        rowIndex += 1;
        break;
      }

      if (!canAppendRow(fieldValues, row)) {
        break;
      }

      fieldValues[0] = appendFieldValue(fieldValues[0], row.label);
      fieldValues[1] = appendFieldValue(fieldValues[1], row.rankText);
      fieldValues[2] = appendFieldValue(fieldValues[2], row.valueText);
      rowIndex += 1;
    }

    fieldGroups.push([
      { name: "Stat", value: fieldValues[0] === "" ? "-" : fieldValues[0], inline: true },
      { name: "Rank", value: fieldValues[1] === "" ? "-" : fieldValues[1], inline: true },
      { name: "Value", value: fieldValues[2] === "" ? "-" : fieldValues[2], inline: true },
    ]);
  }

  return fieldGroups;
}

function getRelationshipRankText(index: number): string {
  return formatRank(index + 1);
}

function formatPerfects(perfects: number, locale: string): string {
  const pluralCategory = new Intl.PluralRules(locale).select(perfects);
  return `${perfects.toLocaleString(locale)} ${pluralCategory === "one" ? "perfect" : "perfects"}`;
}

function formatRelationshipValue(
  row: LeaderboardPlayerRelationshipRow,
  metric: LeaderboardPlayerRelationshipMetric,
  locale: string,
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

function getRelationshipFooter(metric: LeaderboardPlayerRelationshipMetric): string | undefined {
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

export function createPlayerStatsRelationshipEmbeds({
  targetGamertag,
  rows,
  state,
  locale,
  queueLabel,
  queueOptions,
  resetAt,
}: {
  targetGamertag: string;
  rows: readonly LeaderboardPlayerRelationshipRow[];
  state: PlayerStatsRelationshipViewState;
  locale: string;
  queueLabel: string;
  queueOptions: readonly PlayerStatsQueueOption[];
  resetAt: number | null;
}): { embeds: APIEmbed[]; components: APIMessageTopLevelComponent[] } {
  const windowLabel = state.window === LeaderboardWindow.LastReset ? "Last reset" : state.window;
  const metricLabel = getPlayerStatsRelationshipMetricLabel(state.relationshipMetric);
  const footerText = getRelationshipFooter(state.relationshipMetric);
  const fields: APIEmbedField[] =
    rows.length === 0
      ? []
      : [
          { name: "Player", value: rows.map((row) => row.Gamertag).join("\n"), inline: true },
          { name: "Rank", value: rows.map((_row, index) => getRelationshipRankText(index)).join("\n"), inline: true },
          {
            name: "Value",
            value: rows.map((row) => formatRelationshipValue(row, state.relationshipMetric, locale)).join("\n"),
            inline: true,
          },
        ];
  const embeds: APIEmbed[] = [
    {
      color: 0xf5b642,
      description:
        rows.length === 0
          ? `No relationship data found for ${windowLabel} in the selected queue scope.`
          : `Relationship stats for ${windowLabel} (${queueLabel})`,
      fields,
      ...(footerText == null ? {} : { footer: { text: footerText } }),
      title: `${targetGamertag} - ${metricLabel}`,
      url: `${PLAYER_STATS_STATE_URL_PREFIX}${state.xboxXuid}`,
    },
  ];

  return {
    embeds,
    components: createViewControls(state, queueOptions, resetAt),
  };
}

export function createPlayerStatsEmbeds({
  stats,
  ranks,
  state,
  locale,
  queueLabel,
  queueOptions,
  resetAt,
  minGamesPlayed,
}: {
  stats: LeaderboardPlayerStatsRow;
  ranks: Map<LeaderboardMetric, LeaderboardPlayerMetricRank | null>;
  state: PlayerStatsAggregateViewState;
  locale: string;
  queueLabel: string;
  queueOptions: readonly PlayerStatsQueueOption[];
  resetAt: number | null;
  minGamesPlayed: number;
}): { embeds: APIEmbed[]; components: APIMessageTopLevelComponent[] } {
  const windowLabel = state.window === LeaderboardWindow.LastReset ? "Last reset" : state.window;
  const metrics = getPlayerStatsMetricsForAggregation(state.aggregation);
  const overallTotalPlayers = ranks.get(LeaderboardMetric.GamesPlayed)?.total ?? null;
  const rows = metrics.map((metric) =>
    buildStatTableRow(stats, metric, ranks.get(metric) ?? null, overallTotalPlayers, locale),
  );
  const fieldGroups = createTableFields(rows);
  const aggregationLabel = getLeaderboardMetricAggregationLabel(state.aggregation);
  const footerText = createFooterText(minGamesPlayed, overallTotalPlayers, locale);
  const embeds = fieldGroups.map((fields, index): APIEmbed => {
    const embed: APIEmbed = {
      color: 0xf5b642,
      fields,
      footer: { text: footerText },
      url: `${PLAYER_STATS_STATE_URL_PREFIX}${state.xboxXuid}`,
    };

    if (index === 0) {
      embed.title = `${stats.Gamertag} - ${aggregationLabel}`;
      embed.description = `Leaderboard stats for ${windowLabel} (${queueLabel})`;
    }

    return embed;
  });

  return {
    embeds,
    components: createViewControls(state, queueOptions, resetAt),
  };
}

/**
 * Derives the current filter state from a rendered `/stats player` message, matching the
 * leaderboard's approach of reading state from the message itself rather than encoding it in
 * every control's custom ID. The window, aggregation, and queue are read from their selects'
 * currently-selected option; the target player has no select, so it is read from the embed URL.
 */
export function getPlayerStatsStateFromMessage(message: APIMessage): PlayerStatsViewState | null {
  const { components, embeds } = message;
  if (components == null) {
    return null;
  }

  const windowValue = getSelectedStringSelectValue(components, PLAYER_STATS_WINDOW_SELECT_CONTROL_ID);
  const aggregationValue = getSelectedStringSelectValue(components, PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID);
  const queueValue = getSelectedStringSelectValue(components, PLAYER_STATS_QUEUE_SELECT_CONTROL_ID);
  const xboxXuid = getXboxXuidFromEmbedUrl(embeds);

  const window = windowValue == null ? null : parseLeaderboardWindow(windowValue);
  const aggregation = aggregationValue == null ? null : parseLeaderboardAggregation(aggregationValue);
  const relationshipMetric = aggregationValue == null ? null : parsePlayerStatsRelationshipMetric(aggregationValue);
  if (window == null || (aggregation == null && relationshipMetric == null) || xboxXuid == null) {
    return null;
  }

  const state = {
    xboxXuid,
    // Absent when the queue selector is hidden (player has played at most one configured queue and
    // the view was scoped to "all queues").
    queueChannelId: queueValue == null || queueValue === ALL_QUEUES_VALUE ? null : queueValue,
    window,
  };
  if (aggregation != null) {
    return { ...state, aggregation, relationshipMetric: null };
  }

  if (relationshipMetric != null) {
    return { ...state, aggregation: null, relationshipMetric };
  }

  return null;
}
