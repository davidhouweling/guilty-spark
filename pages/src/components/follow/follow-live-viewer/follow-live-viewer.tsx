import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import { IndividualTrackerViewerPage } from "../../individual-tracker/viewer/create";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { FollowTrackerTabs } from "../follow-tracker-tabs/follow-tracker-tabs";
import type { FollowTrackerTab } from "../types";
import styles from "./follow-live-viewer.module.css";

export interface FollowLiveViewerProps {
  readonly showDirectoryError: boolean;
  readonly showDirectoryLoading: boolean;
  readonly showTabs: boolean;
  readonly trackerTabs: readonly FollowTrackerTab[];
  readonly selectedTrackerId: string | null;
  readonly resolvedSelectedTrackerId: string | null;
  readonly selectedTrackerView: Parameters<typeof IndividualTrackerViewerPage>[0]["externalView"];
  readonly selectedTrackerStreamerSettings: Parameters<typeof IndividualTrackerViewerPage>[0]["streamerSettings"];
  readonly connectionStatusOverride: Parameters<typeof IndividualTrackerViewerPage>[0]["connectionStatusOverride"];
  readonly onSelectTracker: (trackerId: string) => void;
  readonly onRetry: () => void;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
}

export function FollowLiveViewer({
  showDirectoryError,
  showDirectoryLoading,
  showTabs,
  trackerTabs,
  selectedTrackerId,
  resolvedSelectedTrackerId,
  selectedTrackerView,
  selectedTrackerStreamerSettings,
  connectionStatusOverride,
  onSelectTracker,
  onRetry,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
}: FollowLiveViewerProps): React.ReactElement {
  return (
    <div className={styles.container}>
      {showTabs && (
        <FollowTrackerTabs
          trackers={trackerTabs}
          selectedTrackerId={selectedTrackerId}
          onSelectTracker={onSelectTracker}
        />
      )}
      <div className={styles.trackerContent}>
        {resolvedSelectedTrackerId != null ? (
          <IndividualTrackerViewerPage
            key={resolvedSelectedTrackerId}
            individualTrackerViewService={individualTrackerViewService}
            matchAnalyticsService={matchAnalyticsService}
            seriesMatchesService={seriesMatchesService}
            haloClient={haloClient}
            trackerId={resolvedSelectedTrackerId}
            streamerSettings={selectedTrackerStreamerSettings}
            externalView={selectedTrackerView}
            connectionStatusOverride={connectionStatusOverride}
          />
        ) : showDirectoryError ? (
          <ErrorState message="Failed to load tracker directory" onRetry={onRetry} />
        ) : showDirectoryLoading ? (
          <LoadingState text="Loading tracker directory..." />
        ) : (
          <LoadingState text="No active tracker — waiting for a live game" />
        )}
      </div>
    </div>
  );
}
