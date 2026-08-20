import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { SearchEsra } from "@guilty-spark/shared/contracts/individual-tracker/search-esra";
import type {
  IndividualStatsHighlightOption,
  StreamerViewSettings,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
  INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTIONS,
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
import type { MatchHistoryPaginationStore } from "./match-history-pagination-store";

const MATCH_PAGE_SIZE = 25;

const individualStatsHighlightOptionSet = new Set<string>(INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTIONS);

function isIndividualStatsHighlightOption(value: string): value is IndividualStatsHighlightOption {
  return individualStatsHighlightOptionSet.has(value);
}

interface Config {
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerSettingsService: IndividualTrackerSettingsService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly viewerStore: IndividualTrackerViewerStore;
  readonly paginationStore: MatchHistoryPaginationStore;
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
    this.config.viewerStore.setLoading();
    this.config.paginationStore.update({ hasMore: false, loadingMore: false });
    void this.runSearch(trimmed, modeVersion);
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

  private async runSearch(gamertag: string, modeVersion: number): Promise<void> {
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

      void this.loadEsraAsync(result.gamertag, modeVersion);
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

  private async loadEsraAsync(gamertag: string, modeVersion: number): Promise<void> {
    try {
      const esra = await this.config.individualTrackerService.getSearchEsra(gamertag);
      if (this.isStale(modeVersion)) {
        return;
      }
      this.esra = esra;
      this.refreshView();
    } catch {
      // ESRA is a best-effort highlight — leave it absent on failure.
    }
  }

  private async loadMoreAsync(): Promise<void> {
    if (this.xuid == null) {
      return;
    }
    const { modeVersion } = this;
    this.config.paginationStore.update({ loadingMore: true });
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
      this.config.paginationStore.update({
        hasMore: response.matches.length >= MATCH_PAGE_SIZE,
        loadingMore: false,
      });
      this.refreshView();
    } catch (error) {
      if (this.isStale(modeVersion)) {
        return;
      }
      this.config.paginationStore.update({ loadingMore: false });
      if (isInitialPage) {
        this.config.viewerStore.setError(error instanceof Error ? error.message : "Failed to load match history.");
      }
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
