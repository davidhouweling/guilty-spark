import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { DirectoryConnectionStatus } from "../../../services/follow/follow-types";
import { FollowLiveBasePresenter } from "../follow-live-base-presenter";

interface FollowLiveOverlayPresentOpts {
  readonly gamertag: string;
  readonly directory: TrackerDirectory | null;
  readonly directoryStatus: DirectoryConnectionStatus;
}

interface FollowLiveOverlayPresentation {
  readonly title: string;
  readonly showDirectoryError: boolean;
  readonly showDirectoryLoading: boolean;
  readonly liveTrackerId: string | null;
  readonly liveTrackerView: TrackerViewState | undefined;
}

export class FollowLiveOverlayPresenter extends FollowLiveBasePresenter {
  public present(args: FollowLiveOverlayPresentOpts): FollowLiveOverlayPresentation {
    const liveTracker = this.getLiveTracker(args.directory);

    return {
      title: this.getOverlayTitle(args.gamertag, args.directory),
      showDirectoryError: args.directoryStatus === "error" && args.directory == null,
      showDirectoryLoading: args.directory == null,
      liveTrackerId: liveTracker?.trackerId ?? null,
      liveTrackerView: this.toTrackerView(liveTracker, args.directory),
    };
  }

  private getOverlayTitle(gamertag: string, directory: FollowLiveOverlayPresentOpts["directory"]): string {
    const liveTracker = this.getLiveTracker(directory);
    if (liveTracker == null) {
      return `${gamertag} overlay - Guilty Spark`;
    }

    return `${gamertag} overlay - ${liveTracker.gamertag} live - Guilty Spark`;
  }
}
