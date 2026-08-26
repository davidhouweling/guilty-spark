import type { LiveNeatQueueSeriesSnapshot } from "./types";

function createInitialSnapshot(): LiveNeatQueueSeriesSnapshot {
  return {
    series: [],
    loading: true,
    busySourceKey: null,
    errorMessage: null,
    dialogState: null,
  };
}

export class LiveNeatQueueSeriesStore {
  public snapshot: LiveNeatQueueSeriesSnapshot = createInitialSnapshot();
  public readonly subscribers = new Set<() => void>();
}
