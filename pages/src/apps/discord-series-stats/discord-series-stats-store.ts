import type { DiscordSeriesStats } from "@guilty-spark/shared/contracts/stats/discord-series";
import { ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import type { DiscordSeriesStatsSnapshot } from "./types";

export class DiscordSeriesStatsStore {
  private snapshot: DiscordSeriesStatsSnapshot = {
    loaderStatus: ComponentLoaderStatus.PENDING,
    response: null,
    errorMessage: null,
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
    this.snapshot = {
      loaderStatus: ComponentLoaderStatus.LOADING,
      response: null,
      errorMessage: null,
    };
    this.emit();
  }

  setLoaded(response: DiscordSeriesStats): void {
    this.snapshot = {
      loaderStatus: ComponentLoaderStatus.LOADED,
      response,
      errorMessage: null,
    };
    this.emit();
  }

  setError(message: string): void {
    this.snapshot = {
      loaderStatus: ComponentLoaderStatus.ERROR,
      response: null,
      errorMessage: message,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
