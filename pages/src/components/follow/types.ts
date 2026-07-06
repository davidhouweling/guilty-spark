import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { DirectoryConnectionStatus } from "../../services/follow/follow-types";
import type { TrackerViewConnectionStatus } from "../../services/individual-tracker/view-types";

export interface FollowLiveViewerPresentation {
  readonly title: string;
  readonly showTabs: boolean;
  readonly selectedTracker: TrackerDirectoryEntry | null;
  readonly selectedTrackerView: TrackerViewState | undefined;
  readonly connectionStatusOverride: TrackerViewConnectionStatus | undefined;
}

export interface FollowLiveOverlayPresentation {
  readonly title: string;
  readonly liveTracker: TrackerDirectoryEntry | null;
  readonly liveTrackerView: TrackerViewState | undefined;
}

export interface FollowLiveViewerPresentArgs {
  readonly gamertag: string;
  readonly directory: TrackerDirectory | null;
  readonly directoryStatus: DirectoryConnectionStatus;
  readonly selectedTrackerId: string | null;
}

export interface FollowLiveOverlayPresentArgs {
  readonly gamertag: string;
  readonly directory: TrackerDirectory | null;
}
