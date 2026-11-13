import { getMode } from "../mode";
import type { DiscordSeriesStatsService } from "./discord-series-types";
import type { MatchAnalyticsService } from "./match-analytics-types";
import type { MatchDetailsService, SeriesDetailService } from "./detail-types";
import type { SeriesMatchesService } from "./series-matches-types";
import { RealDiscordSeriesStatsService } from "./discord-series";
import { RealMatchAnalyticsService } from "./match-analytics";
import { RealMatchDetailsService } from "./match-details";
import { RealSeriesDetailService } from "./series-detail";
import { RealSeriesMatchesService } from "./series-matches";

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

export async function installSeriesMatchesService(apiHost: string): Promise<SeriesMatchesService> {
  if (getMode() === "FAKE") {
    const { aFakeSeriesMatchesServiceWith } = await import("./fakes/series-matches.fake");
    return aFakeSeriesMatchesServiceWith();
  }

  return new RealSeriesMatchesService({ apiHost });
}

export async function installMatchDetailsService(apiHost: string): Promise<MatchDetailsService> {
  if (getMode() === "FAKE") {
    const { aFakeMatchDetailsServiceWith } = await import("./fakes/match-details.fake");
    return aFakeMatchDetailsServiceWith();
  }

  return new RealMatchDetailsService({ apiHost });
}

export async function installSeriesDetailService(apiHost: string): Promise<SeriesDetailService> {
  if (getMode() === "FAKE") {
    const { aFakeSeriesDetailServiceWith } = await import("./fakes/series-detail.fake");
    return aFakeSeriesDetailServiceWith();
  }

  return new RealSeriesDetailService({ apiHost });
}
