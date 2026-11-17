import type { AnalyticsModule, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import type { SeriesMatchAnalyticsById, SeriesMatchAnalyticsState } from "../../components/series-stats/types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";

interface SeriesAnalyticsControllerConfig {
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly onChange: (analyticsByMatchId: SeriesMatchAnalyticsById) => void;
  readonly trackerId?: string | undefined;
}

const BATCH_SIZE = 30;

export class SeriesAnalyticsController {
  private readonly config: SeriesAnalyticsControllerConfig;
  private matchIds: readonly string[] = [];
  private analyticsByMatchId: SeriesMatchAnalyticsById = new Map();
  private generation = 0;
  private isDisposed = false;

  constructor(config: SeriesAnalyticsControllerConfig) {
    this.config = config;
  }

  reset(matchIds: readonly string[] = []): void {
    if (this.isDisposed) {
      return;
    }
    this.generation += 1;
    this.matchIds = [...new Set(matchIds)];
    this.analyticsByMatchId = new Map();
    this.config.onChange(this.analyticsByMatchId);
  }

  dispose(): void {
    this.isDisposed = true;
    this.generation += 1;
  }

  private isCurrent(generation: number): boolean {
    return !this.isDisposed && generation === this.generation;
  }

  load(module: AnalyticsModule, matchId?: string): void {
    if (this.isDisposed || (module === "scoreProgression" && matchId == null)) {
      return;
    }
    const matchIds = this.matchIds.filter((id) => {
      if (matchId != null && id !== matchId) {
        return false;
      }
      const state = this.analyticsByMatchId.get(id);
      if (module === "killMatrix" && state?.scoreProgression?.status === ComponentLoaderStatus.LOADING) {
        return false;
      }
      const status = state?.[module]?.status;
      return status !== ComponentLoaderStatus.LOADING && status !== ComponentLoaderStatus.LOADED;
    });
    if (matchIds.length === 0) {
      return;
    }
    const { generation } = this;
    this.update(matchIds, module, ComponentLoaderStatus.LOADING);
    void this.loadAsync(module, matchIds, generation);
  }

  private async loadAsync(module: AnalyticsModule, matchIds: readonly string[], generation: number): Promise<void> {
    for (let index = 0; index < matchIds.length; index += BATCH_SIZE) {
      if (!this.isCurrent(generation)) {
        return;
      }
      const batchIds = matchIds.slice(index, index + BATCH_SIZE);
      try {
        const results =
          this.config.trackerId == null
            ? await this.config.matchAnalyticsService.getBatchMatchAnalytics(batchIds, [module])
            : await this.config.matchAnalyticsService.getBatchMatchAnalytics(batchIds, [module], this.config.trackerId);
        if (!this.isCurrent(generation)) {
          return;
        }
        this.update(batchIds, module, ComponentLoaderStatus.LOADED, results);
      } catch {
        if (!this.isCurrent(generation)) {
          return;
        }
        this.update(matchIds.slice(index), module, ComponentLoaderStatus.ERROR);
        return;
      }
    }
  }

  private update(
    matchIds: readonly string[],
    module: AnalyticsModule,
    status: ComponentLoaderStatus,
    results: Readonly<Record<string, MatchAnalytics | null>> = {},
  ): void {
    const next = new Map(this.analyticsByMatchId);
    for (const matchId of matchIds) {
      const current = next.get(matchId);
      const analytics = results[matchId];
      if (current?.[module]?.status === ComponentLoaderStatus.LOADED) {
        continue;
      }
      const moduleStatus =
        status === ComponentLoaderStatus.LOADED && analytics == null ? ComponentLoaderStatus.ERROR : status;
      let state: SeriesMatchAnalyticsState =
        module === "killMatrix"
          ? { ...current, killMatrix: { status: moduleStatus, data: analytics?.killMatrix ?? null } }
          : { ...current, scoreProgression: { status: moduleStatus, data: analytics?.scoreProgression ?? null } };
      if (module === "scoreProgression" && moduleStatus === ComponentLoaderStatus.ERROR) {
        const matrixStatus = current?.killMatrix?.status;
        if (matrixStatus !== ComponentLoaderStatus.LOADING && matrixStatus !== ComponentLoaderStatus.LOADED) {
          state = {
            ...state,
            killMatrix: { status: ComponentLoaderStatus.ERROR, data: current?.killMatrix?.data ?? null },
          };
        }
      }
      if (
        module === "scoreProgression" &&
        analytics?.requestedModules.includes("killMatrix") === true &&
        current?.killMatrix?.status !== ComponentLoaderStatus.LOADED
      ) {
        state = { ...state, killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix } };
      }
      next.set(matchId, state);
    }
    this.analyticsByMatchId = next;
    this.config.onChange(next);
  }
}
