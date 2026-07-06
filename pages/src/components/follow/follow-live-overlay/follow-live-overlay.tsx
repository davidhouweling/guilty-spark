import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import { IndividualTrackerOverlayPage } from "../../individual-tracker/overlay/create";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";

export interface FollowLiveOverlayProps {
  readonly loadStatus: ComponentLoaderStatus;
  readonly liveTrackerId: string | null;
  readonly liveTrackerView: Parameters<typeof IndividualTrackerOverlayPage>[0]["externalView"];
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly showPreview?: boolean;
  readonly previewMode?: "player" | "observer";
  readonly onRetry: () => void;
}

export function FollowLiveOverlay({
  loadStatus,
  liveTrackerId,
  liveTrackerView,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  showPreview = false,
  previewMode = "observer",
  onRetry,
}: FollowLiveOverlayProps): React.ReactElement {
  const loadedState =
    liveTrackerId != null ? (
      <IndividualTrackerOverlayPage
        key={liveTrackerId}
        individualTrackerViewService={individualTrackerViewService}
        matchAnalyticsService={matchAnalyticsService}
        seriesMatchesService={seriesMatchesService}
        haloClient={haloClient}
        trackerId={liveTrackerId}
        externalView={liveTrackerView}
        showPreview={showPreview}
        previewMode={previewMode}
      />
    ) : (
      <LoadingState text="No active tracker — waiting for a live game" />
    );

  return (
    <ComponentLoader
      status={loadStatus}
      loading={<LoadingState text="Loading tracker directory..." />}
      error={<ErrorState message="Failed to load tracker directory" onRetry={onRetry} />}
      loaded={loadedState}
    />
  );
}
