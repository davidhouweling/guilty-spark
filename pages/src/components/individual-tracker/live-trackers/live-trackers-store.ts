import type { LiveTrackersSnapshot } from "./types";

function createInitialSnapshot(): LiveTrackersSnapshot {
  return {
    userId: null,
    xboxGamertag: null,
    activeTracker: null,
    runningTrackers: [],
    trackerStatuses: {},
    busy: false,
    errorMessage: null,
    isAddDialogOpen: false,
    gameSelectionDialogState: null,
  };
}

export class LiveTrackersStore {
  public snapshot: LiveTrackersSnapshot = createInitialSnapshot();

  public readonly subscribers = new Set<() => void>();
}
