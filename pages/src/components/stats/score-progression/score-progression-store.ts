import type { ChartType } from "./types";

export interface ScoreProgressionSnapshot {
  readonly chartType: ChartType;
}

export class ScoreProgressionStore {
  private _snapshot: ScoreProgressionSnapshot = { chartType: "progression" };
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
