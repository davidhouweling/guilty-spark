import type { APIEmbed, APIMessage, APIMessageTopLevelComponent } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardPostRow } from "../database/types/leaderboard_post";

const LEADERBOARD_METRIC_SELECT = "select_leaderboard_metric";
const LEADERBOARD_WINDOW_SELECT = "select_leaderboard_window";
const LEADERBOARD_FOOTER_PATTERN = /^Page (\d+) of (\d+) \| Min games: (\d+) \| Total players: (\d+)$/;

const WINDOW_BY_VALUE = new Map<string, LeaderboardWindow>([
  [LeaderboardWindow.OneWeek, LeaderboardWindow.OneWeek],
  [LeaderboardWindow.OneMonth, LeaderboardWindow.OneMonth],
  [LeaderboardWindow.ThreeMonths, LeaderboardWindow.ThreeMonths],
  [LeaderboardWindow.SixMonths, LeaderboardWindow.SixMonths],
  [LeaderboardWindow.TwelveMonths, LeaderboardWindow.TwelveMonths],
]);
const METRIC_BY_VALUE = new Map<string, LeaderboardMetric>([
  [LeaderboardMetric.SeriesWinRate, LeaderboardMetric.SeriesWinRate],
  [LeaderboardMetric.Kills, LeaderboardMetric.Kills],
  [LeaderboardMetric.Deaths, LeaderboardMetric.Deaths],
  [LeaderboardMetric.Assists, LeaderboardMetric.Assists],
  [LeaderboardMetric.Kda, LeaderboardMetric.Kda],
  [LeaderboardMetric.Accuracy, LeaderboardMetric.Accuracy],
  [LeaderboardMetric.DamageDealt, LeaderboardMetric.DamageDealt],
  [LeaderboardMetric.DamageTaken, LeaderboardMetric.DamageTaken],
  [LeaderboardMetric.DamageRatio, LeaderboardMetric.DamageRatio],
  [LeaderboardMetric.PersonalScore, LeaderboardMetric.PersonalScore],
]);

export interface LeaderboardMessageState {
  guildId: string;
  queueChannelId: string | null;
  window: LeaderboardWindow;
  metric: LeaderboardMetric;
  page: number;
  minGamesPlayed: number;
}

function getSelectedValue(components: APIMessageTopLevelComponent[], prefix: string): string | null {
  for (const row of components) {
    if (row.type !== ComponentType.ActionRow) {
      continue;
    }

    for (const component of row.components) {
      if (component.type !== ComponentType.StringSelect || !component.custom_id.startsWith(prefix)) {
        continue;
      }

      const selectedOption = component.options.find((option) => option.default === true);
      return selectedOption?.value ?? null;
    }
  }

  return null;
}

function getSelectedWindow(components: APIMessageTopLevelComponent[]): LeaderboardWindow | null {
  const value = getSelectedValue(components, LEADERBOARD_WINDOW_SELECT);
  return value == null ? null : (WINDOW_BY_VALUE.get(value) ?? null);
}

function getSelectedMetric(components: APIMessageTopLevelComponent[]): LeaderboardMetric | null {
  const value = getSelectedValue(components, LEADERBOARD_METRIC_SELECT);
  return value == null ? null : (METRIC_BY_VALUE.get(value) ?? null);
}

function getFooterState(embeds: APIEmbed[]): { page: number; minGamesPlayed: number } | null {
  const footerText = embeds[0]?.footer?.text;
  if (footerText == null) {
    return null;
  }

  const match = LEADERBOARD_FOOTER_PATTERN.exec(footerText);
  if (match == null) {
    return null;
  }

  const page = Number.parseInt(match[1] ?? "", 10);
  const minGamesPlayed = Number.parseInt(match[3] ?? "", 10);

  if (Number.isNaN(page) || Number.isNaN(minGamesPlayed) || page < 1 || minGamesPlayed < 0) {
    return null;
  }

  return { page, minGamesPlayed };
}

export function getLeaderboardMessageState(
  message: APIMessage,
  post: LeaderboardPostRow,
): LeaderboardMessageState | null {
  const {components} = message;
  if (components == null) {
    return null;
  }

  const window = getSelectedWindow(components);
  const metric = getSelectedMetric(components);
  const footerState = getFooterState(message.embeds);

  if (window == null || metric == null || footerState == null) {
    return null;
  }

  return {
    guildId: post.GuildId,
    queueChannelId: post.QueueChannelId,
    window,
    metric,
    page: footerState.page,
    minGamesPlayed: footerState.minGamesPlayed,
  };
}
