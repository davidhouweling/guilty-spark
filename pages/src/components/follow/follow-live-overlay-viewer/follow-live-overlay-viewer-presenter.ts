import type { FollowLiveOverlayPresentArgs, FollowLiveOverlayPresentation } from "../types";
import { FollowLiveBasePresenter } from "../follow-live-presenter";

export class FollowLiveOverlayViewerPresenter extends FollowLiveBasePresenter {
  public present(args: FollowLiveOverlayPresentArgs): FollowLiveOverlayPresentation {
    const liveTracker = this.getLiveTracker(args.directory);

    return {
      title: this.getOverlayTitle(args.gamertag, args.directory),
      liveTracker,
      liveTrackerView: this.toTrackerView(liveTracker, args.directory),
    };
  }
}
