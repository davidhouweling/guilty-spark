import type { ChartType } from "./types";

export interface ScoreProgressionSnapshot {
  readonly chartType: ChartType;
  readonly showPlayerAdvantage: boolean;
  readonly showMarkers: boolean;
  readonly showZoneAdvantage: boolean;
}

export class ScoreProgressionStore {
  // "timeline" resolves per mode: gantt modes show their timeline, score-line modes fall
  // back to the progression chart
  private _snapshot: ScoreProgressionSnapshot = {
    chartType: "timeline",
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
