import type { HaloInfiniteClient } from "halo-infinite-api";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installFollowLiveService } from "../../services/follow/install";
import type { FollowLiveService } from "../../services/follow/follow-types";
import { installIndividualTrackerViewService } from "../../services/individual-tracker/install";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import { installMatchAnalyticsService } from "../../services/stats/install";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly haloClient: HaloInfiniteClient;
}

export async function installServices(apiHost: string): Promise<Services> {
  if (getMode() === "FAKE") {
    const [
      { aFakeFollowLiveServiceWith },
      { aFakeIndividualTrackerViewServiceWith },
      { aFakeMatchAnalyticsServiceWith },
      { aFakeHaloClientWith },
    ] = await Promise.all([
      import("../../services/follow/fakes/follow.fake"),
      import("../../services/individual-tracker/fakes/view.fake"),
      import("../../services/stats/fakes/match-analytics.fake"),
      import("../../services/fakes/halo-client.fake"),
    ]);
    return {
      followLiveService: aFakeFollowLiveServiceWith(),
      individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      haloClient: aFakeHaloClientWith(),
    };
  }

  const [followLiveService, individualTrackerViewService, matchAnalyticsService] = await Promise.all([
    installFollowLiveService(apiHost),
    installIndividualTrackerViewService(apiHost),
    installMatchAnalyticsService(apiHost),
  ]);
  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost });
  return { followLiveService, individualTrackerViewService, matchAnalyticsService, haloClient };
}
