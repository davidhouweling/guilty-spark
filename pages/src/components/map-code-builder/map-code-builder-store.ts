import type { MapCodeBuilderSnapshot } from "./types";

const INITIAL_SNAPSHOT: MapCodeBuilderSnapshot = {
  count: 5,
  format: "HCS",
  playlist: "current",
  matches: [],
  notice: null,
};

export class MapCodeBuilderStore {
  private snapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  public getSnapshot = (): MapCodeBuilderSnapshot => this.snapshot;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  public update(patch: Partial<MapCodeBuilderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
