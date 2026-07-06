import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { IndividualTrackerViewerPage } from "../individual-tracker/viewer/create";
import type { FollowLiveService } from "../../services/follow/follow-types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { FollowTrackerTabs } from "./follow-tracker-tabs";
import { FollowLivePresenter } from "./follow-live-presenter";
import { useFollowLiveDirectory } from "./use-follow-live-directory";
import styles from "./follow-live-viewer.module.css";

export interface FollowLiveViewerProps {
  readonly gamertag: string;
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
}

export function FollowLiveViewer({
  gamertag,
  followLiveService,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
}: FollowLiveViewerProps): React.ReactElement {
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
    <div className={styles.container}>
      {model.showTabs && directory !== null && (
        <FollowTrackerTabs
          directory={directory}
          selectedTrackerId={selectedTrackerId}
          onSelectTracker={onSelectTracker}
        />
      )}
      <div className={styles.trackerContent}>
        {model.selectedTracker != null ? (
          <IndividualTrackerViewerPage
            key={model.selectedTracker.trackerId}
            individualTrackerViewService={individualTrackerViewService}
            matchAnalyticsService={matchAnalyticsService}
            seriesMatchesService={seriesMatchesService}
            haloClient={haloClient}
            trackerId={model.selectedTracker.trackerId}
            streamerSettings={directory?.streamerSettings}
            externalView={model.selectedTrackerView}
            connectionStatusOverride={model.connectionStatusOverride}
          />
        ) : directoryStatus === "error" && directory === null ? (
          <ErrorState message="Failed to load tracker directory" onRetry={onRetry} />
        ) : directory === null ? (
          <LoadingState text="Loading tracker directory..." />
        ) : (
          <LoadingState text="No active tracker — waiting for a live game" />
        )}
      </div>
    </div>
  );
}
