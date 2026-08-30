import type {
  APIEmbed,
  APIEmbedField,
  APIMessage,
  APIMessageTopLevelComponent,
  APISelectMenuOption,
} from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { GameVariantCategory } from "halo-infinite-api";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import {
  LeaderboardMetric,
  LeaderboardMetricAggregation,
  LeaderboardWindow,
  getLeaderboardMetricAggregationLabel,
  getLeaderboardMetricFamiliesForAggregation,
  getLeaderboardObjectiveDescriptorByMetric,
  resolveLeaderboardMetric,
  isObjectiveLeaderboardMetric,
} from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardPlayerStatsRow } from "../../services/database/types/leaderboard_player_stats";
import type { LeaderboardPlayerMetricRank } from "../../services/database/types/leaderboard_player_metric_rank";
import { formatMetricValue, formatRank, getMetricLabel } from "../../services/leaderboard/leaderboard-response";

export const PLAYER_STATS_QUEUE_SELECT_CONTROL_ID = "stats_player_queue";
export const PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID = "stats_player_aggregation";
export const PLAYER_STATS_WINDOW_SELECT_CONTROL_ID = "stats_player_window";
export const PLAYER_STATS_TEMPORARY_ERROR_FOOTER = "Temporary player stats error";

const ALL_QUEUES_VALUE = "-";
const DISCORD_EMBED_FIELD_VALUE_LIMIT = 1024;
const PLAYER_STATS_STATE_URL_PREFIX = "https://guilty-spark.app/stats/player/";

export interface PlayerStatsQueueOption {
  label: string;
  value: string | null;
}

export interface PlayerStatsViewState {
  aggregation: LeaderboardMetricAggregation;
  xboxXuid: string;
  queueChannelId: string | null;
  window: LeaderboardWindow;
}

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

function createQueueSelectOptions(
  queueOptions: readonly PlayerStatsQueueOption[],
  selectedQueueChannelId: string | null,
): APISelectMenuOption[] {
  return queueOptions.map((option) => ({
    label: option.label,
    value: option.value ?? ALL_QUEUES_VALUE,
    default: option.value === selectedQueueChannelId,
  }));
}

function createAggregationSelectOptions(selectedAggregation: LeaderboardMetricAggregation): APISelectMenuOption[] {
  return Object.values(LeaderboardMetricAggregation).map((aggregation) => ({
    label: getLeaderboardMetricAggregationLabel(aggregation),
    value: aggregation,
    default: aggregation === selectedAggregation,
  }));
}

function createWindowSelectOptions(selectedWindow: LeaderboardWindow, resetAt: number | null): APISelectMenuOption[] {
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

function createViewControls(
  state: PlayerStatsViewState,
  queueOptions: readonly PlayerStatsQueueOption[],
  resetAt: number | null,
): APIMessageTopLevelComponent[] {
  const controls: APIMessageTopLevelComponent[] = [];

  if (queueOptions.length > 2) {
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
          options: createAggregationSelectOptions(state.aggregation),
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

// Objective counters are tracked per game mode; the games-played denominator must match the mode
// the metric belongs to, not the player's overall objective-game count.
function getObjectiveGamesPlayedForMetric(stats: LeaderboardPlayerStatsRow, metric: LeaderboardMetric): number {
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

function hasObjectiveSpecificPopulation(metric: LeaderboardMetric): boolean {
  return isObjectiveLeaderboardMetric(metric);
}

function getRankText(
  metric: LeaderboardMetric,
  rank: LeaderboardPlayerMetricRank | null,
  overallTotalPlayers: number,
): string {
  if (rank == null) {
    return "Unranked";
  }

  const rankText = formatRank(rank.rank);
  return hasObjectiveSpecificPopulation(metric) && rank.total !== overallTotalPlayers
    ? `${rankText} / ${rank.total.toString()}`
    : rankText;
}

function buildStatTableRow(
  stats: LeaderboardPlayerStatsRow,
  metric: LeaderboardMetric,
  rank: LeaderboardPlayerMetricRank | null,
  overallTotalPlayers: number,
  locale: string,
): PlayerStatTableRow {
  const metricValue = getStatsMetricValue(stats, metric);
  const formatRow: LeaderboardResponse["rows"][number] = {
    rank: rank?.rank ?? 0,
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

  return {
    label: getMetricLabel(metric),
    rankText: getRankText(metric, rank, overallTotalPlayers),
    valueText: formatMetricValue(metricValue, metric, formatRow, locale),
  };
}

function createFooterText(minGamesPlayed: number, totalPlayers: number, locale: string): string {
  return `Min games: ${minGamesPlayed.toString()} | Total players: ${totalPlayers.toLocaleString(locale)}`;
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
      return state.aggregation;
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
        if (selectedValue == null) {
          return component;
        }

        return {
          ...component,
          options: component.options.map((option) => ({ ...option, default: option.value === selectedValue })),
        };
      }),
    };
  });
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

    while (rowIndex < rows.length) {
      const row = rows[rowIndex];
      if (row == null || !canAppendRow(fieldValues, row)) {
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
  state: PlayerStatsViewState;
  locale: string;
  queueLabel: string;
  queueOptions: readonly PlayerStatsQueueOption[];
  resetAt: number | null;
  minGamesPlayed: number;
}): { embeds: APIEmbed[]; components: APIMessageTopLevelComponent[] } {
  const windowLabel = state.window === LeaderboardWindow.LastReset ? "Last reset" : state.window;
  const metrics = getPlayerStatsMetricsForAggregation(state.aggregation);
  const overallTotalPlayers = ranks.get(LeaderboardMetric.GamesPlayed)?.total ?? 0;
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
  if (window == null || aggregation == null || xboxXuid == null) {
    return null;
  }

  return {
    aggregation,
    xboxXuid,
    // Absent when the queue selector is hidden (player has played in at most one configured queue).
    queueChannelId: queueValue == null || queueValue === ALL_QUEUES_VALUE ? null : queueValue,
    window,
  };
}
