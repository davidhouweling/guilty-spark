import type { PlayerCompareResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerCompareTabId } from "./types";

export type PlayerCompareLoadStatus = "loading" | "loaded" | "error";

export interface PlayerCompareSnapshot {
  readonly status: PlayerCompareLoadStatus;
  readonly gamertags: readonly string[];
  readonly response: PlayerCompareResponse | null;
  readonly errorMessage: string | null;
  readonly tabId: PlayerCompareTabId;
  readonly addPlayerValue: string;
}

export class PlayerCompareStore {
  private snapshot: PlayerCompareSnapshot = {
    status: "loaded",
    gamertags: [],
    response: null,
    errorMessage: null,
    tabId: "stats",
    addPlayerValue: "",
  };
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): PlayerCompareSnapshot {
    return this.snapshot;
  }

  setLoading(gamertags: readonly string[]): void {
    this.snapshot = { ...this.snapshot, status: "loading", gamertags, errorMessage: null };
    this.emit();
  }

  setLoaded(gamertags: readonly string[], response: PlayerCompareResponse | null): void {
    this.snapshot = { ...this.snapshot, status: "loaded", gamertags, response, errorMessage: null };
    this.emit();
  }

  setError(message: string): void {
    this.snapshot = { ...this.snapshot, status: "error", errorMessage: message };
    this.emit();
  }

  setTab(tabId: PlayerCompareTabId): void {
    if (this.snapshot.tabId === tabId) {
      return;
    }
    this.snapshot = { ...this.snapshot, tabId };
    this.emit();
  }

  setAddPlayerValue(value: string): void {
    if (this.snapshot.addPlayerValue === value) {
      return;
    }
    this.snapshot = { ...this.snapshot, addPlayerValue: value };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
