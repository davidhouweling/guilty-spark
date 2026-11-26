import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import type { AllStreamerSettings, SeriesStreamerSettings } from "../../components/live-tracker/settings/types";
import { buildUrlWithViewMode, encodeSettingsToUrlParams, parseSettingsFromUrl } from "../../components/live-tracker/settings/settings-url-params";
import type { ViewMode } from "../../components/view-mode/view-mode-selector";
import type { SeriesMatchAnalyticsById } from "../../components/series-stats/types";
import type { SeriesAnalyticsController } from "../../controllers/series-analytics/series-analytics-controller";
import type { DiscordSeriesStatsService } from "../../services/stats/discord-series-types";
import type { DiscordSeriesStatsStore } from "./discord-series-stats-store";
import type { DiscordSeriesStatsSnapshot, DiscordSeriesStatsViewModel } from "./types";

interface DiscordSeriesStatsPresenterDependencies {
  readonly store: DiscordSeriesStatsStore;
  readonly discordSeriesStatsService: DiscordSeriesStatsService;
  readonly analyticsController: SeriesAnalyticsController;
  readonly guildId: string;
  readonly queueNumber: string;
  readonly settings: AllStreamerSettings;
}

export class DiscordSeriesStatsPresenter {
  private readonly store: DiscordSeriesStatsStore;
  private readonly discordSeriesStatsService: DiscordSeriesStatsService;
  private readonly analyticsController: SeriesAnalyticsController;
  private readonly guildId: string;
  private readonly queueNumber: string;
  private readonly settings: AllStreamerSettings;
  private isDisposed = false;
  private requestNumber = 0;

  constructor({
    store,
    discordSeriesStatsService,
    analyticsController,
    guildId,
    queueNumber,
    settings,
  }: DiscordSeriesStatsPresenterDependencies) {
    this.store = store;
    this.discordSeriesStatsService = discordSeriesStatsService;
    this.analyticsController = analyticsController;
    this.guildId = guildId;
    this.queueNumber = queueNumber;
    this.settings = settings;
  }

  private async fetchDetail(): Promise<NonNullable<DiscordSeriesStatsSnapshot["response"]>> {
    const response = await this.discordSeriesStatsService.getDetail(this.guildId, this.queueNumber);
    return response.data;
  }

  private isCurrentRequest(activeRequest: number): boolean {
    return !this.isDisposed && activeRequest === this.requestNumber;
  }

  start(): void {
    if (this.isDisposed) {
      return;
    }
    this.initializeSettings();
    this.requestNumber += 1;
    const activeRequest = this.requestNumber;

    this.analyticsController.reset();
    if (!this.isCurrentRequest(activeRequest)) {
      return;
    }
    this.store.setLoading();
    void this.startAsync(activeRequest);
  }

  private async startAsync(activeRequest: number): Promise<void> {
    try {
      const response = await this.fetchDetail();
      if (!this.isCurrentRequest(activeRequest)) {
        return;
      }
      if ("matches" in response) {
        this.analyticsController.reset(
          response.matches.results.filter((result) => result.status === "resolved").map((result) => result.matchId),
        );
      }
      if (!this.isCurrentRequest(activeRequest)) {
        return;
      }
      this.store.setLoaded(response);
    } catch {
      if (!this.isCurrentRequest(activeRequest)) {
        return;
      }
      this.store.setError("Failed to load stats");
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.requestNumber += 1;
    this.analyticsController.dispose();
  }

  loadAnalytics(module: AnalyticsModule, matchId?: string): void {
    this.analyticsController.load(module, matchId);
  }

  setViewMode(mode: ViewMode): void {
    const archiveViewMode = mode === "standard" ? "standard" : "wide";
    this.store.update({ viewMode: archiveViewMode });
    if (typeof window !== "undefined") {
      window.history.replaceState(
        window.history.state,
        "",
        buildUrlWithViewMode(window.location.href, archiveViewMode),
      );
    }
  }

  setSeriesSettings(updates: Partial<SeriesStreamerSettings>): void {
    const next = { ...this.store.getSnapshot().seriesSettings, ...updates };
    this.store.update({ seriesSettings: next });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const params = encodeSettingsToUrlParams({ ...this.settings, series: next });
      for (const key of ["title", "subtitle"]) {
        if (Object.hasOwn(params, key)) {
          url.searchParams.set(key, params[key]);
        } else {
          url.searchParams.delete(key);
        }
      }
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }

  setAnalytics(analyticsByMatchId: SeriesMatchAnalyticsById): void {
    if (!this.isDisposed) {
      this.store.update({ analyticsByMatchId });
    }
  }

  private initializeSettings(): void {
    const settings =
      typeof window === "undefined"
        ? this.settings
        : parseSettingsFromUrl(new URLSearchParams(window.location.search), this.settings);
    this.store.update({
      seriesSettings: settings.series,
      viewMode: settings.global.viewMode === "standard" ? "standard" : "wide",
    });
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
