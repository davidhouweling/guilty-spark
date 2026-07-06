import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { IndividualTrackerOverlayPage } from "../individual-tracker/overlay/create";
import type { FollowLiveService } from "../../services/follow/follow-types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { FollowLivePresenter } from "./follow-live-presenter";
import { useFollowLiveDirectory } from "./use-follow-live-directory";

export interface FollowLiveOverlayViewerProps {
  readonly gamertag: string;
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly showPreview?: boolean;
  readonly previewMode?: "player" | "observer";
}

export function FollowLiveOverlayViewer({
  gamertag,
  followLiveService,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  showPreview = false,
  previewMode = "observer",
}: FollowLiveOverlayViewerProps): React.ReactElement {
  const presenter = React.useMemo(() => new FollowLivePresenter(), []);
  const { directory, directoryStatus, onRetry } = useFollowLiveDirectory({
    followLiveService,
    gamertag,
  });
  const model = React.useMemo(
    () =>
      presenter.presentOverlay({
        gamertag,
        directory,
      }),
    [directory, gamertag, presenter],
  );

  React.useEffect(() => {
    document.title = model.title;
  }, [model.title]);

  if (model.liveTracker != null) {
    return (
      <IndividualTrackerOverlayPage
        key={model.liveTracker.trackerId}
        individualTrackerViewService={individualTrackerViewService}
        matchAnalyticsService={matchAnalyticsService}
        seriesMatchesService={seriesMatchesService}
        haloClient={haloClient}
        trackerId={model.liveTracker.trackerId}
        externalView={model.liveTrackerView}
        showPreview={showPreview}
        previewMode={previewMode}
      />
    );
  }

  if (directoryStatus === "error" && directory === null) {
    return <ErrorState message="Failed to load tracker directory" onRetry={onRetry} />;
  }

  if (directory === null) {
    return <LoadingState text="Loading tracker directory..." />;
  }

  return <LoadingState text="No active tracker — waiting for a live game" />;
}
