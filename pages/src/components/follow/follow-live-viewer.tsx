import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { Alert } from "../alert/alert";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { IndividualTrackerViewerPage } from "../individual-tracker/viewer/create";
import type { FollowLiveService } from "../../services/follow/follow-types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import { FollowTrackerTabs } from "./follow-tracker-tabs";
import { useFollowLiveDirectory } from "./use-follow-live-directory";
import styles from "./follow-live-viewer.module.css";

export interface FollowLiveViewerProps {
  readonly gamertag: string;
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly haloClient: HaloInfiniteClient;
}

export function FollowLiveViewer({
  gamertag,
  followLiveService,
  individualTrackerViewService,
  matchAnalyticsService,
  haloClient,
}: FollowLiveViewerProps): React.ReactElement {
  const { directory, directoryStatus, selectedTrackerId, isFollowingLive, onSelectTracker, onFollowLive, onRetry } =
    useFollowLiveDirectory({ followLiveService, gamertag });

  const showBanner = (directoryStatus === "error" && directory !== null) || directoryStatus === "disconnected";

  return (
    <div className={styles.container}>
      {showBanner && (
        <Alert variant={directoryStatus === "disconnected" ? "warning" : "error"}>
          {directoryStatus === "error"
            ? directory !== null
              ? "Connection error — data may be stale"
              : "Failed to load tracker directory"
            : "Disconnected — reload to refresh"}
        </Alert>
      )}
      {directory !== null && directory.trackers.length > 0 && (
        <FollowTrackerTabs
          directory={directory}
          selectedTrackerId={selectedTrackerId}
          isFollowingLive={isFollowingLive}
          onSelectTracker={onSelectTracker}
          onFollowLive={onFollowLive}
        />
      )}
      <div className={styles.trackerContent}>
        {selectedTrackerId !== null ? (
          <IndividualTrackerViewerPage
            key={selectedTrackerId}
            individualTrackerViewService={individualTrackerViewService}
            matchAnalyticsService={matchAnalyticsService}
            haloClient={haloClient}
            trackerId={selectedTrackerId}
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
