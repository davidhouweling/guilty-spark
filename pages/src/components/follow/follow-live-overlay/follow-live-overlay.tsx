import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import { IndividualTrackerOverlayPage } from "../../individual-tracker/overlay/create";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";

export interface FollowLiveOverlayProps {
  readonly showDirectoryError: boolean;
  readonly showDirectoryLoading: boolean;
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
  showDirectoryError,
  showDirectoryLoading,
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
  if (liveTrackerId != null) {
    return (
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
    );
  }

  if (showDirectoryError) {
    return <ErrorState message="Failed to load tracker directory" onRetry={onRetry} />;
  }

  if (showDirectoryLoading) {
    return <LoadingState text="Loading tracker directory..." />;
  }

  return <LoadingState text="No active tracker — waiting for a live game" />;
}
