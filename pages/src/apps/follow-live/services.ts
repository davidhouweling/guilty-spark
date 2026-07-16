import type { HaloInfiniteClient } from "halo-infinite-api";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import { installFollowLiveService } from "../../services/follow/install";
import type { FollowLiveService } from "../../services/follow/follow-types";
import { installIndividualTrackerViewService } from "../../services/individual-tracker/install";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import { installMatchAnalyticsService, installSeriesMatchesService } from "../../services/stats/install";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

export async function installServices(apiHost: string): Promise<Services> {
  if (getMode() === "FAKE") {
    const [
      { aFakeFollowLiveServiceWith },
      { aFakeIndividualTrackerViewServiceWith },
      { aFakeMatchAnalyticsServiceWith },
      { aFakeSeriesMatchesServiceWith },
      { aFakeHaloClientWith },
    ] = await Promise.all([
      import("../../services/follow/fakes/follow.fake"),
      import("../../services/individual-tracker/fakes/view.fake"),
      import("../../services/stats/fakes/match-analytics.fake"),
      import("../../services/stats/fakes/series-matches.fake"),
      import("../../services/fakes/halo-client.fake"),
    ]);
    const haloClient = aFakeHaloClientWith();

    return {
      followLiveService: aFakeFollowLiveServiceWith(),
      individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
    };
  }

  const [followLiveService, individualTrackerViewService, matchAnalyticsService, seriesMatchesService] =
    await Promise.all([
      installFollowLiveService(apiHost),
      installIndividualTrackerViewService(apiHost),
      installMatchAnalyticsService(apiHost),
      installSeriesMatchesService(apiHost),
    ]);
  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost });
  return {
    followLiveService,
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
    haloClient,
    medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
  };
}
