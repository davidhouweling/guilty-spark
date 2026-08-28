import type {
  APIEmbed,
  APIMessageTopLevelComponent,
  RESTPostAPIChannelMessageJSONBody,
  APISelectMenuOption,
} from "discord-api-types/v10";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import {
  LeaderboardMetricAggregation,
  LeaderboardMetric,
  LeaderboardWindow,
  getLeaderboardMetricAggregation,
  getLeaderboardMetricFamiliesForAggregation,
  getLeaderboardMetricAggregationLabel,
  getLeaderboardMetricFamily,
  getLeaderboardMetricFamilyLabel,
  getLeaderboardObjectiveDescriptorByMetric,
  isObjectiveLeaderboardMetric,
} from "@guilty-spark/shared/halo/leaderboard";
import { getDurationInIsoString, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import type { LeaderboardMetricFamily } from "@guilty-spark/shared/halo/leaderboard";
import { EmbedColors } from "../../embeds/colors";

const MAX_ROWS_IN_DISCORD_EMBED = 10;
export const LEADERBOARD_TEMPORARY_ERROR_FOOTER = "Temporary leaderboard error";

export const LEADERBOARD_FIRST_PAGE_CONTROL_ID = "btn_leaderboard_first";
export const LEADERBOARD_PREV_PAGE_CONTROL_ID = "btn_leaderboard_prev";
export const LEADERBOARD_REFRESH_CONTROL_ID = "btn_leaderboard_refresh";
export const LEADERBOARD_NEXT_PAGE_CONTROL_ID = "btn_leaderboard_next";
export const LEADERBOARD_LAST_PAGE_CONTROL_ID = "btn_leaderboard_last";
export const LEADERBOARD_METRIC_FAMILY_SELECT_CONTROL_ID = "select_leaderboard_metric_family";
export const LEADERBOARD_METRIC_AGGREGATION_SELECT_CONTROL_ID = "select_leaderboard_metric_aggregation";
export const LEADERBOARD_WINDOW_SELECT_CONTROL_ID = "select_leaderboard_window";

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

function getMetricFamilySelectOptions(
  aggregation: LeaderboardMetricAggregation,
  selectedFamily: LeaderboardMetricFamily,
): APISelectMenuOption[] {
  return getLeaderboardMetricFamiliesForAggregation(aggregation).map((family) => ({
    label: getLeaderboardMetricFamilyLabel(family),
    value: family,
    default: family === selectedFamily,
  }));
}

function getMetricAggregationSelectOptions(
  selectedAggregation: LeaderboardMetricAggregation | null,
): APISelectMenuOption[] {
  const resolvedSelectedAggregation = selectedAggregation ?? LeaderboardMetricAggregation.Total;

  return Object.values(LeaderboardMetricAggregation).map((aggregation) => ({
    label: getLeaderboardMetricAggregationLabel(aggregation),
    value: aggregation,
    default: aggregation === resolvedSelectedAggregation,
  }));
}

function getWindowSelectOptions(selectedWindow: LeaderboardWindow, resetAt: number | null): APISelectMenuOption[] {
  const windowOptions = [
    { label: "1 week", value: LeaderboardWindow.OneWeek },
    { label: "1 month", value: LeaderboardWindow.OneMonth },
    { label: "3 months", value: LeaderboardWindow.ThreeMonths },
    { label: "6 months", value: LeaderboardWindow.SixMonths },
    { label: "12 months", value: LeaderboardWindow.TwelveMonths },
  ];

  const options =
    resetAt == null
      ? windowOptions
      : [
          {
            label: `Last reset - ${new Date(resetAt * 1000).toISOString().slice(0, 10)}`,
            value: LeaderboardWindow.LastReset,
          },
          ...windowOptions,
        ];

  return options.map((option) => ({
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

function getWindowLabel(window: LeaderboardWindow, resetTimestamp: string | null): string {
  switch (window) {
    case LeaderboardWindow.LastReset: {
      if (resetTimestamp == null) {
        throw new Error("Reset timestamp is required for Last reset window");
      }
      return `Since ${resetTimestamp}`;
    }
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
  if (isObjectiveLeaderboardMetric(metric)) {
    const descriptor = getLeaderboardObjectiveDescriptorByMetric(metric);
    return metric === descriptor.averageMetric ? `${descriptor.label} (avg)` : descriptor.label;
  }

  switch (metric) {
    case LeaderboardMetric.SeriesPlayed: {
      return "Series played";
    }
    case LeaderboardMetric.SeriesWins: {
      return "Series wins";
    }
    case LeaderboardMetric.SeriesWinRate: {
      return "Series win rate";
    }
    case LeaderboardMetric.GamesPlayed: {
      return "Games played";
    }
    case LeaderboardMetric.GameWins: {
      return "Game wins";
    }
    case LeaderboardMetric.MedalPoints: {
      return "Medals by points";
    }
    case LeaderboardMetric.AvgMedalPointsPerSeries: {
      return "Avg medal points per series";
    }
    case LeaderboardMetric.AvgMedalPointsPerGame: {
      return "Avg medal points per game";
    }
    case LeaderboardMetric.MythicMedals: {
      return "Mythic medals";
    }
    case LeaderboardMetric.AvgMythicMedalsPerSeries: {
      return "Avg mythic medals per series";
    }
    case LeaderboardMetric.AvgMythicMedalsPerGame: {
      return "Avg mythic medals per game";
    }
    case LeaderboardMetric.ObjectiveTime: {
      return "Objective time";
    }
    case LeaderboardMetric.AvgObjectiveTimePerGame: {
      return "Avg objective time per game";
    }
    case LeaderboardMetric.ObjectiveTeamContribution: {
      return "Team objective contribution";
    }
    case LeaderboardMetric.ObjectiveGameContribution: {
      return "Game objective contribution";
    }
    case LeaderboardMetric.GamesWinRate: {
      return "Games win rate";
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
    case LeaderboardMetric.HeadshotKills: {
      return "Headshot kills";
    }
    case LeaderboardMetric.ShotsHit: {
      return "Shots hit";
    }
    case LeaderboardMetric.ShotsFired: {
      return "Shots fired";
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
    case LeaderboardMetric.AvgLifeSeconds: {
      return "Avg life time";
    }
    case LeaderboardMetric.AvgDamagePerLife: {
      return "Avg damage per life";
    }
    case LeaderboardMetric.PersonalScore: {
      return "Personal score";
    }
    case LeaderboardMetric.AvgPersonalScorePerSeries: {
      return "Avg personal score per series";
    }
    case LeaderboardMetric.AvgKillsPerSeries: {
      return "Avg kills per series";
    }
    case LeaderboardMetric.AvgDeathsPerSeries: {
      return "Avg deaths per series";
    }
    case LeaderboardMetric.AvgAssistsPerSeries: {
      return "Avg assists per series";
    }
    case LeaderboardMetric.AvgHeadshotKillsPerSeries: {
      return "Avg headshot kills per series";
    }
    case LeaderboardMetric.AvgShotsHitPerSeries: {
      return "Avg shots hit per series";
    }
    case LeaderboardMetric.AvgShotsFiredPerSeries: {
      return "Avg shots fired per series";
    }
    case LeaderboardMetric.AvgDamageDealtPerSeries: {
      return "Avg damage dealt per series";
    }
    case LeaderboardMetric.AvgDamageTakenPerSeries: {
      return "Avg damage taken per series";
    }
    case LeaderboardMetric.AvgPersonalScorePerGame: {
      return "Avg personal score per game";
    }
    case LeaderboardMetric.AvgKillsPerGame: {
      return "Avg kills per game";
    }
    case LeaderboardMetric.AvgDeathsPerGame: {
      return "Avg deaths per game";
    }
    case LeaderboardMetric.AvgAssistsPerGame: {
      return "Avg assists per game";
    }
    case LeaderboardMetric.AvgHeadshotKillsPerGame: {
      return "Avg headshot kills per game";
    }
    case LeaderboardMetric.AvgShotsHitPerGame: {
      return "Avg shots hit per game";
    }
    case LeaderboardMetric.AvgShotsFiredPerGame: {
      return "Avg shots fired per game";
    }
    case LeaderboardMetric.AvgDamageDealtPerGame: {
      return "Avg damage dealt per game";
    }
    case LeaderboardMetric.AvgDamageTakenPerGame: {
      return "Avg damage taken per game";
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

function formatMetricValue(
  metricValue: number,
  metric: LeaderboardMetric,
  row: LeaderboardResponse["rows"][number],
  locale: string,
): string {
  const pluralRules = new Intl.PluralRules(locale);
  const formatCount = (value: number, singularLabel: string, pluralLabel: string): string => {
    const roundedValue = Math.round(value);
    const label = pluralRules.select(Math.abs(roundedValue)) === "one" ? singularLabel : pluralLabel;
    return `${roundedValue.toLocaleString(locale)} ${label}`;
  };

  if (isObjectiveLeaderboardMetric(metric)) {
    const descriptor = getLeaderboardObjectiveDescriptorByMetric(metric);
    const games = formatCount(row.objectiveGamesPlayed, "game", "games");
    if (metric === descriptor.averageMetric) {
      const average = metricValue.toLocaleString(locale, { maximumFractionDigits: 2 });
      return `${average} avg/game (${games})`;
    }

    return `${Math.round(metricValue).toLocaleString(locale)} ${descriptor.unit} (${games})`;
  }

  switch (metric) {
    case LeaderboardMetric.SeriesWinRate: {
      return `${(metricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}% (${row.seriesWins.toLocaleString(locale)}/${row.seriesPlayed.toLocaleString(locale)})`;
    }
    case LeaderboardMetric.GamesWinRate: {
      return `${(metricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}% (${row.gameWins.toLocaleString(locale)}/${row.gamesPlayed.toLocaleString(locale)})`;
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
    case LeaderboardMetric.AvgPersonalScorePerGame:
    case LeaderboardMetric.AvgKillsPerGame:
    case LeaderboardMetric.AvgDeathsPerGame:
    case LeaderboardMetric.AvgAssistsPerGame:
    case LeaderboardMetric.AvgHeadshotKillsPerGame:
    case LeaderboardMetric.AvgShotsHitPerGame:
    case LeaderboardMetric.AvgShotsFiredPerGame:
    case LeaderboardMetric.AvgDamageDealtPerGame:
    case LeaderboardMetric.AvgDamageTakenPerGame: {
      return metricValue.toLocaleString(locale, { maximumFractionDigits: 2 });
    }
    case LeaderboardMetric.SeriesPlayed:
    case LeaderboardMetric.SeriesWins:
    case LeaderboardMetric.GamesPlayed:
    case LeaderboardMetric.GameWins: {
      return Math.round(metricValue).toLocaleString(locale);
    }
    case LeaderboardMetric.MedalPoints: {
      return `${formatCount(metricValue, "point", "points")} (${formatCount(row.medalCount, "medal", "medals")})`;
    }
    case LeaderboardMetric.AvgMedalPointsPerSeries:
    case LeaderboardMetric.AvgMedalPointsPerGame: {
      return `${metricValue.toLocaleString(locale, { maximumFractionDigits: 2 })} points`;
    }
    case LeaderboardMetric.MythicMedals: {
      const mythicLabel = pluralRules.select(Math.abs(Math.round(metricValue))) === "one" ? "medal" : "medals";
      return formatCount(metricValue, "mythic medal", `mythic ${mythicLabel}`);
    }
    case LeaderboardMetric.AvgMythicMedalsPerSeries:
    case LeaderboardMetric.AvgMythicMedalsPerGame: {
      return `${metricValue.toLocaleString(locale, { maximumFractionDigits: 2 })} mythic medals`;
    }
    case LeaderboardMetric.ObjectiveTime: {
      const total = getReadableDuration(getDurationInIsoString(row.objectiveTimeSeconds), locale);
      return `${total} total (${formatCount(row.objectiveGamesPlayed, "game", "games")})`;
    }
    case LeaderboardMetric.AvgObjectiveTimePerGame: {
      const average = getReadableDuration(getDurationInIsoString(metricValue), locale);
      const total = getReadableDuration(getDurationInIsoString(row.objectiveTimeSeconds), locale);
      return `${average} avg/game (${total} total, ${formatCount(row.objectiveGamesPlayed, "game", "games")})`;
    }
    case LeaderboardMetric.ObjectiveTeamContribution:
    case LeaderboardMetric.ObjectiveGameContribution: {
      const percentage = (metricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 });
      return `${percentage}% avg/game (${formatCount(row.objectiveGamesPlayed, "game", "games")})`;
    }
    case LeaderboardMetric.Kills:
    case LeaderboardMetric.Deaths:
    case LeaderboardMetric.Assists:
    case LeaderboardMetric.HeadshotKills:
    case LeaderboardMetric.ShotsHit:
    case LeaderboardMetric.ShotsFired:
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
      value: rows.map((row) => formatMetricValue(row.metricValue, metric, row, locale)).join("\n"),
      inline: true,
    },
  ];
}

function createComponents(leaderboard: LeaderboardResponse): APIMessageTopLevelComponent[] {
  const totalPages = Math.max(1, Math.ceil(leaderboard.total / leaderboard.pageSize));
  const selectedFamily = getLeaderboardMetricFamily(leaderboard.metric);
  const selectedAggregation = getLeaderboardMetricAggregation(leaderboard.metric);
  const familyOptions = getMetricFamilySelectOptions(selectedAggregation, selectedFamily);
  const aggregationOptions = getMetricAggregationSelectOptions(selectedAggregation);
  const windowOptions = getWindowSelectOptions(leaderboard.window, leaderboard.resetAt ?? null);
  const controls = [
    [LEADERBOARD_FIRST_PAGE_CONTROL_ID, "⏮️", leaderboard.page <= 1],
    [LEADERBOARD_PREV_PAGE_CONTROL_ID, "◀️", leaderboard.page <= 1],
    [LEADERBOARD_REFRESH_CONTROL_ID, "🔄", false],
    [LEADERBOARD_NEXT_PAGE_CONTROL_ID, "▶️", leaderboard.page >= totalPages],
    [LEADERBOARD_LAST_PAGE_CONTROL_ID, "⏭️", leaderboard.page >= totalPages],
  ] as const;

  const rows: APIMessageTopLevelComponent[] = [
    {
      type: ComponentType.ActionRow,
      components: controls.map(([controlId, emoji, disabled]) => ({
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        custom_id: controlId,
        emoji: { name: emoji },
        disabled,
      })),
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: LEADERBOARD_METRIC_AGGREGATION_SELECT_CONTROL_ID,
          placeholder: "Select type",
          min_values: 1,
          max_values: 1,
          options: aggregationOptions,
        },
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: LEADERBOARD_METRIC_FAMILY_SELECT_CONTROL_ID,
          placeholder: "Select stat",
          min_values: 1,
          max_values: 1,
          options: familyOptions,
        },
      ],
    },
  ];

  rows.push({
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.StringSelect,
        custom_id: LEADERBOARD_WINDOW_SELECT_CONTROL_ID,
        placeholder: "Select window",
        min_values: 1,
        max_values: 1,
        options: windowOptions,
      },
    ],
  });

  return rows;
}

export function createLeaderboardResponse(
  locale: string,
  leaderboard: LeaderboardResponse,
  updatedTimestamp: string,
  locked = false,
  resetTimestamp: string | null = null,
): RESTPostAPIChannelMessageJSONBody {
  const rows = leaderboard.rows.slice(0, MAX_ROWS_IN_DISCORD_EMBED);
  const totalPages = Math.max(1, Math.ceil(leaderboard.total / leaderboard.pageSize));
  const metricLabel = getMetricLabel(leaderboard.metric);
  const windowLabel = getWindowLabel(leaderboard.window, resetTimestamp);
  const scopeLabel =
    leaderboard.queueChannelId != null ? `Queue <#${leaderboard.queueChannelId}>` : "Server-wide (all queues)";

  return {
    embeds: [
      {
        color: EmbedColors.GOLD,
        title: `Leaderboard - ${scopeLabel}`,
        description: `Metric: ${metricLabel} | Window: ${windowLabel}\n-# Updated: ${updatedTimestamp}`,
        fields: createRankingFields(rows, leaderboard.total, leaderboard.metric, locale),
        footer: {
          text: `Page ${leaderboard.page.toString()} of ${totalPages.toString()} | Min games: ${leaderboard.minGamesPlayed.toString()} | Total players: ${leaderboard.total.toString()}`,
        },
      },
    ],
    ...(locked ? {} : { components: createComponents(leaderboard) }),
  };
}
