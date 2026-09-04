import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/leaderboard/leaderboard";
import type {
  LeaderboardQueueOption,
  LeaderboardQueueOptionsResponse,
} from "../../services/leaderboard/leaderboard-types";

export type LeaderboardLoadStatus = "loading" | "loaded" | "error";

export interface LeaderboardSnapshot {
  readonly status: LeaderboardLoadStatus;
  readonly response: LeaderboardResponse | null;
  readonly queueOptions: readonly LeaderboardQueueOption[];
  readonly guildName: string;
  readonly errorMessage: string | null;
}

export class LeaderboardStore {
  private snapshot: LeaderboardSnapshot = {
    status: "loading",
    response: null,
    queueOptions: [],
    guildName: "",
    errorMessage: null,
  };

  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): LeaderboardSnapshot {
    return this.snapshot;
  }

  setLoading(): void {
    this.snapshot = { ...this.snapshot, status: "loading", errorMessage: null };
    this.emit();
  }

  setLoaded(response: LeaderboardResponse, queueOptions: LeaderboardQueueOptionsResponse): void {
    this.snapshot = {
      status: "loaded",
      response,
      queueOptions: queueOptions.options,
      guildName: queueOptions.guildName,
      errorMessage: null,
    };
    this.emit();
  }

  setError(message: string): void {
    this.snapshot = { ...this.snapshot, status: "error", errorMessage: message };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
