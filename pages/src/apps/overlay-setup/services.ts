import type { HaloInfiniteClient } from "halo-infinite-api";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import {
  installIndividualTrackerSettingsService,
  installIndividualTrackerViewService,
  installOverlayPreviewService,
} from "../../services/individual-tracker/install";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import type { OverlayPreviewService } from "../../services/individual-tracker/overlay-preview-types";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../services/individual-tracker/fakes/settings.fake";
import { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import { installMatchAnalyticsService, installSeriesMatchesService } from "../../services/stats/install";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly authService: AuthService;
  readonly haloClient: HaloInfiniteClient;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly overlayPreviewService: OverlayPreviewService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

export async function installServices(apiHost: string): Promise<Services> {
  if (getMode() === "FAKE") {
    const [
      { FakeAuthService },
      { aFakeIndividualTrackerViewServiceWith },
      { aFakeMatchAnalyticsServiceWith },
      { aFakeSeriesMatchesServiceWith },
      { aFakeHaloClientWith },
    ] = await Promise.all([
      import("../../services/auth/fakes/auth.fake"),
      import("../../services/individual-tracker/fakes/view.fake"),
      import("../../services/stats/fakes/match-analytics.fake"),
      import("../../services/stats/fakes/series-matches.fake"),
      import("../../services/fakes/halo-client.fake"),
    ]);
    const haloClient = aFakeHaloClientWith();
    return {
      authService: new FakeAuthService(),
      haloClient,
      settingsService: aFakeIndividualTrackerSettingsServiceWith(),
      overlayPreviewService: await installOverlayPreviewService(apiHost),
      individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
    };
  }

  const [
    authService,
    settingsService,
    overlayPreviewService,
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
  ] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerSettingsService(apiHost),
    installOverlayPreviewService(apiHost),
    installIndividualTrackerViewService(apiHost),
    installMatchAnalyticsService(apiHost),
    installSeriesMatchesService(apiHost),
  ]);
  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost, credentials: "include" });

  return {
    authService,
    haloClient,
    settingsService,
    overlayPreviewService,
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
    medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
  };
}
