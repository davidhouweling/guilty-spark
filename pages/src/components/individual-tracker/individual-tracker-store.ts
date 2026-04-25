import type { IndividualTrackerSnapshot } from "./types";

export class IndividualTrackerStore {
  public snapshot: IndividualTrackerSnapshot = {
    authState: "loading",
    activeSection: "live-trackers",
    userId: null,
    xboxGamertag: null,
    activeTracker: null,
    runningTrackers: [],
    trackerStatuses: {},
    loading: true,
    busy: false,
    errorMessage: null,
    isAddDialogOpen: false,
    gameSelectionDialogState: null,
  };

  public readonly subscribers = new Set<() => void>();
}
