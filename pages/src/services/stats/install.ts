import { getMode } from "../mode";
import type { DiscordSeriesStatsService } from "./discord-series-types";
import type { MatchAnalyticsService } from "./match-analytics-types";
import { RealDiscordSeriesStatsService } from "./discord-series";
import { RealMatchAnalyticsService } from "./match-analytics";

export async function installDiscordSeriesStatsService(apiHost: string): Promise<DiscordSeriesStatsService> {
  if (getMode() === "FAKE") {
    const { aFakeDiscordSeriesStatsServiceWith } = await import("./fakes/discord-series.fake");
    return aFakeDiscordSeriesStatsServiceWith();
  }

  return new RealDiscordSeriesStatsService({ apiHost });
}

export async function installMatchAnalyticsService(apiHost: string): Promise<MatchAnalyticsService> {
  if (getMode() === "FAKE") {
    const { aFakeMatchAnalyticsServiceWith } = await import("./fakes/match-analytics.fake");
    return aFakeMatchAnalyticsServiceWith();
  }

  return new RealMatchAnalyticsService({ apiHost });
}
