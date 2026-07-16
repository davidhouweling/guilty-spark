import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import { installMatchAnalyticsService } from "../../services/stats/install";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import { RealLiveTrackerService } from "../../services/live-tracker/live-tracker";
import type { LiveTrackerService } from "../../services/live-tracker/types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly liveTrackerService: LiveTrackerService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

export async function installServices(apiHost: string): Promise<Services> {
  const mode = getMode();
  const matchAnalyticsService = await installMatchAnalyticsService(apiHost);

  if (mode === "FAKE") {
    return import("../../services/fakes/install.fake").then(async ({ installFakeServices }) => {
      const [{ aFakeHaloClientWith }, { liveTrackerService }] = await Promise.all([
        import("../../services/fakes/halo-client.fake"),
        installFakeServices(),
      ]);
      const haloClient = aFakeHaloClientWith();
      return {
        liveTrackerService,
        matchAnalyticsService,
        medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
      };
    });
  }

  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost });

  return {
    liveTrackerService: new RealLiveTrackerService({ apiHost }),
    matchAnalyticsService,
    medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
  };
}
