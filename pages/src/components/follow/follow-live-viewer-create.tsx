import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { FollowLiveService } from "../../services/follow/follow-types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { FollowLivePresenter } from "./follow-live-presenter";
import { FollowLiveViewer } from "./follow-live-viewer";
import { useFollowLiveDirectory } from "./use-follow-live-directory";

export interface FollowLiveViewerCreateProps {
  readonly gamertag: string;
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
}

export function FollowLiveViewerCreate({
  gamertag,
  followLiveService,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
}: FollowLiveViewerCreateProps): React.ReactElement {
  const presenter = React.useMemo(() => new FollowLivePresenter(), []);
  const { directory, directoryStatus, selectedTrackerId, onSelectTracker, onRetry } = useFollowLiveDirectory({
    followLiveService,
    gamertag,
  });
  const model = React.useMemo(
    () =>
      presenter.presentViewer({
        gamertag,
        directory,
        directoryStatus,
        selectedTrackerId,
      }),
    [directory, directoryStatus, gamertag, presenter, selectedTrackerId],
  );

  React.useEffect(() => {
    document.title = model.title;
  }, [model.title]);

  return (
    <FollowLiveViewer
      directory={directory}
      directoryStatus={directoryStatus}
      selectedTrackerId={selectedTrackerId}
      model={model}
      onSelectTracker={onSelectTracker}
      onRetry={onRetry}
      individualTrackerViewService={individualTrackerViewService}
      matchAnalyticsService={matchAnalyticsService}
      seriesMatchesService={seriesMatchesService}
      haloClient={haloClient}
    />
  );
}
