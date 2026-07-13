import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installDiscordSeriesStatsService, installMatchAnalyticsService } from "../../services/stats/install";
import type { DiscordSeriesStatsService } from "../../services/stats/discord-series-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import { getMode } from "../../services/mode";

export interface Services {
  readonly discordSeriesStatsService: DiscordSeriesStatsService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

export async function installServices(apiHost: string): Promise<Services> {
  if (getMode() === "FAKE") {
    const [{ aFakeHaloClientWith }, discordSeriesStatsService, matchAnalyticsService] = await Promise.all([
      import("../../services/fakes/halo-client.fake"),
      installDiscordSeriesStatsService(apiHost),
      installMatchAnalyticsService(apiHost),
    ]);
    const haloClient = aFakeHaloClientWith();

    return {
      discordSeriesStatsService,
      matchAnalyticsService,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
    };
  }

  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost, credentials: "include" });
  const [discordSeriesStatsService, matchAnalyticsService] = await Promise.all([
    installDiscordSeriesStatsService(apiHost),
    installMatchAnalyticsService(apiHost),
  ]);

  return {
    discordSeriesStatsService,
    matchAnalyticsService,
    medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
  };
}
