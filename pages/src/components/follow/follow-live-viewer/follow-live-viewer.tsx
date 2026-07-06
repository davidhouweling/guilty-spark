import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import { IndividualTrackerViewerPage } from "../../individual-tracker/viewer/create";
import type { DirectoryConnectionStatus } from "../../../services/follow/follow-types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { FollowTrackerTabs } from "../follow-tracker-tabs/follow-tracker-tabs";
import type { FollowLiveViewerPresentation } from "../types";
import styles from "./follow-live-viewer.module.css";

export interface FollowLiveViewerProps {
  readonly directory: TrackerDirectory | null;
  readonly directoryStatus: DirectoryConnectionStatus;
  readonly selectedTrackerId: string | null;
  readonly model: FollowLiveViewerPresentation;
  readonly onSelectTracker: (trackerId: string) => void;
  readonly onRetry: () => void;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
}

export function FollowLiveViewer({
  directory,
  directoryStatus,
  selectedTrackerId,
  model,
  onSelectTracker,
  onRetry,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
}: FollowLiveViewerProps): React.ReactElement {
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
