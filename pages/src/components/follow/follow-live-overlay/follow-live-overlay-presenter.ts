import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import type { DirectoryConnectionStatus } from "../../../services/follow/follow-types";
import { FollowLiveBasePresenter } from "../follow-live-base-presenter";

interface FollowLiveOverlayPresentOpts {
  readonly gamertag: string;
  readonly directory: TrackerDirectory | null;
  readonly directoryStatus: DirectoryConnectionStatus;
}

interface FollowLiveOverlayPresentation {
  readonly title: string;
  readonly loadStatus: ComponentLoaderStatus;
  readonly connectionHealth: "healthy" | "degraded";
  readonly liveTrackerId: string | null;
  readonly liveTrackerView: TrackerViewState | undefined;
}

export class FollowLiveOverlayPresenter extends FollowLiveBasePresenter {
  public present(args: FollowLiveOverlayPresentOpts): FollowLiveOverlayPresentation {
    const liveTracker = this.getLiveTracker(args.directory);

    return {
      title: this.getOverlayTitle(args.gamertag, args.directory),
      loadStatus: this.toLoadStatus(args.directoryStatus, args.directory, liveTracker),
      connectionHealth: args.directoryStatus === "connected" ? "healthy" : "degraded",
      liveTrackerId: liveTracker?.trackerId ?? null,
      liveTrackerView: this.toTrackerView(liveTracker, args.directory),
    };
  }

  private toLoadStatus(
    _directoryStatus: FollowLiveOverlayPresentOpts["directoryStatus"],
    directory: FollowLiveOverlayPresentOpts["directory"],
    liveTracker: TrackerDirectory["trackers"][number] | null,
  ): ComponentLoaderStatus {
    if (liveTracker != null) {
      return ComponentLoaderStatus.LOADED;
    }

    if (directory == null) {
      return ComponentLoaderStatus.LOADING;
    }

    return ComponentLoaderStatus.LOADED;
  }

  private getOverlayTitle(gamertag: string, directory: FollowLiveOverlayPresentOpts["directory"]): string {
    const liveTracker = this.getLiveTracker(directory);
    if (liveTracker == null) {
      return `${gamertag} overlay - Guilty Spark`;
    }

    return `${gamertag} overlay - ${liveTracker.gamertag} live - Guilty Spark`;
  }
}
