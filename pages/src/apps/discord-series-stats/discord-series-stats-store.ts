import { ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import type { DiscordSeriesStatsSnapshot } from "./types";

export class DiscordSeriesStatsStore {
  private snapshot: DiscordSeriesStatsSnapshot = {
    loaderStatus: ComponentLoaderStatus.PENDING,
    response: null,
    errorMessage: null,
    analyticsByMatchId: new Map(),
  };

  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): DiscordSeriesStatsSnapshot {
    return this.snapshot;
  }

  setLoading(): void {
    this.update({
      loaderStatus: ComponentLoaderStatus.LOADING,
      response: null,
      errorMessage: null,
      analyticsByMatchId: new Map(),
    });
  }

  setLoaded(response: NonNullable<DiscordSeriesStatsSnapshot["response"]>): void {
    this.update({
      loaderStatus: ComponentLoaderStatus.LOADED,
      response,
      errorMessage: null,
      analyticsByMatchId: new Map(),
    });
  }

  setError(message: string): void {
    this.update({
      loaderStatus: ComponentLoaderStatus.ERROR,
      response: null,
      errorMessage: message,
      analyticsByMatchId: new Map(),
    });
  }

  update(patch: Partial<DiscordSeriesStatsSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
