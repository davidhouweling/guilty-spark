import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";

export function aFakeDiscordSeriesStatsResolvedWith(matchIds: string[]): DiscordSeriesStatsResolved {
  return {
    status: "resolved",
    guildId: "123456789012345678",
    queueNumber: 7777,
    matchIds,
    renderData: {
      title: "Queue #7777",
      subtitle: "Guild",
      seriesScore: "1:0",
      teams: [],
      matches: matchIds.map((matchId) => ({
        matchId,
        gameTypeAndMap: "Slayer: Map",
        gameVariantCategory: 0,
        gameType: "Slayer",
        gameMap: "Map",
        gameMapThumbnailUrl: "data:,",
        duration: "10m",
        gameScore: "50:40",
        gameSubScore: null,
        startTime: "2024-01-01T00:00:00Z",
        endTime: "2024-01-01T00:10:00Z",
        playerXuidToGametag: {},
        rawMatch: { secret: "cached-raw-data" },
        seriesMatch: { secret: "cached-stable-copy" },
      })),
    },
  };
}
