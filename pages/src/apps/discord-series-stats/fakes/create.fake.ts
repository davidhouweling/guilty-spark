import { aFakeSeriesDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import type { DiscordSeriesStatsDetailResult } from "../../../services/stats/discord-series-types";
import { aFakeDiscordSeriesStatsServiceWith } from "../../../services/stats/fakes/discord-series.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import type { Services } from "../services";

export function aFakeResolvedDiscordSeriesStatsDetailResultWith(): DiscordSeriesStatsDetailResult {
  return {
    status: 200,
    data: aFakeSeriesDetailResponseWith({
      context: { title: "Queue #7777 Series Stats", subtitle: "Guild 123456789012345678" },
    }),
    retryAfterSeconds: null,
  };
}

export function aFakePendingDiscordSeriesStatsDetailResultWith(): DiscordSeriesStatsDetailResult {
  return {
    status: 503,
    data: {
      status: "pending-index",
      guildId: "123456789012345678",
      queueNumber: 7777,
      retryAfterSeconds: 9,
    },
    retryAfterSeconds: 9,
  };
}

export function aFakeNotFoundDiscordSeriesStatsDetailResultWith(): DiscordSeriesStatsDetailResult {
  return {
    status: 404,
    data: {
      status: "not-found",
      guildId: "123456789012345678",
      queueNumber: 7777,
      reason: "No matching series overview embeds found",
    },
    retryAfterSeconds: null,
  };
}

export function aFakeForbiddenDiscordSeriesStatsDetailResultWith(): DiscordSeriesStatsDetailResult {
  return {
    status: 403,
    data: {
      status: "forbidden",
      guildId: "123456789012345678",
      queueNumber: 7777,
      reason: "Missing Discord permissions or message content access",
    },
    retryAfterSeconds: null,
  };
}

export function aFakeDiscordSeriesStatsAppServicesWith(
  detailResult: DiscordSeriesStatsDetailResult = aFakeResolvedDiscordSeriesStatsDetailResultWith(),
): Services {
  return {
    discordSeriesStatsService: aFakeDiscordSeriesStatsServiceWith({ detailResult }),
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
  };
}
