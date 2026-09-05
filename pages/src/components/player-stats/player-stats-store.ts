import type { PlayerStatsResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerStatsTabId } from "./types";

export type PlayerStatsLoadStatus = "loading" | "loaded" | "error";

export interface PlayerStatsSnapshot {
  readonly status: PlayerStatsLoadStatus;
  readonly response: PlayerStatsResponse | null;
  readonly errorMessage: string | null;
  readonly tabId: PlayerStatsTabId;
}

export class PlayerStatsStore {
  private snapshot: PlayerStatsSnapshot = {
    status: "loading",
    response: null,
    errorMessage: null,
    tabId: "stats",
  };
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): PlayerStatsSnapshot {
    return this.snapshot;
  }

  setLoading(): void {
    this.snapshot = { ...this.snapshot, status: "loading", errorMessage: null };
    this.emit();
  }

  setLoaded(response: PlayerStatsResponse): void {
    this.snapshot = { ...this.snapshot, status: "loaded", response, errorMessage: null };
    this.emit();
  }

  setError(message: string): void {
    this.snapshot = { ...this.snapshot, status: "error", errorMessage: message };
    this.emit();
  }

  setTab(tabId: PlayerStatsTabId): void {
    if (this.snapshot.tabId === tabId) {
      return;
    }
    this.snapshot = { ...this.snapshot, tabId };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
