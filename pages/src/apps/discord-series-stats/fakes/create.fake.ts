import type {
  DiscordSeriesStats,
  DiscordSeriesStatsForbidden,
  DiscordSeriesStatsNotFound,
  DiscordSeriesStatsPending,
  DiscordSeriesStatsResolved,
} from "@guilty-spark/shared/contracts/stats/discord-series";
import type { DiscordSeriesStatsResult } from "../../../services/stats/discord-series-types";
import { aFakeDiscordSeriesStatsServiceWith } from "../../../services/stats/fakes/discord-series.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import type { Services } from "../services";

export function aFakeResolvedDiscordSeriesStatsWith(
  overrides: Partial<DiscordSeriesStatsResolved> = {},
): DiscordSeriesStatsResolved {
  return {
    status: "resolved",
    guildId: "123456789012345678",
    queueNumber: 7777,
    matchIds: ["match-1"],
    renderData: {
      title: "Queue #7777 Series Stats",
      subtitle: "Guild 123456789012345678",
      seriesScore: "1:0",
      medalMetadata: {},
      teams: [
        { name: "Eagle", players: ["Player One"] },
        { name: "Cobra", players: ["Player Two"] },
      ],
      matches: [
        {
          matchId: "match-1",
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 0,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:,",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          playerXuidToGametag: { "xuid-1": "Player One" },
          rawMatch: {},
        },
      ],
    },
    ...overrides,
  };
}

export function aFakePendingDiscordSeriesStatsWith(
  overrides: Partial<DiscordSeriesStatsPending> = {},
): DiscordSeriesStatsPending {
  return {
    status: "pending-index",
    guildId: "123456789012345678",
    queueNumber: 7777,
    retryAfterSeconds: 9,
    ...overrides,
  };
}

export function aFakeNotFoundDiscordSeriesStatsWith(
  overrides: Partial<DiscordSeriesStatsNotFound> = {},
): DiscordSeriesStatsNotFound {
  return {
    status: "not-found",
    guildId: "123456789012345678",
    queueNumber: 7777,
    reason: "No matching series overview embeds found",
    ...overrides,
  };
}

export function aFakeForbiddenDiscordSeriesStatsWith(
  overrides: Partial<DiscordSeriesStatsForbidden> = {},
): DiscordSeriesStatsForbidden {
  return {
    status: "forbidden",
    guildId: "123456789012345678",
    queueNumber: 7777,
    reason: "Missing Discord permissions or message content access",
    ...overrides,
  };
}

function toFakeResult(response: DiscordSeriesStats): DiscordSeriesStatsResult {
  return {
    status:
      response.status === "pending-index"
        ? 503
        : response.status === "not-found"
          ? 404
          : response.status === "forbidden"
            ? 403
            : 200,
    data: response,
    retryAfterSeconds: response.status === "pending-index" ? response.retryAfterSeconds : null,
  };
}

export function aFakeDiscordSeriesStatsAppServicesWith(response: DiscordSeriesStats): Services {
  return {
    discordSeriesStatsService: aFakeDiscordSeriesStatsServiceWith({ result: toFakeResult(response) }),
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
  };
}
