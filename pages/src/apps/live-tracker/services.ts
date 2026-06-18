import { installMatchAnalyticsService } from "../../services/stats/install";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import { RealLiveTrackerService } from "../../services/live-tracker/live-tracker";
import type { LiveTrackerService } from "../../services/live-tracker/types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly liveTrackerService: LiveTrackerService;
  readonly matchAnalyticsService: MatchAnalyticsService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const mode = getMode();
  const matchAnalyticsService = await installMatchAnalyticsService(apiHost);

  if (mode === "FAKE") {
    return import("../../services/fakes/install.fake").then(async ({ installFakeServices }) => {
      const { liveTrackerService } = await installFakeServices();
      return { liveTrackerService, matchAnalyticsService };
    });
  }

  return {
    liveTrackerService: new RealLiveTrackerService({ apiHost }),
    matchAnalyticsService,
  };
}
