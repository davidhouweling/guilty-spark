import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { IndividualTrackerViewerPage } from "../individual-tracker/viewer/create";
import type { FollowLiveService } from "../../services/follow/follow-types";
import type {
  TrackerViewConnectionStatus,
  IndividualTrackerViewService,
} from "../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { FollowTrackerTabs } from "./follow-tracker-tabs";
import { useFollowLiveDirectory } from "./use-follow-live-directory";
import styles from "./follow-live-viewer.module.css";

function toTrackerConnectionStatus(
  directoryStatus: "connecting" | "connected" | "error" | "disconnected",
): TrackerViewConnectionStatus | undefined {
  switch (directoryStatus) {
    case "connected": {
      return undefined;
    }
    case "connecting": {
      return "connecting";
    }
    case "disconnected": {
      return "disconnected";
    }
    case "error": {
      return "error";
    }
    default: {
      return undefined;
    }
  }
}

function getLiveTracker(directory: TrackerDirectory | null): TrackerDirectory["trackers"][number] | null {
  if (directory == null) {
    return null;
  }

  if (directory.liveTrackerId != null) {
    const liveTracker = directory.trackers.find((tracker) => tracker.trackerId === directory.liveTrackerId);
    if (liveTracker != null) {
      return liveTracker;
    }
  }

  return directory.trackers.find((tracker) => tracker.isLive) ?? null;
}

function getViewerTitle(gamertag: string, directory: TrackerDirectory | null): string {
  const liveTracker = getLiveTracker(directory);
  if (liveTracker == null) {
    return `${gamertag} live view - Guilty Spark`;
  }

  return `${gamertag} live view - ${liveTracker.gamertag} live - Guilty Spark`;
}

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
  const { directory, directoryStatus, selectedTrackerId, onSelectTracker, onRetry } = useFollowLiveDirectory({
    followLiveService,
    gamertag,
  });
  const connectionStatusOverride = toTrackerConnectionStatus(directoryStatus);
  const selectedTracker =
    selectedTrackerId == null ? null : directory?.trackers.find((tracker) => tracker.trackerId === selectedTrackerId);
  const selectedTrackerView: TrackerViewState | undefined =
    selectedTracker == null
      ? undefined
      : {
          ...selectedTracker,
          ...(directory?.streamerSettings !== undefined ? { streamerSettings: directory.streamerSettings } : {}),
        };

  React.useEffect(() => {
    document.title = getViewerTitle(gamertag, directory);
  }, [directory, gamertag]);

  return (
    <div className={styles.container}>
      {directory !== null && directory.trackers.length > 1 && (
        <FollowTrackerTabs
          directory={directory}
          selectedTrackerId={selectedTrackerId}
          onSelectTracker={onSelectTracker}
        />
      )}
      <div className={styles.trackerContent}>
        {selectedTracker != null ? (
          <IndividualTrackerViewerPage
            key={selectedTracker.trackerId}
            individualTrackerViewService={individualTrackerViewService}
            matchAnalyticsService={matchAnalyticsService}
            seriesMatchesService={seriesMatchesService}
            haloClient={haloClient}
            trackerId={selectedTracker.trackerId}
            streamerSettings={directory?.streamerSettings}
            externalView={selectedTrackerView}
            connectionStatusOverride={connectionStatusOverride}
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
