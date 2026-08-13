import type { APIEmbed, APIMessage, APIMessageTopLevelComponent } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardPostRow } from "../database/types/leaderboard_post";
import { LEADERBOARD_METRIC_SELECT_CONTROL_ID, LEADERBOARD_WINDOW_SELECT_CONTROL_ID } from "./leaderboard-response";

const LEADERBOARD_FOOTER_PATTERN = /^Page (\d+) of (\d+) \| Min games: (\d+) \| Total players: (\d+)$/;
const LEGACY_LEADERBOARD_DESCRIPTION_PATTERN = /Page (\d+) of (\d+) \| Min games: (\d+) \| Total players: (\d+)/;
const LEGACY_LEADERBOARD_SUMMARY_PATTERN = /Page: (\d+) \| Min games: (\d+) \| Total players: (\d+)/;

const WINDOW_VALUES = new Set<string>(Object.values(LeaderboardWindow));
const METRIC_VALUES = new Set<string>(Object.values(LeaderboardMetric));

export interface LeaderboardMessageState {
  guildId: string;
  queueChannelId: string | null;
  window: LeaderboardWindow;
  metric: LeaderboardMetric;
  page: number;
  minGamesPlayed: number;
}

function isLeaderboardWindow(value: string): value is LeaderboardWindow {
  return WINDOW_VALUES.has(value);
}

function isLeaderboardMetric(value: string): value is LeaderboardMetric {
  return METRIC_VALUES.has(value);
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
  const value = getSelectedValue(components, LEADERBOARD_WINDOW_SELECT_CONTROL_ID);
  if (value == null || !isLeaderboardWindow(value)) {
    return null;
  }

  return value;
}

function getSelectedMetric(components: APIMessageTopLevelComponent[]): LeaderboardMetric | null {
  const value = getSelectedValue(components, LEADERBOARD_METRIC_SELECT_CONTROL_ID);
  if (value == null || !isLeaderboardMetric(value)) {
    return null;
  }

  return value;
}

function parsePageAndMinGames(text: string): { page: number; minGamesPlayed: number } | null {
  const match = LEADERBOARD_FOOTER_PATTERN.exec(text) ?? LEGACY_LEADERBOARD_DESCRIPTION_PATTERN.exec(text);
  if (match != null) {
    const page = Number.parseInt(match[1] ?? "", 10);
    const minGamesPlayed = Number.parseInt(match[3] ?? "", 10);

    if (Number.isNaN(page) || Number.isNaN(minGamesPlayed) || page < 1 || minGamesPlayed < 0) {
      return null;
    }

    return { page, minGamesPlayed };
  }

  const legacySummaryMatch = LEGACY_LEADERBOARD_SUMMARY_PATTERN.exec(text);
  if (legacySummaryMatch == null) {
    return null;
  }

  const page = Number.parseInt(legacySummaryMatch[1] ?? "", 10);
  const minGamesPlayed = Number.parseInt(legacySummaryMatch[2] ?? "", 10);

  if (Number.isNaN(page) || Number.isNaN(minGamesPlayed) || page < 1 || minGamesPlayed < 0) {
    return null;
  }

  return { page, minGamesPlayed };
}

function getPaginationState(embeds: APIEmbed[]): { page: number; minGamesPlayed: number } | null {
  const footerText = embeds[0]?.footer?.text;
  if (footerText != null) {
    return parsePageAndMinGames(footerText);
  }

  const description = embeds[0]?.description;
  if (description == null) {
    return null;
  }

  return parsePageAndMinGames(description);
}

export function getLeaderboardMessageState(
  message: APIMessage,
  post: LeaderboardPostRow,
): LeaderboardMessageState | null {
  const { components } = message;
  if (components == null) {
    return null;
  }

  const window = getSelectedWindow(components);
  const metric = getSelectedMetric(components);
  const footerState = getPaginationState(message.embeds);

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
