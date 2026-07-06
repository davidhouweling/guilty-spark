import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { FollowLiveViewerPresentArgs, FollowLiveViewerPresentation } from "../types";
import { FollowLiveBasePresenter } from "../follow-live-base-presenter";

export class FollowLiveViewerPresenter extends FollowLiveBasePresenter {
  public present(args: FollowLiveViewerPresentArgs): FollowLiveViewerPresentation {
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

  private getViewerTitle(gamertag: string, directory: FollowLiveViewerPresentArgs["directory"]): string {
    const liveTracker = this.getLiveTracker(directory);
    if (liveTracker == null) {
      return `${gamertag} live view - Guilty Spark`;
    }

    return `${gamertag} live view - ${liveTracker.gamertag} live - Guilty Spark`;
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
        throw new UnreachableError(directoryStatus);
      }
    }
  }
}
