import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { SearchEsra } from "@guilty-spark/shared/contracts/individual-tracker/search-esra";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
  isIndividualStatsHighlightOption,
  withStreamerViewSettingsDefaults,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import type {
  IndividualTrackerService,
  TrackerMatchHistoryEntry,
  TrackerSearchResult,
} from "../../services/individual-tracker/types";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { EntryDetailController } from "../individual-tracker/viewer/entry-detail-controller";
import type { IndividualTrackerViewerStore } from "../individual-tracker/viewer/viewer-store";
import type { ViewerTimelineItem } from "../individual-tracker/viewer/types";
import { buildSearchTimelineData } from "./build-search-timeline";
import { computeSearchStatsHighlights } from "./compute-search-highlights";

const MATCH_PAGE_SIZE = 25;

interface Config {
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerSettingsService: IndividualTrackerSettingsService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly viewerStore: IndividualTrackerViewerStore;
}

export class MatchHistoryViewerPresenter {
  private readonly config: Config;
  private readonly entryDetailController: EntryDetailController;
  private isDisposed = false;
  private modeVersion = 0;
  private entries: readonly TrackerMatchHistoryEntry[] = [];
  private xuid: string | null = null;
  private searchResult: TrackerSearchResult | null = null;
  private esra: SearchEsra | null = null;
  private settings: StreamerViewSettings | undefined;
  private initialPageLoaded = false;

  public constructor(config: Config) {
    this.config = config;
    this.entryDetailController = new EntryDetailController({
      store: config.viewerStore,
      seriesMatchesService: config.seriesMatchesService,
      matchAnalyticsService: config.matchAnalyticsService,
      medalMetadataResolver: config.medalMetadataResolver,
    });
  }

  public toggleEntry(item: ViewerTimelineItem): void {
    this.entryDetailController.toggleEntry(item);
  }

  public search(gamertag: string): void {
    const trimmed = gamertag.trim();
    if (trimmed === "") {
      return;
    }

    this.modeVersion += 1;
    const { modeVersion } = this;
    this.entries = [];
    this.xuid = null;
    this.searchResult = null;
    this.esra = null;
    this.initialPageLoaded = false;
    this.config.viewerStore.setLoading();
    this.config.viewerStore.setPagination({ hasMore: false, loadingMore: false, loadMoreError: null });
    void this.searchAsync(trimmed, modeVersion);
  }

  public loadMore(): void {
    void this.loadMoreAsync();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.entryDetailController.dispose();
  }

  private isStale(modeVersion: number): boolean {
    return this.isDisposed || modeVersion !== this.modeVersion;
  }

  private async searchAsync(gamertag: string, modeVersion: number): Promise<void> {
    try {
      const [result, settings] = await Promise.all([
        this.config.individualTrackerService.searchGamertag(gamertag),
        this.loadSettingsOnce(),
      ]);
      if (this.isStale(modeVersion)) {
        return;
      }

      if (result == null) {
        this.config.viewerStore.setError("No matching gamertag found.");
        return;
      }

      this.searchResult = result;
      this.xuid = result.xuid;
      this.settings = settings;

      void this.loadEsraAsync(result.xuid, modeVersion);
      await this.loadPage(0, modeVersion, true);
    } catch (error) {
      if (this.isStale(modeVersion)) {
        return;
      }
      this.config.viewerStore.setError(error instanceof Error ? error.message : "Failed to search gamertag.");
    }
  }

  private async loadSettingsOnce(): Promise<StreamerViewSettings | undefined> {
    try {
      return await this.config.individualTrackerSettingsService.getSettings();
    } catch {
      return undefined;
    }
  }

  private async loadEsraAsync(xuid: string, modeVersion: number): Promise<void> {
    try {
      const esra = await this.config.individualTrackerService.getSearchEsra(xuid);
      if (this.isStale(modeVersion)) {
        return;
      }
      this.esra = esra;
      // The initial page load's own refreshView() already reads this.esra once it completes, so
      // skip refreshing here if it hasn't yet — otherwise an ESRA response that resolves faster
      // than the (much heavier) match history fetch would flash an empty "no matches" view.
      if (this.initialPageLoaded) {
        this.refreshView();
      }
    } catch {
      // ESRA is a best-effort highlight — leave it absent on failure.
    }
  }

  private async loadMoreAsync(): Promise<void> {
    if (this.xuid == null || this.config.viewerStore.getSnapshot().loadingMore) {
      return;
    }
    const { modeVersion } = this;
    this.config.viewerStore.setPagination({ loadingMore: true, loadMoreError: null });
    await this.loadPage(this.entries.length, modeVersion, false);
  }

  private async loadPage(start: number, modeVersion: number, isInitialPage: boolean): Promise<void> {
    if (this.xuid == null) {
      return;
    }

    try {
      const response = await this.config.individualTrackerService.getMatchHistory(this.xuid, start, MATCH_PAGE_SIZE);
      if (this.isStale(modeVersion)) {
        return;
      }

      this.entries = isInitialPage ? response.matches : [...this.entries, ...response.matches];
      this.initialPageLoaded = true;
      this.config.viewerStore.setPagination({
        hasMore: response.matches.length >= MATCH_PAGE_SIZE,
        loadingMore: false,
        loadMoreError: null,
      });
      this.refreshView();
    } catch (error) {
      if (this.isStale(modeVersion)) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load match history.";
      if (isInitialPage) {
        this.config.viewerStore.setError(message);
        return;
      }
      this.config.viewerStore.setPagination({ loadingMore: false, loadMoreError: message });
    }
  }

  private refreshView(): void {
    if (this.xuid == null || this.searchResult == null) {
      return;
    }

    const { xuid, searchResult } = this;
    const { matches, series } = buildSearchTimelineData(this.entries, xuid);
    const settingsWithDefaults = withStreamerViewSettingsDefaults(this.settings);
    const storedSlots = settingsWithDefaults.visibleSections?.statsHighlightSlots;
    const statsHighlightSlots =
      storedSlots != null
        ? storedSlots.filter(isIndividualStatsHighlightOption)
        : DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS.slice(0, INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT);
    const statsHighlights = computeSearchStatsHighlights(
      this.entries,
      xuid,
      statsHighlightSlots,
      searchResult.rawCsrContainer,
      this.esra,
    );

    const view: TrackerViewState = {
      trackerId: `search:${xuid}`,
      gamertag: searchResult.gamertag,
      status: "stopped",
      matches: [...matches],
      series: [...series],
      lastUpdateTime: new Date().toISOString(),
      lastMatchDiscoveredAt: null,
      hasActiveSeries: false,
      hasRecentCompletedSeries: false,
      isLive: false,
      streamerSettings: this.settings,
      statsHighlights: [...statsHighlights],
    };

    this.config.viewerStore.setLoaded(view);
    this.config.viewerStore.setConnectionStatus("connected");
  }
}
