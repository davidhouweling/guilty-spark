import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import type { DirectoryConnectionStatus } from "../../../services/follow/follow-types";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import type { FollowTrackerTab } from "../types";
import { FollowLiveBasePresenter } from "../follow-live-base-presenter";

interface FollowLiveViewerPresentOpts {
  readonly gamertag: string;
  readonly directory: TrackerDirectory | null;
  readonly directoryStatus: DirectoryConnectionStatus;
  readonly selectedTrackerId: string | null;
}

interface FollowLiveViewerPresentation {
  readonly title: string;
  readonly loadStatus: ComponentLoaderStatus;
  readonly showTabs: boolean;
  readonly trackerTabs: readonly FollowTrackerTab[];
  readonly selectedTrackerId: string | null;
  readonly resolvedSelectedTrackerId: string | null;
  readonly selectedTrackerView: TrackerViewState | undefined;
  readonly selectedTrackerStreamerSettings: StreamerViewSettings | undefined;
  readonly connectionStatusOverride: TrackerViewConnectionStatus | undefined;
}

export class FollowLiveViewerPresenter extends FollowLiveBasePresenter {
  public present(args: FollowLiveViewerPresentOpts): FollowLiveViewerPresentation {
    const selectedTracker =
      args.selectedTrackerId == null
        ? null
        : (args.directory?.trackers.find((tracker) => tracker.trackerId === args.selectedTrackerId) ?? null);

    return {
      title: this.getViewerTitle(args.gamertag, args.directory),
      loadStatus: this.toLoadStatus(args.directoryStatus, selectedTracker),
      showTabs: args.directory != null && args.directory.trackers.length > 1,
      trackerTabs:
        args.directory?.trackers.map((tracker) => ({
          trackerId: tracker.trackerId,
          gamertag: tracker.gamertag,
          isLive: tracker.isLive,
        })) ?? [],
      selectedTrackerId: args.selectedTrackerId,
      resolvedSelectedTrackerId: selectedTracker?.trackerId ?? null,
      selectedTrackerView: this.toTrackerView(selectedTracker, args.directory),
      selectedTrackerStreamerSettings: args.directory?.streamerSettings,
      connectionStatusOverride: this.toTrackerConnectionStatus(args.directoryStatus),
    };
  }

  private toLoadStatus(
    directoryStatus: FollowLiveViewerPresentOpts["directoryStatus"],
    selectedTracker: TrackerDirectoryEntry | null,
  ): ComponentLoaderStatus {
    if (selectedTracker != null) {
      return ComponentLoaderStatus.LOADED;
    }

    if (directoryStatus === "error") {
      return ComponentLoaderStatus.ERROR;
    }

    if (directoryStatus === "connecting") {
      return ComponentLoaderStatus.LOADING;
    }

    return ComponentLoaderStatus.LOADED;
  }

  private getViewerTitle(gamertag: string, directory: FollowLiveViewerPresentOpts["directory"]): string {
    const liveTracker = this.getLiveTracker(directory);
    if (liveTracker == null) {
      return `${gamertag} live view - Guilty Spark`;
    }

    return `${gamertag} live view - ${liveTracker.gamertag} live - Guilty Spark`;
  }

  private toTrackerConnectionStatus(
    directoryStatus: FollowLiveViewerPresentOpts["directoryStatus"],
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
