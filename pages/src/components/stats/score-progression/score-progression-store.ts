import type { ChartType } from "./types";

export interface ScoreProgressionSnapshot {
  // null means the user has not chosen yet; each mode resolves its own default
  readonly chartType: ChartType | null;
  readonly showPlayerAdvantage: boolean;
  readonly showMarkers: boolean;
  readonly showZoneAdvantage: boolean;
}

export class ScoreProgressionStore {
  private _snapshot: ScoreProgressionSnapshot = {
    chartType: null,
    showPlayerAdvantage: false,
    showMarkers: true,
    showZoneAdvantage: false,
  };
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): ScoreProgressionSnapshot => this._snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  update(patch: Partial<ScoreProgressionSnapshot>): void {
    this._snapshot = { ...this._snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
