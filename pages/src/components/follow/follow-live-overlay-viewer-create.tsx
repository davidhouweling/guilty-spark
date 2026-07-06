import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { FollowLiveService } from "../../services/follow/follow-types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { FollowLiveOverlayViewer } from "./follow-live-overlay-viewer";
import { FollowLivePresenter } from "./follow-live-presenter";
import { useFollowLiveDirectory } from "./use-follow-live-directory";

export interface FollowLiveOverlayViewerCreateProps {
  readonly gamertag: string;
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly showPreview?: boolean;
  readonly previewMode?: "player" | "observer";
}

export function FollowLiveOverlayViewerCreate({
  gamertag,
  followLiveService,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  showPreview = false,
  previewMode = "observer",
}: FollowLiveOverlayViewerCreateProps): React.ReactElement {
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

  return (
    <FollowLiveOverlayViewer
      directoryStatus={directoryStatus}
      directory={directory}
      model={model}
      onRetry={onRetry}
      individualTrackerViewService={individualTrackerViewService}
      matchAnalyticsService={matchAnalyticsService}
      seriesMatchesService={seriesMatchesService}
      haloClient={haloClient}
      showPreview={showPreview}
      previewMode={previewMode}
    />
  );
}
