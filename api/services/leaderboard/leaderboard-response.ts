import type {
  APIEmbed,
  APIMessageTopLevelComponent,
  RESTPostAPIChannelMessageJSONBody,
  APISelectMenuOption,
} from "discord-api-types/v10";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { EmbedColors } from "../../embeds/colors";

const MAX_ROWS_IN_DISCORD_EMBED = 10;
const METRIC_SELECT_LIMIT = 25;

export const LEADERBOARD_FIRST_PAGE_CONTROL_ID = "btn_leaderboard_first";
export const LEADERBOARD_PREV_PAGE_CONTROL_ID = "btn_leaderboard_prev";
export const LEADERBOARD_REFRESH_CONTROL_ID = "btn_leaderboard_refresh";
export const LEADERBOARD_NEXT_PAGE_CONTROL_ID = "btn_leaderboard_next";
export const LEADERBOARD_LAST_PAGE_CONTROL_ID = "btn_leaderboard_last";
export const LEADERBOARD_METRIC_SELECT_CONTROL_ID = "select_leaderboard_metric";
export const LEADERBOARD_WINDOW_SELECT_CONTROL_ID = "select_leaderboard_window";

function createLeaderboardControlId(controlId: string, leaderboard: LeaderboardResponse): string {
  const queueChannelId = leaderboard.queueChannelId ?? "-";
  return [
    controlId,
    leaderboard.guildId,
    queueChannelId,
    leaderboard.window,
    leaderboard.metric,
    leaderboard.page.toString(36),
    leaderboard.minGamesPlayed.toString(36),
  ].join(":");
}

function formatRank(rank: number): string {
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

function getMetricSelectOptions(selectedMetric: LeaderboardMetric): APISelectMenuOption[] {
  const metricOptions = [
    { label: "Series win rate", value: LeaderboardMetric.SeriesWinRate },
    { label: "Kills", value: LeaderboardMetric.Kills },
    { label: "Deaths", value: LeaderboardMetric.Deaths },
    { label: "Assists", value: LeaderboardMetric.Assists },
    { label: "KDA", value: LeaderboardMetric.Kda },
    { label: "Accuracy", value: LeaderboardMetric.Accuracy },
    { label: "Damage dealt", value: LeaderboardMetric.DamageDealt },
    { label: "Damage taken", value: LeaderboardMetric.DamageTaken },
    { label: "Damage ratio", value: LeaderboardMetric.DamageRatio },
    { label: "Personal score", value: LeaderboardMetric.PersonalScore },
  ];

  return metricOptions.slice(0, METRIC_SELECT_LIMIT).map((option) => ({
    ...option,
    default: option.value === selectedMetric,
  }));
}

function getWindowSelectOptions(selectedWindow: LeaderboardWindow): APISelectMenuOption[] {
  const windowOptions = [
    { label: "1 week", value: LeaderboardWindow.OneWeek },
    { label: "1 month", value: LeaderboardWindow.OneMonth },
    { label: "3 months", value: LeaderboardWindow.ThreeMonths },
    { label: "6 months", value: LeaderboardWindow.SixMonths },
    { label: "12 months", value: LeaderboardWindow.TwelveMonths },
  ];

  return windowOptions.map((option) => ({
    ...option,
    default: option.value === selectedWindow,
  }));
}

function getRankingContent(rankingLines: string[], totalPlayers: number): string {
  if (rankingLines.length > 0) {
    return rankingLines.join("\n");
  }

  if (totalPlayers === 0) {
    return "No players qualify for this filter yet.";
  }

  return "No players found on this page. Try a lower page number.";
}

function getWindowLabel(window: LeaderboardWindow): string {
  switch (window) {
    case LeaderboardWindow.OneWeek: {
      return "1 week";
    }
    case LeaderboardWindow.OneMonth: {
      return "1 month";
    }
    case LeaderboardWindow.ThreeMonths: {
      return "3 months";
    }
    case LeaderboardWindow.SixMonths: {
      return "6 months";
    }
    case LeaderboardWindow.TwelveMonths: {
      return "12 months";
    }
    default: {
      throw new UnreachableError(window);
    }
  }
}

function getMetricLabel(metric: LeaderboardMetric): string {
  switch (metric) {
    case LeaderboardMetric.SeriesWinRate: {
      return "Series win rate";
    }
    case LeaderboardMetric.Kills: {
      return "Kills";
    }
    case LeaderboardMetric.Deaths: {
      return "Deaths";
    }
    case LeaderboardMetric.Assists: {
      return "Assists";
    }
    case LeaderboardMetric.Kda: {
      return "KDA";
    }
    case LeaderboardMetric.Accuracy: {
      return "Accuracy";
    }
    case LeaderboardMetric.DamageDealt: {
      return "Damage dealt";
    }
    case LeaderboardMetric.DamageTaken: {
      return "Damage taken";
    }
    case LeaderboardMetric.DamageRatio: {
      return "Damage ratio";
    }
    case LeaderboardMetric.PersonalScore: {
      return "Personal score";
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

function formatMetricValue(metricValue: number, metric: LeaderboardMetric, locale: string): string {
  switch (metric) {
    case LeaderboardMetric.SeriesWinRate: {
      return `${(metricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
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
    case LeaderboardMetric.Kills:
    case LeaderboardMetric.Deaths:
    case LeaderboardMetric.Assists:
    case LeaderboardMetric.DamageDealt:
    case LeaderboardMetric.DamageTaken:
    case LeaderboardMetric.PersonalScore: {
      return Math.round(metricValue).toLocaleString(locale);
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

function createRankingFields(
  rows: LeaderboardResponse["rows"],
  totalPlayers: number,
  metric: LeaderboardMetric,
  locale: string,
): NonNullable<APIEmbed["fields"]> {
  if (rows.length === 0) {
    return [{ name: "Rankings", value: getRankingContent([], totalPlayers), inline: false }];
  }

  return [
    { name: "Rank", value: rows.map((row) => formatRank(row.rank)).join("\n"), inline: true },
    {
      name: "Player",
      value: rows
        .map((row) => (row.discordUserId != null ? `<@${row.discordUserId}> (${row.gamertag})` : row.gamertag))
        .join("\n"),
      inline: true,
    },
    {
      name: getMetricLabel(metric),
      value: rows.map((row) => formatMetricValue(row.metricValue, metric, locale)).join("\n"),
      inline: true,
    },
  ];
}

function createComponents(leaderboard: LeaderboardResponse): APIMessageTopLevelComponent[] {
  const totalPages = Math.max(1, Math.ceil(leaderboard.total / leaderboard.pageSize));
  const metricOptions = getMetricSelectOptions(leaderboard.metric);
  const windowOptions = getWindowSelectOptions(leaderboard.window);
  const controls = [
    [LEADERBOARD_FIRST_PAGE_CONTROL_ID, "⏮️", leaderboard.page <= 1],
    [LEADERBOARD_PREV_PAGE_CONTROL_ID, "◀️", leaderboard.page <= 1],
    [LEADERBOARD_REFRESH_CONTROL_ID, "🔄", false],
    [LEADERBOARD_NEXT_PAGE_CONTROL_ID, "▶️", leaderboard.page >= totalPages],
    [LEADERBOARD_LAST_PAGE_CONTROL_ID, "⏭️", leaderboard.page >= totalPages],
  ] as const;

  return [
    {
      type: ComponentType.ActionRow,
      components: controls.map(([controlId, emoji, disabled]) => ({
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        custom_id: createLeaderboardControlId(controlId, leaderboard),
        emoji: { name: emoji },
        disabled,
      })),
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: createLeaderboardControlId(LEADERBOARD_METRIC_SELECT_CONTROL_ID, leaderboard),
          placeholder: "Select metric",
          min_values: 1,
          max_values: 1,
          options: metricOptions,
        },
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: createLeaderboardControlId(LEADERBOARD_WINDOW_SELECT_CONTROL_ID, leaderboard),
          placeholder: "Select window",
          min_values: 1,
          max_values: 1,
          options: windowOptions,
        },
      ],
    },
  ];
}

export function createLeaderboardResponse(
  locale: string,
  leaderboard: LeaderboardResponse,
): RESTPostAPIChannelMessageJSONBody {
  const rows = leaderboard.rows.slice(0, MAX_ROWS_IN_DISCORD_EMBED);
  const totalPages = Math.max(1, Math.ceil(leaderboard.total / leaderboard.pageSize));
  const metricLabel = getMetricLabel(leaderboard.metric);
  const windowLabel = getWindowLabel(leaderboard.window);
  const scopeLabel =
    leaderboard.queueChannelId != null ? `Queue <#${leaderboard.queueChannelId}>` : "Server-wide (all queues)";

  return {
    embeds: [
      {
        color: EmbedColors.GOLD,
        title: `Leaderboard - ${scopeLabel}`,
        description: `Metric: ${metricLabel} | Window: ${windowLabel}`,
        fields: createRankingFields(rows, leaderboard.total, leaderboard.metric, locale),
        footer: {
          text: `Page ${leaderboard.page.toString()} of ${totalPages.toString()} | Min games: ${leaderboard.minGamesPlayed.toString()} | Total players: ${leaderboard.total.toString()}`,
        },
      },
    ],
    components: createComponents(leaderboard),
  };
}
