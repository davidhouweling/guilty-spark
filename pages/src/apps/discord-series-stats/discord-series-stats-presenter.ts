import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import type {
  AllStreamerSettings,
  DisplaySettings,
  FontSizeSettings,
  GlobalStreamerSettings,
  ObserverViewColorSettings,
  SeriesStreamerSettings,
  TickerSettings,
} from "../../components/live-tracker/settings/types";
import type { ArchiveGlobalSettingsUpdates } from "../../components/discord-series-stats/types";
import {
  buildUrlWithViewMode,
  encodeSettingsToUrlParams,
  parseSettingsFromUrl,
} from "../../components/live-tracker/settings/settings-url-params";
import type { ViewMode } from "../../components/view-mode/view-mode-selector";
import type { SeriesMatchAnalyticsById } from "../../components/series-stats/types";
import type { SeriesAnalyticsController } from "../../controllers/series-analytics/series-analytics-controller";
import type { DiscordSeriesStatsService } from "../../services/stats/discord-series-types";
import type { DiscordSeriesStatsStore } from "./discord-series-stats-store";
import type { DiscordSeriesStatsSnapshot, DiscordSeriesStatsViewModel } from "./types";

function setSettingsParams(
  url: URL,
  values: Partial<DisplaySettings> | Partial<TickerSettings> | Partial<FontSizeSettings>,
  prefix = "",
): void {
  for (const [key, value] of Object.entries<boolean | number | readonly string[] | readonly number[] | undefined>(
    values,
  )) {
    if (value === undefined) {
      continue;
    }
    const param = key === "selectedSlayerStats" ? "enabledStats" : `${prefix}${key}`;
    const encoded = typeof value === "boolean" || typeof value === "number" ? value.toString() : value.join(",");
    url.searchParams.set(param, encoded);
  }
}

function updateSettingsUrl(updates: ArchiveGlobalSettingsUpdates): void {
  const url = new URL(window.location.href);
  setSettingsParams(url, updates.display ?? {});
  setSettingsParams(url, updates.ticker ?? {});
  setSettingsParams(url, updates.fontSizes ?? {}, "fontSize_");
  window.history.replaceState(window.history.state, "", url.toString());
}

interface DiscordSeriesStatsPresenterDependencies {
  readonly store: DiscordSeriesStatsStore;
  readonly discordSeriesStatsService: DiscordSeriesStatsService;
  readonly analyticsController: SeriesAnalyticsController;
  readonly guildId: string;
  readonly queueNumber: string;
  readonly settings: AllStreamerSettings;
  readonly updateGlobalSettings: (settings: Partial<GlobalStreamerSettings>) => void;
}

export class DiscordSeriesStatsPresenter {
  private readonly store: DiscordSeriesStatsStore;
  private readonly discordSeriesStatsService: DiscordSeriesStatsService;
  private readonly analyticsController: SeriesAnalyticsController;
  private readonly guildId: string;
  private readonly queueNumber: string;
  private readonly settings: AllStreamerSettings;
  private readonly updateGlobalSettings: (settings: Partial<GlobalStreamerSettings>) => void;
  private persistedObserverColors: ObserverViewColorSettings;
  private persistedGlobalSettings: GlobalStreamerSettings;
  private isDisposed = false;
  private requestNumber = 0;

  constructor({
    store,
    discordSeriesStatsService,
    analyticsController,
    guildId,
    queueNumber,
    settings,
    updateGlobalSettings,
  }: DiscordSeriesStatsPresenterDependencies) {
    this.store = store;
    this.discordSeriesStatsService = discordSeriesStatsService;
    this.analyticsController = analyticsController;
    this.guildId = guildId;
    this.queueNumber = queueNumber;
    this.settings = settings;
    this.updateGlobalSettings = updateGlobalSettings;
    this.persistedObserverColors = settings.global.colors.observerView;
    this.persistedGlobalSettings = settings.global;
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
    this.store.update({ viewMode: mode });
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", buildUrlWithViewMode(window.location.href, mode));
    }
  }

  setViewPreview(enabled: boolean): void {
    const { urlSettings } = this.store.getSnapshot();
    this.store.update({ urlSettings: { ...urlSettings, global: { ...urlSettings.global, viewPreview: enabled } } });
    this.updateGlobalSettings({ viewPreview: enabled });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("viewPreview", enabled.toString());
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }

  setGlobalSettings(updates: ArchiveGlobalSettingsUpdates): void {
    const { urlSettings } = this.store.getSnapshot();
    const global = {
      ...urlSettings.global,
      display: { ...urlSettings.global.display, ...updates.display },
      ticker: { ...urlSettings.global.ticker, ...updates.ticker },
      fontSizes: { ...urlSettings.global.fontSizes, ...updates.fontSizes },
    };
    this.store.update({ urlSettings: { ...urlSettings, global } });
    this.persistedGlobalSettings = {
      ...this.persistedGlobalSettings,
      display: { ...this.persistedGlobalSettings.display, ...updates.display },
      ticker: { ...this.persistedGlobalSettings.ticker, ...updates.ticker },
      fontSizes: { ...this.persistedGlobalSettings.fontSizes, ...updates.fontSizes },
    };
    this.updateGlobalSettings({
      ...(updates.display && { display: this.persistedGlobalSettings.display }),
      ...(updates.ticker && { ticker: this.persistedGlobalSettings.ticker }),
      ...(updates.fontSizes && { fontSizes: this.persistedGlobalSettings.fontSizes }),
    });
    if (typeof window !== "undefined") {
      updateSettingsUrl(updates);
    }
  }

  setSeriesSettings(updates: Partial<SeriesStreamerSettings>): void {
    const next = { ...this.store.getSnapshot().seriesSettings, ...updates };
    this.store.update({ seriesSettings: next });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const params = encodeSettingsToUrlParams({ ...this.settings, series: next });
      const fields: readonly { setting: keyof SeriesStreamerSettings; key: string }[] = [
        { setting: "titleOverride", key: "title" },
        { setting: "subtitleOverride", key: "subtitle" },
        { setting: "eagleTeamNameOverride", key: "eagleTeamName" },
        { setting: "cobraTeamNameOverride", key: "cobraTeamName" },
      ];
      for (const { setting, key } of fields) {
        if (!Object.hasOwn(updates, setting)) {
          continue;
        }
        if (Object.hasOwn(params, key)) {
          url.searchParams.set(key, params[key]);
        } else {
          url.searchParams.delete(key);
        }
      }
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }

  setObserverColors(updates: Partial<ObserverViewColorSettings>): void {
    const observerColors = { ...this.store.getSnapshot().observerColors, ...updates };
    this.store.update({ observerColors });
    this.persistedObserverColors = { ...this.persistedObserverColors, ...updates };
    this.updateGlobalSettings({
      colors: { ...this.settings.global.colors, observerView: this.persistedObserverColors },
    });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (updates.eagleColor != null) {
        url.searchParams.set("eagleColor", updates.eagleColor);
      }
      if (updates.cobraColor != null) {
        url.searchParams.set("cobraColor", updates.cobraColor);
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
      urlSettings: settings,
      seriesSettings: settings.series,
      observerColors: settings.global.colors.observerView,
      viewMode: settings.global.viewMode,
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
