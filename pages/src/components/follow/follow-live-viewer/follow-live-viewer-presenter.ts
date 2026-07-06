import type { FollowLiveViewerPresentArgs, FollowLiveViewerPresentation } from "../types";
import { FollowLiveBasePresenter } from "../follow-live-presenter";

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
}
