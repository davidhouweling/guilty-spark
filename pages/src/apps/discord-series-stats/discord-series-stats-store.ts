import type { AnalyticsModule, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesMatchAnalyticsState } from "../../components/series-stats/types";
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
    this.snapshot = {
      loaderStatus: ComponentLoaderStatus.LOADING,
      response: null,
      errorMessage: null,
      analyticsByMatchId: new Map(),
    };
    this.emit();
  }

  setLoaded(response: NonNullable<DiscordSeriesStatsSnapshot["response"]>): void {
    this.snapshot = {
      loaderStatus: ComponentLoaderStatus.LOADED,
      response,
      errorMessage: null,
      analyticsByMatchId: new Map(),
    };
    this.emit();
  }

  setAnalyticsLoading(matchIds: readonly string[], module: AnalyticsModule): void {
    for (const matchId of matchIds) {
      if (module === "killMatrix") {
        this.updateKillMatrix(matchId, { status: ComponentLoaderStatus.LOADING, data: null });
      } else {
        this.updateScoreProgression(matchId, { status: ComponentLoaderStatus.LOADING, data: null });
      }
    }
    this.emit();
  }

  setAnalyticsLoaded(
    matchIds: readonly string[],
    module: AnalyticsModule,
    results: Record<string, MatchAnalytics | null>,
  ): void {
    for (const matchId of matchIds) {
      const analytics = results[matchId];
      if (module === "killMatrix") {
        this.updateKillMatrix(matchId, {
          status: ComponentLoaderStatus.LOADED,
          data: analytics?.killMatrix ?? null,
        });
      } else {
        this.updateScoreProgression(matchId, {
          status: ComponentLoaderStatus.LOADED,
          data: analytics?.scoreProgression ?? null,
        });
      }
    }
    this.emit();
  }

  setAnalyticsError(matchIds: readonly string[], module: AnalyticsModule): void {
    for (const matchId of matchIds) {
      if (module === "killMatrix") {
        this.updateKillMatrix(matchId, { status: ComponentLoaderStatus.ERROR, data: null });
      } else {
        this.updateScoreProgression(matchId, { status: ComponentLoaderStatus.ERROR, data: null });
      }
    }
    this.emit();
  }

  setError(message: string): void {
    this.snapshot = {
      loaderStatus: ComponentLoaderStatus.ERROR,
      response: null,
      errorMessage: message,
      analyticsByMatchId: new Map(),
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private updateKillMatrix(matchId: string, state: NonNullable<SeriesMatchAnalyticsState["killMatrix"]>): void {
    const analyticsByMatchId = new Map(this.snapshot.analyticsByMatchId);
    const current = analyticsByMatchId.get(matchId) ?? {};
    analyticsByMatchId.set(matchId, { ...current, killMatrix: state });
    this.snapshot = { ...this.snapshot, analyticsByMatchId };
  }

  private updateScoreProgression(
    matchId: string,
    state: NonNullable<SeriesMatchAnalyticsState["scoreProgression"]>,
  ): void {
    const analyticsByMatchId = new Map(this.snapshot.analyticsByMatchId);
    const current = analyticsByMatchId.get(matchId) ?? {};
    analyticsByMatchId.set(matchId, { ...current, scoreProgression: state });
    this.snapshot = { ...this.snapshot, analyticsByMatchId };
  }
}
