import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { AnalyticsModule, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { DiscordSeriesStatsService } from "../../services/stats/discord-series-types";
import type { DiscordSeriesStatsStore } from "./discord-series-stats-store";
import type { DiscordSeriesStatsSnapshot, DiscordSeriesStatsViewModel } from "./types";

interface DiscordSeriesStatsPresenterDependencies {
  readonly store: DiscordSeriesStatsStore;
  readonly discordSeriesStatsService: DiscordSeriesStatsService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly guildId: string;
  readonly queueNumber: string;
}

export class DiscordSeriesStatsPresenter {
  private readonly store: DiscordSeriesStatsStore;
  private readonly discordSeriesStatsService: DiscordSeriesStatsService;
  private readonly matchAnalyticsService: MatchAnalyticsService;
  private readonly guildId: string;
  private readonly queueNumber: string;
  private isDisposed = false;
  private requestNumber = 0;

  constructor({
    store,
    discordSeriesStatsService,
    matchAnalyticsService,
    guildId,
    queueNumber,
  }: DiscordSeriesStatsPresenterDependencies) {
    this.store = store;
    this.discordSeriesStatsService = discordSeriesStatsService;
    this.matchAnalyticsService = matchAnalyticsService;
    this.guildId = guildId;
    this.queueNumber = queueNumber;
  }

  private async fetchDetail(): Promise<NonNullable<DiscordSeriesStatsSnapshot["response"]>> {
    const response = await this.discordSeriesStatsService.getDetail(this.guildId, this.queueNumber);
    return response.data;
  }

  start(): void {
    this.requestNumber += 1;
    const activeRequest = this.requestNumber;

    this.store.setLoading();
    void this.startAsync(activeRequest);
  }

  private async startAsync(activeRequest: number): Promise<void> {
    try {
      const response = await this.fetchDetail();
      if (this.isDisposed || activeRequest !== this.requestNumber) {
        return;
      }
      this.store.setLoaded(response);
    } catch {
      if (this.isDisposed || activeRequest !== this.requestNumber) {
        return;
      }
      this.store.setError("Failed to load stats");
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.requestNumber += 1;
  }

  loadAnalytics(module: AnalyticsModule, matchId?: string): void {
    const { response } = this.store.getSnapshot();
    if (response == null || !("matches" in response)) {
      return;
    }

    if (module === "scoreProgression" && matchId == null) {
      return;
    }

    const requestedIds = matchId == null ? response.matches.matchIds : [matchId];
    const matchIds = [...new Set(requestedIds)].filter((id) => {
      const state = this.store.getSnapshot().analyticsByMatchId.get(id)?.[module];
      return state?.status !== ComponentLoaderStatus.LOADED && state?.status !== ComponentLoaderStatus.LOADING;
    });
    if (matchIds.length === 0) {
      return;
    }

    this.updateAnalytics(matchIds, module, ComponentLoaderStatus.LOADING);
    void this.loadAnalyticsAsync(module, matchIds);
  }

  private async loadAnalyticsAsync(module: AnalyticsModule, matchIds: readonly string[]): Promise<void> {
    try {
      const results = await this.matchAnalyticsService.getBatchMatchAnalytics(matchIds, [module]);
      if (this.isDisposed) {
        return;
      }
      this.updateAnalytics(matchIds, module, ComponentLoaderStatus.LOADED, results);
    } catch {
      if (this.isDisposed) {
        return;
      }
      this.updateAnalytics(matchIds, module, ComponentLoaderStatus.ERROR);
    }
  }

  private updateAnalytics(
    matchIds: readonly string[],
    module: AnalyticsModule,
    requestedStatus: ComponentLoaderStatus,
    results?: Record<string, MatchAnalytics | null>,
  ): void {
    const analyticsByMatchId = new Map(this.store.getSnapshot().analyticsByMatchId);
    for (const matchId of matchIds) {
      const current = analyticsByMatchId.get(matchId);
      const analytics = results?.[matchId];
      const status =
        requestedStatus === ComponentLoaderStatus.LOADED && analytics == null
          ? ComponentLoaderStatus.ERROR
          : requestedStatus;
      switch (module) {
        case "killMatrix": {
          analyticsByMatchId.set(matchId, { ...current, killMatrix: { status, data: analytics?.killMatrix ?? null } });
          break;
        }
        case "scoreProgression": {
          analyticsByMatchId.set(matchId, {
            ...current,
            scoreProgression: { status, data: analytics?.scoreProgression ?? null },
          });
          break;
        }
        default: {
          throw new UnreachableError(module);
        }
      }
    }
    this.store.update({ analyticsByMatchId });
  }

  static present(snapshot: DiscordSeriesStatsSnapshot): DiscordSeriesStatsViewModel {
    if (
      snapshot.loaderStatus === ComponentLoaderStatus.PENDING ||
      snapshot.loaderStatus === ComponentLoaderStatus.LOADING
    ) {
      return {
        state: "loading",
      };
    }

    if (snapshot.loaderStatus === ComponentLoaderStatus.ERROR) {
      return {
        state: "error",
        message: snapshot.errorMessage ?? "Failed to load stats",
      };
    }

    const { response } = snapshot;
    if (response == null) {
      return {
        state: "error",
        message: "Stats response was empty",
      };
    }

    if ("matches" in response) {
      return {
        state: "resolved",
        data: response,
      };
    }

    switch (response.status) {
      case "pending-index": {
        return {
          state: "pending-index",
          retryAfterSeconds: response.retryAfterSeconds,
        };
      }
      case "forbidden": {
        return {
          state: "forbidden",
          reason: response.reason,
        };
      }
      case "not-found": {
        return {
          state: "not-found",
          reason: response.reason,
        };
      }
      default: {
        throw new UnreachableError(response);
      }
    }
  }
}
