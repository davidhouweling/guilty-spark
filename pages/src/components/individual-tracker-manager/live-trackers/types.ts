import type { TrackerState } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { LiveTrackersPresenter } from "./live-trackers-presenter";

export interface LiveTrackersSnapshot {
  readonly userId: string | null;
  readonly xboxGamertag: string | null;
  readonly xboxXuid: string | null;
  readonly activeTracker: TrackerState | null;
  readonly runningTrackers: readonly { trackerId: string; gamertag: string }[];
  readonly trackerStatuses: Readonly<Record<string, TrackerState | null>>;
  readonly busy: boolean;
  readonly errorMessage: string | null;
}

export interface LiveTrackersController {
  start: () => void;
  dispose: () => void;
  setSessionContext: (userId: string, xboxGamertag: string | null, xboxXuid: string | null) => void;
  resetForUnauthenticated: () => void;
  refresh: () => Promise<void>;
}

export interface LiveTrackersSectionController extends LiveTrackersController {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => LiveTrackersSnapshot;
  getTrackerItems: LiveTrackersPresenter["getTrackerItems"];
  getActions: LiveTrackersPresenter["getActions"];
}
