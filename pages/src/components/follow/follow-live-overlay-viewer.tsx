import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { IndividualTrackerOverlayPage } from "../individual-tracker/overlay/create";
import type { FollowLiveService } from "../../services/follow/follow-types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { useFollowLiveDirectory } from "./use-follow-live-directory";

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

function getOverlayTitle(gamertag: string, directory: TrackerDirectory | null): string {
  const liveTracker = getLiveTracker(directory);
  if (liveTracker == null) {
    return `${gamertag} overlay - Guilty Spark`;
  }

  return `${gamertag} overlay - ${liveTracker.gamertag} live - Guilty Spark`;
}

export interface FollowLiveOverlayViewerProps {
  readonly gamertag: string;
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly showPreview?: boolean;
  readonly previewMode?: "player" | "observer";
}

export function FollowLiveOverlayViewer({
  gamertag,
  followLiveService,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  showPreview = false,
  previewMode = "observer",
}: FollowLiveOverlayViewerProps): React.ReactElement {
  const { directory, directoryStatus, onRetry } = useFollowLiveDirectory({
    followLiveService,
    gamertag,
  });
  const liveTracker = getLiveTracker(directory);
  const liveTrackerView: TrackerViewState | undefined =
    liveTracker == null
      ? undefined
      : {
          ...liveTracker,
          ...(directory?.streamerSettings !== undefined ? { streamerSettings: directory.streamerSettings } : {}),
        };

  React.useEffect(() => {
    document.title = getOverlayTitle(gamertag, directory);
  }, [directory, gamertag]);

  if (liveTracker != null) {
    return (
      <IndividualTrackerOverlayPage
        key={liveTracker.trackerId}
        individualTrackerViewService={individualTrackerViewService}
        matchAnalyticsService={matchAnalyticsService}
        seriesMatchesService={seriesMatchesService}
        haloClient={haloClient}
        trackerId={liveTracker.trackerId}
        externalView={liveTrackerView}
        showPreview={showPreview}
        previewMode={previewMode}
      />
    );
  }

  if (directoryStatus === "error" && directory === null) {
    return <ErrorState message="Failed to load tracker directory" onRetry={onRetry} />;
  }

  if (directory === null) {
    return <LoadingState text="Loading tracker directory..." />;
  }

  return <LoadingState text="No active tracker — waiting for a live game" />;
}
