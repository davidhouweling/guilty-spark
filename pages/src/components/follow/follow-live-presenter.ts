import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { FollowLiveOverlayPresentArgs, FollowLiveOverlayPresentation, FollowLiveViewerPresentArgs, FollowLiveViewerPresentation } from "./types";

export class FollowLivePresenter {
  public presentViewer(args: FollowLiveViewerPresentArgs): FollowLiveViewerPresentation {
    const selectedTracker =
      args.selectedTrackerId == null
        ? null
        : (args.directory?.trackers.find((tracker) => tracker.trackerId === args.selectedTrackerId) ?? null);

    return {
      title: this.getViewerTitle(args.gamertag, args.directory),
      showTabs: args.directory != null && args.directory.trackers.length > 1,
      selectedTracker,
      selectedTrackerView: this.toTrackerView(selectedTracker, args.directory),
      connectionStatusOverride: this.toTrackerConnectionStatus(args.directoryStatus),
    };
  }

  public presentOverlay(args: FollowLiveOverlayPresentArgs): FollowLiveOverlayPresentation {
    const liveTracker = this.getLiveTracker(args.directory);

    return {
      title: this.getOverlayTitle(args.gamertag, args.directory),
      liveTracker,
      liveTrackerView: this.toTrackerView(liveTracker, args.directory),
    };
  }

  private getLiveTracker(directory: TrackerDirectory | null): TrackerDirectoryEntry | null {
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

  private getViewerTitle(gamertag: string, directory: TrackerDirectory | null): string {
    const liveTracker = this.getLiveTracker(directory);
    if (liveTracker == null) {
      return `${gamertag} live view - Guilty Spark`;
    }

    return `${gamertag} live view - ${liveTracker.gamertag} live - Guilty Spark`;
  }

  private getOverlayTitle(gamertag: string, directory: TrackerDirectory | null): string {
    const liveTracker = this.getLiveTracker(directory);
    if (liveTracker == null) {
      return `${gamertag} overlay - Guilty Spark`;
    }

    return `${gamertag} overlay - ${liveTracker.gamertag} live - Guilty Spark`;
  }

  private toTrackerConnectionStatus(
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

  private toTrackerView(
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
