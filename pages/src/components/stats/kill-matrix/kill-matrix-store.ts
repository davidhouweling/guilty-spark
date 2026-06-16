import type { KillMatrixViewRow } from "../../../controllers/stats/kill-matrix/types";

export type KillMatrixStoreState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly rows: readonly KillMatrixViewRow[] }
  | { readonly status: "error"; readonly message: string };

export class KillMatrixStore {
  private snapshot: KillMatrixStoreState = { status: "idle" };
  private readonly subscribers = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  getSnapshot(): KillMatrixStoreState {
    return this.snapshot;
  }

  setLoading(): void {
    this.update({ status: "loading" });
  }

  setLoaded(rows: readonly KillMatrixViewRow[]): void {
    this.update({ status: "loaded", rows });
  }

  setError(message: string): void {
    this.update({ status: "error", message });
  }

  private update(next: KillMatrixStoreState): void {
    this.snapshot = next;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
