import type { HaloInfiniteClient } from "halo-infinite-api";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import {
  installIndividualTrackerService,
  installIndividualTrackerSettingsService,
} from "../../services/individual-tracker/install";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type { CondensedMatchHistoryService } from "../../services/individual-tracker/condensed-match-history-types";
import { installCondensedMatchHistoryService } from "../../services/individual-tracker/install-condensed-match-history";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import {
  installMatchAnalyticsService,
  installMatchDetailsService,
  installSeriesDetailService,
  installSeriesMatchesService,
} from "../../services/stats/install";
import type { MatchDetailsService, SeriesDetailService } from "../../services/stats/detail-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";

export interface Services {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly condensedMatchHistoryService: CondensedMatchHistoryService;
  readonly individualTrackerSettingsService: IndividualTrackerSettingsService;
  readonly haloClient: HaloInfiniteClient;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly matchDetailsService: MatchDetailsService;
  readonly seriesDetailService: SeriesDetailService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost, credentials: "include" });
  const medalMetadataResolver = new HaloMedalMetadataResolver(haloClient);
  const [
    authService,
    individualTrackerService,
    condensedMatchHistoryService,
    individualTrackerSettingsService,
    matchAnalyticsService,
    seriesMatchesService,
    matchDetailsService,
    seriesDetailService,
  ] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerService(apiHost, haloClient),
    installCondensedMatchHistoryService(apiHost),
    installIndividualTrackerSettingsService(apiHost),
    installMatchAnalyticsService(apiHost),
    installSeriesMatchesService(apiHost),
    installMatchDetailsService(apiHost),
    installSeriesDetailService(apiHost),
  ]);
  return {
    authService,
    individualTrackerService,
    condensedMatchHistoryService,
    individualTrackerSettingsService,
    haloClient,
    medalMetadataResolver,
    matchAnalyticsService,
    seriesMatchesService,
    matchDetailsService,
    seriesDetailService,
  };
}
