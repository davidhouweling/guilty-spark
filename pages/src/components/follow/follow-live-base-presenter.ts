import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";

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
