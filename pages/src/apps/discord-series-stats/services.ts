import { installDiscordSeriesStatsService, installMatchAnalyticsService } from "../../services/stats/install";
import type { DiscordSeriesStatsService } from "../../services/stats/discord-series-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";

export interface Services {
  readonly discordSeriesStatsService: DiscordSeriesStatsService;
  readonly matchAnalyticsService: MatchAnalyticsService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const [discordSeriesStatsService, matchAnalyticsService] = await Promise.all([
    installDiscordSeriesStatsService(apiHost),
    installMatchAnalyticsService(apiHost),
  ]);

  return {
    discordSeriesStatsService,
    matchAnalyticsService,
  };
}
