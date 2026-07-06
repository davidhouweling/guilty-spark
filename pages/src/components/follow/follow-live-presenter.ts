import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { FollowLiveViewerPresentArgs, FollowLiveViewerPresentation } from "./types";

export abstract class FollowLiveBasePresenter {
  protected getLiveTracker(directory: TrackerDirectory | null): TrackerDirectoryEntry | null {
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

  protected getViewerTitle(gamertag: string, directory: TrackerDirectory | null): string {
    const liveTracker = this.getLiveTracker(directory);
    if (liveTracker == null) {
      return `${gamertag} live view - Guilty Spark`;
    }

    return `${gamertag} live view - ${liveTracker.gamertag} live - Guilty Spark`;
  }

  protected getOverlayTitle(gamertag: string, directory: TrackerDirectory | null): string {
    const liveTracker = this.getLiveTracker(directory);
    if (liveTracker == null) {
      return `${gamertag} overlay - Guilty Spark`;
    }

    return `${gamertag} overlay - ${liveTracker.gamertag} live - Guilty Spark`;
  }

  protected toTrackerConnectionStatus(
    directoryStatus: FollowLiveViewerPresentArgs["directoryStatus"],
  ): FollowLiveViewerPresentation["connectionStatusOverride"] {
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

  protected toTrackerView(
    tracker: TrackerDirectoryEntry | null,
    directory: TrackerDirectory | null,
  ): TrackerViewState | undefined {
    if (tracker == null) {
      return undefined;
    }

    return {
      ...tracker,
      ...(directory?.streamerSettings !== undefined ? { streamerSettings: directory.streamerSettings } : {}),
    };
  }
}
