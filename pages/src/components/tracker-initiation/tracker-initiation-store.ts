import type { MatchHistoryResponse } from "./types";

export type TrackerInitiationState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "loaded"; data: MatchHistoryResponse };

export interface TrackerInitiationSnapshot {
  readonly gamertag: string;
  readonly state: TrackerInitiationState;
  readonly selectedMatchIds: ReadonlySet<string>;
  readonly groupings: readonly (readonly string[])[];
}

export class TrackerInitiationStore {
  private snapshot: TrackerInitiationSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor(initialGamertag: string) {
    this.snapshot = {
      gamertag: initialGamertag,
      state: { type: "idle" },
      selectedMatchIds: new Set(),
      groupings: [],
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): TrackerInitiationSnapshot {
    return this.snapshot;
  }

  public setSnapshot(next: TrackerInitiationSnapshot): void {
    this.snapshot = next;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
