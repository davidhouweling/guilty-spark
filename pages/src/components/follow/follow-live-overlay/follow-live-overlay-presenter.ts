import type { FollowLiveOverlayPresentArgs, FollowLiveOverlayPresentation } from "../types";
import { FollowLiveBasePresenter } from "../follow-live-base-presenter";

export class FollowLiveOverlayPresenter extends FollowLiveBasePresenter {
  public present(args: FollowLiveOverlayPresentArgs): FollowLiveOverlayPresentation {
    const liveTracker = this.getLiveTracker(args.directory);

    return {
      title: this.getOverlayTitle(args.gamertag, args.directory),
      showDirectoryError: args.directoryStatus === "error" && args.directory == null,
      showDirectoryLoading: args.directory == null,
      liveTrackerId: liveTracker?.trackerId ?? null,
      liveTrackerView: this.toTrackerView(liveTracker, args.directory),
    };
  }

  private getOverlayTitle(gamertag: string, directory: FollowLiveOverlayPresentArgs["directory"]): string {
    const liveTracker = this.getLiveTracker(directory);
    if (liveTracker == null) {
      return `${gamertag} overlay - Guilty Spark`;
    }

    return `${gamertag} overlay - ${liveTracker.gamertag} live - Guilty Spark`;
  }
}
