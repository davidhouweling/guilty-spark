import React from "react";
import cn from "classnames";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { LoadingState } from "../loading-state/loading-state";
import { IndividualTrackerViewerPage } from "../individual-tracker/viewer/create";
import type { FollowLiveService } from "../../services/follow/follow-types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import { FollowTrackerTabs } from "./follow-tracker-tabs";
import { useFollowLiveDirectory } from "./use-follow-live-directory";
import styles from "./follow-live-viewer.module.css";

export interface FollowLiveViewerProps {
  readonly gamertag: string;
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly haloClient: HaloInfiniteClient;
}

export function FollowLiveViewer({
  gamertag,
  followLiveService,
  individualTrackerViewService,
  haloClient,
}: FollowLiveViewerProps): React.ReactElement {
  const { directory, directoryStatus, selectedTrackerId, isFollowingLive, onSelectTracker, onFollowLive } =
    useFollowLiveDirectory({ followLiveService, gamertag });

  const showBanner = directoryStatus === "error" || directoryStatus === "disconnected";

  return (
    <div className={styles.container}>
      {showBanner && (
        <div
          className={cn(styles.connectionBanner, { [styles.disconnected]: directoryStatus === "disconnected" })}
          data-testid="connection-banner"
        >
          {directoryStatus === "error" ? "Connection error — data may be stale" : "Disconnected — reload to refresh"}
        </div>
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
            haloClient={haloClient}
            trackerId={selectedTrackerId}
          />
        ) : (
          <LoadingState text="Loading tracker directory..." />
        )}
      </div>
    </div>
  );
}
