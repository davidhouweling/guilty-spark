import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { FollowLiveService } from "../../../services/follow/follow-types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { FollowLiveOverlay } from "./follow-live-overlay";
import { FollowLiveOverlayPresenter } from "./follow-live-overlay-presenter";
import { useFollowLiveDirectory } from "../use-follow-live-directory";

export interface FollowLiveOverlayCreateProps {
  readonly gamertag: string;
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly showPreview?: boolean;
  readonly previewMode?: "player" | "observer";
}

export function FollowLiveOverlayCreate({
  gamertag,
  followLiveService,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  showPreview = false,
  previewMode = "observer",
}: FollowLiveOverlayCreateProps): React.ReactElement {
  const presenter = React.useMemo(() => new FollowLiveOverlayPresenter(), []);
  const { directory, directoryStatus, onRetry } = useFollowLiveDirectory({
    followLiveService,
    gamertag,
  });
  const model = React.useMemo(() => presenter.present({ gamertag, directory }), [directory, gamertag, presenter]);

  React.useEffect(() => {
    document.title = model.title;
  }, [model.title]);

  return (
    <FollowLiveOverlay
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
