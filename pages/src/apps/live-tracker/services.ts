import { installMatchAnalyticsService } from "../../services/stats/install";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import { RealLiveTrackerService } from "../../services/live-tracker/live-tracker";
import type { LiveTrackerService } from "../../services/live-tracker/types";
import { installSeriesMatchesService } from "../../services/series-matches/install";
import type { SeriesMatchesService } from "../../services/series-matches/types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly liveTrackerService: LiveTrackerService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const mode = getMode();
  const [matchAnalyticsService, seriesMatchesService] = await Promise.all([
    installMatchAnalyticsService(apiHost),
    installSeriesMatchesService(apiHost),
  ]);

  if (mode === "FAKE") {
    return import("../../services/fakes/install.fake").then(async ({ installFakeServices }) => {
      const { liveTrackerService } = await installFakeServices();
      return {
        liveTrackerService,
        matchAnalyticsService,
        seriesMatchesService,
      };
    });
  }

  return {
    liveTrackerService: new RealLiveTrackerService({ apiHost }),
    matchAnalyticsService,
    seriesMatchesService,
  };
}
