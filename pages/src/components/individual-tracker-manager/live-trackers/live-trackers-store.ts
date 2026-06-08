import type { LiveTrackersSnapshot } from "./types";

function createInitialSnapshot(): LiveTrackersSnapshot {
  return {
    userId: null,
    xboxGamertag: null,
    xboxXuid: null,
    activeTracker: null,
    runningTrackers: [],
    trackerStatuses: {},
    busy: false,
    errorMessage: null,
  };
}

export class LiveTrackersStore {
  public snapshot: LiveTrackersSnapshot = createInitialSnapshot();
  public readonly subscribers = new Set<() => void>();
}
