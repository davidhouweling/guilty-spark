import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import { IndividualTrackerViewerPage } from "../../individual-tracker/viewer/create";
import type {
  IndividualTrackerViewService,
  TrackerViewConnectionStatus,
} from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { FollowTrackerTabs } from "../follow-tracker-tabs/follow-tracker-tabs";
import type { FollowTrackerTab } from "../types";
import styles from "./follow-live-viewer.module.css";

export interface FollowLiveViewerProps {
  readonly loadStatus: ComponentLoaderStatus;
  readonly showTabs: boolean;
  readonly trackerTabs: readonly FollowTrackerTab[];
  readonly selectedTrackerId: string | null;
  readonly resolvedSelectedTrackerId: string | null;
  readonly selectedTrackerView: TrackerViewState | undefined;
  readonly selectedTrackerStreamerSettings: StreamerViewSettings | undefined;
  readonly connectionStatusOverride: TrackerViewConnectionStatus | undefined;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly onSelectTracker: (trackerId: string) => void;
  readonly onRetry: () => void;
}

export function FollowLiveViewer({
  loadStatus,
  showTabs,
  trackerTabs,
  selectedTrackerId,
  resolvedSelectedTrackerId,
  selectedTrackerView,
  selectedTrackerStreamerSettings,
  connectionStatusOverride,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  onSelectTracker,
  onRetry,
}: FollowLiveViewerProps): React.ReactElement {
  const loadedState =
    resolvedSelectedTrackerId != null ? (
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
    ) : (
      <LoadingState text="No active tracker — waiting for a live game" />
    );

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
        <ComponentLoader
          status={loadStatus}
          loading={<LoadingState text="Loading tracker directory..." />}
          error={<ErrorState message="Failed to load tracker directory" onRetry={onRetry} />}
          loaded={loadedState}
        />
      </div>
    </div>
  );
}
