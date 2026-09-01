import type { APIEmbed, APIEmbedField, APIMessage, APIMessageTopLevelComponent } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import {
  LeaderboardMetric,
  LeaderboardMetricAggregation,
  LeaderboardWindow,
  getLeaderboardMetricAggregationLabel,
  getLeaderboardMetricFamily,
  getLeaderboardMetricFamilyLabel,
} from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardPlayerStatsRow } from "../../services/database/types/leaderboard_player_stats";
import type { LeaderboardPlayerMetricRank } from "../../services/database/types/leaderboard_player_metric_rank";
import { formatMetricValue } from "../../services/leaderboard/leaderboard-response";
import type { PlayerStatsQueueOption } from "./player-stats-embed";
import {
  ALL_QUEUES_VALUE,
  createQueueSelectOptions,
  createWindowSelectOptions,
  getPlayerStatsMetricsForAggregation,
  getPlayerStatsMetricValue,
  getRankText,
  hasObjectiveSpecificPopulation,
} from "./player-stats-embed";

export const PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID = "stats_compare_queue";
export const PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID = "stats_compare_aggregation";
export const PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID = "stats_compare_window";
export const PLAYER_COMPARE_TEMPORARY_ERROR_FOOTER = "Temporary player compare error";

const DISCORD_EMBED_FIELD_VALUE_LIMIT = 1024;
const PLAYER_COMPARE_STATE_URL_PREFIX = "https://guilty-spark.app/stats/compare/";

const LEADERBOARD_AGGREGATION_BY_VALUE = new Map<string, LeaderboardMetricAggregation>(
  Object.values(LeaderboardMetricAggregation).map((aggregation) => [aggregation, aggregation]),
);
const LEADERBOARD_WINDOW_BY_VALUE = new Map<string, LeaderboardWindow>(
  Object.values(LeaderboardWindow).map((window) => [window, window]),
);

export interface PlayerCompareViewState {
  xboxXuid1: string;
  xboxXuid2: string;
  queueChannelId: string | null;
  window: LeaderboardWindow;
  aggregation: LeaderboardMetricAggregation;
}

interface PlayerCompareTableRow {
  label: string;
  value1Text: string;
  value2Text: string;
}

export function parsePlayerCompareAggregation(value: string): LeaderboardMetricAggregation | null {
  return LEADERBOARD_AGGREGATION_BY_VALUE.get(value) ?? null;
}

function getCompareValueText(
  stats: LeaderboardPlayerStatsRow,
  metric: LeaderboardMetric,
  rank: LeaderboardPlayerMetricRank | null,
  overallTotalPlayers: number | null,
  locale: string,
): string {
  const { metricValue, formatRow } = getPlayerStatsMetricValue(stats, metric);
  if (hasObjectiveSpecificPopulation(metric) && formatRow.objectiveGamesPlayed === 0) {
    return "n/a";
  }

  const rankText = getRankText(metric, rank, overallTotalPlayers);
  const valueText = formatMetricValue(metricValue, metric, formatRow, locale);
  return `${rankText} | ${valueText}`;
}

function buildCompareTableRow(
  stats1: LeaderboardPlayerStatsRow,
  stats2: LeaderboardPlayerStatsRow,
  ranks1: ReadonlyMap<LeaderboardMetric, LeaderboardPlayerMetricRank | null>,
  ranks2: ReadonlyMap<LeaderboardMetric, LeaderboardPlayerMetricRank | null>,
  overallTotalPlayers: number | null,
  metric: LeaderboardMetric,
  locale: string,
): PlayerCompareTableRow {
  return {
    label: getLeaderboardMetricFamilyLabel(getLeaderboardMetricFamily(metric)),
    value1Text: getCompareValueText(stats1, metric, ranks1.get(metric) ?? null, overallTotalPlayers, locale),
    value2Text: getCompareValueText(stats2, metric, ranks2.get(metric) ?? null, overallTotalPlayers, locale),
  };
}

function appendFieldValue(currentValue: string, nextValue: string): string {
  return currentValue.length === 0 ? nextValue : `${currentValue}\n${nextValue}`;
}

function canAppendRow(fieldValues: readonly string[], row: PlayerCompareTableRow): boolean {
  const nextValues = [row.label, row.value1Text, row.value2Text];

  return nextValues.every((nextValue, index) => {
    const currentValue = fieldValues[index] ?? "";
    return appendFieldValue(currentValue, nextValue).length <= DISCORD_EMBED_FIELD_VALUE_LIMIT;
  });
}

function createCompareTableFields(
  rows: readonly PlayerCompareTableRow[],
  gamertag1: string,
  gamertag2: string,
): APIEmbedField[][] {
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
        fieldValues[1] = row.value1Text.slice(0, DISCORD_EMBED_FIELD_VALUE_LIMIT);
        fieldValues[2] = row.value2Text.slice(0, DISCORD_EMBED_FIELD_VALUE_LIMIT);
        rowIndex += 1;
        break;
      }

      if (!canAppendRow(fieldValues, row)) {
        break;
      }

      fieldValues[0] = appendFieldValue(fieldValues[0], row.label);
      fieldValues[1] = appendFieldValue(fieldValues[1], row.value1Text);
      fieldValues[2] = appendFieldValue(fieldValues[2], row.value2Text);
      rowIndex += 1;
    }

    fieldGroups.push([
      { name: "Stat", value: fieldValues[0] === "" ? "-" : fieldValues[0], inline: true },
      { name: gamertag1.slice(0, 256), value: fieldValues[1] === "" ? "-" : fieldValues[1], inline: true },
      { name: gamertag2.slice(0, 256), value: fieldValues[2] === "" ? "-" : fieldValues[2], inline: true },
    ]);
  }

  return fieldGroups;
}

function createCompareAggregationSelectOptions(selectedAggregation: LeaderboardMetricAggregation): {
  label: string;
  value: string;
  default: boolean;
}[] {
  return Object.values(LeaderboardMetricAggregation).map((aggregation) => ({
    label: getLeaderboardMetricAggregationLabel(aggregation),
    value: aggregation,
    default: aggregation === selectedAggregation,
  }));
}

function shouldShowCompareQueueSelect(
  state: PlayerCompareViewState,
  queueOptions: readonly PlayerStatsQueueOption[],
): boolean {
  return queueOptions.length > 1 || state.queueChannelId != null;
}

function createCompareViewControls(
  state: PlayerCompareViewState,
  queueOptions: readonly PlayerStatsQueueOption[],
  resetAt: number | null,
): APIMessageTopLevelComponent[] {
  const controls: APIMessageTopLevelComponent[] = [];

  if (shouldShowCompareQueueSelect(state, queueOptions)) {
    controls.push({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
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
          custom_id: PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID,
          placeholder: "Select type",
          min_values: 1,
          max_values: 1,
          options: createCompareAggregationSelectOptions(state.aggregation),
        },
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID,
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

function getCompareSelectedValueForState(controlId: string, state: PlayerCompareViewState): string | null {
  switch (controlId) {
    case PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID: {
      return state.queueChannelId ?? ALL_QUEUES_VALUE;
    }
    case PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID: {
      return state.aggregation;
    }
    case PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID: {
      return state.window;
    }
    default: {
      return null;
    }
  }
}

function createComponentsForCompareState(
  components: readonly APIMessageTopLevelComponent[],
  state: PlayerCompareViewState,
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

        const selectedValue = getCompareSelectedValueForState(component.custom_id, state);

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

function getXboxXuidsFromEmbedUrl(embeds: readonly APIEmbed[]): [string, string] | null {
  const url = embeds[0]?.url;
  if (url?.startsWith(PLAYER_COMPARE_STATE_URL_PREFIX) !== true) {
    return null;
  }

  const [xboxXuid1, xboxXuid2] = url.slice(PLAYER_COMPARE_STATE_URL_PREFIX.length).split("/");
  return xboxXuid1 == null || xboxXuid1 === "" || xboxXuid2 == null || xboxXuid2 === "" ? null : [xboxXuid1, xboxXuid2];
}

/**
 * Derives the current filter state from a rendered `/stats compare` message, matching the same
 * "read state from the message" approach used by `/stats player` rather than encoding it in every
 * control's custom ID. Both target players have no select, so they're read from the embed URL.
 */
export function getPlayerCompareStateFromMessage(message: APIMessage): PlayerCompareViewState | null {
  const { components, embeds } = message;
  if (components == null) {
    return null;
  }

  const windowValue = getSelectedStringSelectValue(components, PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID);
  const aggregationValue = getSelectedStringSelectValue(components, PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID);
  const queueValue = getSelectedStringSelectValue(components, PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID);
  const xboxXuids = getXboxXuidsFromEmbedUrl(embeds);

  const window = windowValue == null ? null : (LEADERBOARD_WINDOW_BY_VALUE.get(windowValue) ?? null);
  const aggregation = aggregationValue == null ? null : parsePlayerCompareAggregation(aggregationValue);
  if (window == null || aggregation == null || xboxXuids == null) {
    return null;
  }

  const [xboxXuid1, xboxXuid2] = xboxXuids;
  return {
    xboxXuid1,
    xboxXuid2,
    // Absent when the queue selector is hidden (both players have played at most one configured
    // queue and the view was scoped to "all queues").
    queueChannelId: queueValue == null || queueValue === ALL_QUEUES_VALUE ? null : queueValue,
    window,
    aggregation,
  };
}

export function createPlayerCompareEmbeds({
  stats1,
  stats2,
  ranks1,
  ranks2,
  state,
  locale,
  queueLabel,
  queueOptions,
  resetAt,
}: {
  stats1: LeaderboardPlayerStatsRow;
  stats2: LeaderboardPlayerStatsRow;
  ranks1: ReadonlyMap<LeaderboardMetric, LeaderboardPlayerMetricRank | null>;
  ranks2: ReadonlyMap<LeaderboardMetric, LeaderboardPlayerMetricRank | null>;
  state: PlayerCompareViewState;
  locale: string;
  queueLabel: string;
  queueOptions: readonly PlayerStatsQueueOption[];
  resetAt: number | null;
}): { embeds: APIEmbed[]; components: APIMessageTopLevelComponent[] } {
  const windowLabel = state.window === LeaderboardWindow.LastReset ? "Last reset" : state.window;
  const metrics = getPlayerStatsMetricsForAggregation(state.aggregation);
  const overallTotalPlayers = ranks1.get(LeaderboardMetric.GamesPlayed)?.total ?? null;
  const rows = metrics.map((metric) =>
    buildCompareTableRow(stats1, stats2, ranks1, ranks2, overallTotalPlayers, metric, locale),
  );
  const fieldGroups = createCompareTableFields(rows, stats1.Gamertag, stats2.Gamertag);
  const aggregationLabel = getLeaderboardMetricAggregationLabel(state.aggregation);
  const embeds = fieldGroups.map((fields, index): APIEmbed => {
    const embed: APIEmbed = {
      color: 0xf5b642,
      fields,
      url: `${PLAYER_COMPARE_STATE_URL_PREFIX}${state.xboxXuid1}/${state.xboxXuid2}`,
    };

    if (index === 0) {
      embed.title = `${stats1.Gamertag} vs ${stats2.Gamertag} - ${aggregationLabel}`;
      embed.description = `Leaderboard stats for ${windowLabel} (${queueLabel})`;
    }

    return embed;
  });

  return {
    embeds,
    components: createCompareViewControls(state, queueOptions, resetAt),
  };
}

export function createPlayerCompareLoadingResponse(
  message: APIMessage,
  state: PlayerCompareViewState,
): { embeds: APIEmbed[]; components: APIMessageTopLevelComponent[] } {
  const [existingEmbed] = message.embeds;

  return {
    embeds: [
      {
        color: 0xf5b642,
        title: existingEmbed?.title ?? "Player compare",
        description: "Updating stats...",
        footer: { text: "This may take a few seconds" },
        url: `${PLAYER_COMPARE_STATE_URL_PREFIX}${state.xboxXuid1}/${state.xboxXuid2}`,
      },
    ],
    components: createComponentsForCompareState(message.components ?? [], state, true),
  };
}

export function createPlayerCompareNoQualifyingGamesResponse(
  message: APIMessage,
  state: PlayerCompareViewState,
): { embeds: APIEmbed[]; components: APIMessageTopLevelComponent[] } {
  const [existingEmbed] = message.embeds;
  const windowLabel = state.window === LeaderboardWindow.LastReset ? "Last reset" : state.window;

  return {
    embeds: [
      {
        color: 0xf5b642,
        description: `No games played by one or both players in ${windowLabel} for the selected queue scope.`,
        footer: { text: "No games played" },
        title: existingEmbed?.title ?? "Player compare",
        url: `${PLAYER_COMPARE_STATE_URL_PREFIX}${state.xboxXuid1}/${state.xboxXuid2}`,
      },
    ],
    components: createComponentsForCompareState(message.components ?? [], state),
  };
}
