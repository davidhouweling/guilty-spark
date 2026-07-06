import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { DirectoryConnectionStatus } from "../../services/follow/follow-types";
import type { TrackerViewConnectionStatus } from "../../services/individual-tracker/view-types";

export interface FollowTrackerTab {
  readonly trackerId: string;
  readonly gamertag: string;
  readonly isLive: boolean;
}

export interface FollowLiveViewerPresentation {
  readonly title: string;
  readonly showDirectoryError: boolean;
  readonly showDirectoryLoading: boolean;
  readonly showTabs: boolean;
  readonly trackerTabs: readonly FollowTrackerTab[];
  readonly selectedTrackerId: string | null;
  readonly resolvedSelectedTrackerId: string | null;
  readonly selectedTrackerView: TrackerViewState | undefined;
  readonly selectedTrackerStreamerSettings: StreamerViewSettings | undefined;
  readonly connectionStatusOverride: TrackerViewConnectionStatus | undefined;
}

export interface FollowLiveOverlayPresentation {
  readonly title: string;
  readonly showDirectoryError: boolean;
  readonly showDirectoryLoading: boolean;
  readonly liveTrackerId: string | null;
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
  readonly directoryStatus: DirectoryConnectionStatus;
}
