import { getDurationInIsoString } from "@guilty-spark/shared/halo/duration";
import type { MatchDetail, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { AnalyticsModule, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getStreamerViewTeamColorIds } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import type { MatchDetailsService, SeriesDetailService } from "../../../services/stats/detail-types";
import { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { DEFAULT_TEAM_COLORS, getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import type { SeriesMatchAnalyticsById, SeriesMatchAnalyticsState } from "../../series-stats/types";
import type { IndividualTrackerViewerStore, MatchEntryLoadedState, SeriesEntryLoadedState } from "./viewer-store";
import type { ViewerSeriesTab, ViewerTimelineItem } from "./types";

interface MatchAnalyticsSource {
  readonly matchSource: MatchDetail;
  analytics: MatchAnalytics | null;
  readonly requestedModules: Set<AnalyticsModule>;
  readonly moduleStatuses: Map<AnalyticsModule, ComponentLoaderStatus>;
}

interface SeriesAnalyticsSource {
  readonly data: SeriesDetailResponse;
  analyticsByMatchId: SeriesMatchAnalyticsById;
}

export interface EntryDetailControllerConfig {
  readonly store: IndividualTrackerViewerStore;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly matchDetailsService?: MatchDetailsService | undefined;
  readonly seriesDetailService?: SeriesDetailService | undefined;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly trackerId?: string;
}

const SERIES_ANALYTICS_BATCH_SIZE = 30;

// Shared by the live tracker viewer and the search-based match history page — both render the
// same timeline/entry-expand UI and only differ in how the top-level TrackerViewState is sourced.
export class EntryDetailController {
  private readonly config: EntryDetailControllerConfig;
  private readonly matchAnalyticsSources = new Map<string, MatchAnalyticsSource>();
  private readonly seriesAnalyticsSources = new Map<string, SeriesAnalyticsSource>();
  private isDisposed = false;

  public constructor(config: EntryDetailControllerConfig) {
    this.config = config;
  }

  private static entryKey(item: ViewerTimelineItem): string {
    if (item.type === "match") {
      return `match:${item.match.matchId}`;
    }
    return `series:${item.series.id}`;
  }

  private shouldAbort(): boolean {
    return this.isDisposed;
  }

  public dispose(): void {
    this.isDisposed = true;
    this.matchAnalyticsSources.clear();
    this.seriesAnalyticsSources.clear();
  }

  public toggleEntry(item: ViewerTimelineItem): void {
    if (this.isDisposed) {
      return;
    }
    const key = EntryDetailController.entryKey(item);
    const snapshot = this.config.store.getSnapshot();
    const isExpanded = snapshot.expandedEntryKeys.has(key);
    this.config.store.setEntryExpanded(key, !isExpanded);

    if (isExpanded) {
      return;
    }

    const cachedEntryState = snapshot.entryStates.get(key);
    if (cachedEntryState != null && cachedEntryState.state.status !== "error") {
      return;
    }

    if (item.type === "match") {
      void this.fetchMatchEntry(key, item.match.matchId);
      return;
    }

    if (item.series.matches.length === 0) {
      return;
    }

    void this.fetchSeriesEntry(key, item.series);
  }

  public loadAnalytics(item: ViewerTimelineItem, module: AnalyticsModule, matchId?: string): void {
    const key = EntryDetailController.entryKey(item);
    if (item.type === "match") {
      const source = this.matchAnalyticsSources.get(key);
      if (source == null || this.isModuleSatisfied(source.requestedModules, module)) {
        return;
      }

      source.requestedModules.add(module);
      void this.fetchMatchAnalyticsAsync(key, item.match.matchId, module, source);
      return;
    }

    const source = this.seriesAnalyticsSources.get(key);
    if (source == null || (module === "scoreProgression" && matchId == null)) {
      return;
    }

    const matchIds = [
      ...new Set(
        source.data.matches.results
          .filter((result) => result.status === "resolved" && (matchId == null || result.matchId === matchId))
          .map((result) => result.matchId),
      ),
    ].filter((id) => {
      const state = source.analyticsByMatchId.get(id);
      if (module === "killMatrix" && state?.scoreProgression?.status === ComponentLoaderStatus.LOADING) {
        return false;
      }
      const status = state?.[module]?.status;
      return status !== ComponentLoaderStatus.LOADING && status !== ComponentLoaderStatus.LOADED;
    });
    if (matchIds.length === 0) {
      return;
    }
    this.updateSeriesAnalytics(key, source, matchIds, module, ComponentLoaderStatus.LOADING);
    void this.fetchSeriesAnalyticsAsync(key, module, source, matchIds);
  }

  /**
   * The API always includes killMatrix when scoreProgression is requested (see
   * api/services/analytics/analytics.ts), so a killMatrix request is redundant while
   * scoreProgression has already been requested for the same entry.
   */
  private isModuleSatisfied(requestedModules: Set<AnalyticsModule>, module: AnalyticsModule): boolean {
    if (requestedModules.has(module)) {
      return true;
    }

    return module === "killMatrix" && requestedModules.has("scoreProgression");
  }

  private async fetchMatchSource(matchId: string): Promise<MatchDetail> {
    const response = await this.config.matchDetailsService?.getMatchDetails([matchId], this.config.trackerId);
    const result = response?.results.find((candidate) => candidate.matchId === matchId);
    if (result?.status !== "resolved") {
      throw new Error("Failed to load match source");
    }
    return result.detail;
  }

  private toMatchEntryLoadedState(
    detail: MatchDetail,
    analytics: MatchAnalytics | null,
    killMatrixStatus: ComponentLoaderStatus,
    scoreProgressionStatus: ComponentLoaderStatus,
    teamColors: readonly TeamColor[],
  ): MatchEntryLoadedState {
    const controller = new StatsDetailController();
    const data = controller.mapMatchDetailToStats(detail);
    const matchTeamColors: TeamColor[] = [];
    for (const [index, team] of [...detail.teams].sort((a, b) => a.matchTeamId - b.matchTeamId).entries()) {
      matchTeamColors[team.matchTeamId] = teamColors[index] ?? getTeamColorOrDefault(undefined, index);
    }

    return {
      matchId: detail.matchId,
      gameVariantCategory: detail.mode.gameVariantCategory,
      gameMapThumbnailUrl: detail.map.thumbnailUrl ?? "data:,",
      duration: getDurationInIsoString(Math.floor(detail.durationSeconds)),
      startTime: detail.startTime,
      endTime: detail.endTime,
      data,
      ...controller.mapMatchDetailToAnalytics(detail, {
        killMatrix: analytics?.killMatrix ?? null,
        scoreProgression: analytics?.scoreProgression ?? null,
        teamColors: matchTeamColors,
        teamSize: data[0]?.players.length ?? null,
      }),
      killMatrixStatus,
      scoreProgressionStatus,
    };
  }

  private async fetchMatchEntry(key: string, matchId: string): Promise<void> {
    this.config.store.setEntryLoading(key, "match");
    try {
      const matchSource = await this.fetchMatchSource(matchId);
      if (this.isDisposed) {
        return;
      }

      const teamColors = this.resolveTeamColors();
      const loadingState = this.toMatchEntryLoadedState(
        matchSource,
        null,
        ComponentLoaderStatus.PENDING,
        ComponentLoaderStatus.PENDING,
        teamColors,
      );
      this.config.store.setMatchEntryLoaded(key, loadingState);
      this.matchAnalyticsSources.set(key, {
        matchSource,
        analytics: null,
        requestedModules: new Set(),
        moduleStatuses: new Map(),
      });
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setEntryError(key, "match", error instanceof Error ? error.message : "Failed to load stats");
    }
  }

  private async fetchMatchAnalyticsAsync(
    key: string,
    matchId: string,
    module: AnalyticsModule,
    source: MatchAnalyticsSource,
  ): Promise<void> {
    source.moduleStatuses.set(module, ComponentLoaderStatus.LOADING);
    const loadingState = this.toMatchEntryLoadedState(
      source.matchSource,
      source.analytics,
      source.moduleStatuses.get("killMatrix") ?? ComponentLoaderStatus.PENDING,
      source.moduleStatuses.get("scoreProgression") ?? ComponentLoaderStatus.PENDING,
      this.resolveTeamColors(),
    );
    this.config.store.setMatchEntryLoaded(key, loadingState);

    try {
      const results = await this.config.matchAnalyticsService.getBatchMatchAnalytics(
        [matchId],
        [module],
        this.config.trackerId,
      );
      if (this.shouldAbort()) {
        return;
      }

      const analytics = results[matchId];
      if (analytics == null) {
        throw new Error("Failed to load match analytics");
      }
      source.analytics = this.mergeAnalytics(source.analytics, analytics);
      this.syncRequestedModules(source.requestedModules, source.analytics);
      source.moduleStatuses.set(module, ComponentLoaderStatus.LOADED);
      this.markModulesLoaded(source.moduleStatuses, source.analytics);
      const loadedState = this.toMatchEntryLoadedState(
        source.matchSource,
        source.analytics,
        source.moduleStatuses.get("killMatrix") ?? ComponentLoaderStatus.PENDING,
        source.moduleStatuses.get("scoreProgression") ?? ComponentLoaderStatus.PENDING,
        this.resolveTeamColors(),
      );
      this.config.store.setMatchEntryLoaded(key, loadedState);
    } catch {
      if (this.shouldAbort()) {
        return;
      }

      if (source.moduleStatuses.get(module) !== ComponentLoaderStatus.LOADED) {
        source.requestedModules.delete(module);
        source.moduleStatuses.set(module, ComponentLoaderStatus.ERROR);
      }
      const loadedState = this.toMatchEntryLoadedState(
        source.matchSource,
        source.analytics,
        source.moduleStatuses.get("killMatrix") ?? ComponentLoaderStatus.PENDING,
        source.moduleStatuses.get("scoreProgression") ?? ComponentLoaderStatus.PENDING,
        this.resolveTeamColors(),
      );
      this.config.store.setMatchEntryLoaded(key, loadedState);
    }
  }

  private async fetchSeriesEntry(key: string, series: ViewerSeriesTab): Promise<void> {
    this.config.store.setEntryLoading(key, "series");
    try {
      const data = await this.config.seriesDetailService?.getSeriesDetail(
        series.id,
        series.matches.map((match) => match.matchId),
        this.config.trackerId,
        "substitution-aware",
      );
      if (this.shouldAbort()) {
        return;
      }
      if (data == null) {
        throw new Error("Failed to load series");
      }
      const source: SeriesAnalyticsSource = { data, analyticsByMatchId: new Map() };
      this.seriesAnalyticsSources.set(key, source);
      const state: SeriesEntryLoadedState = { seriesId: series.id, ...source };
      this.config.store.setSeriesEntryLoaded(key, state);
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setEntryError(key, "series", error instanceof Error ? error.message : "Failed to load series");
    }
  }

  private async fetchSeriesAnalyticsAsync(
    key: string,
    module: AnalyticsModule,
    source: SeriesAnalyticsSource,
    matchIds: readonly string[],
  ): Promise<void> {
    for (let index = 0; index < matchIds.length; index += SERIES_ANALYTICS_BATCH_SIZE) {
      if (this.shouldAbort() || this.seriesAnalyticsSources.get(key) !== source) {
        return;
      }
      const batchMatchIds = matchIds.slice(index, index + SERIES_ANALYTICS_BATCH_SIZE);
      try {
        const batch = await this.config.matchAnalyticsService.getBatchMatchAnalytics(
          batchMatchIds,
          [module],
          this.config.trackerId,
        );

        if (this.shouldAbort() || this.seriesAnalyticsSources.get(key) !== source) {
          return;
        }
        this.updateSeriesAnalytics(key, source, batchMatchIds, module, ComponentLoaderStatus.LOADED, batch);
      } catch {
        if (this.shouldAbort() || this.seriesAnalyticsSources.get(key) !== source) {
          return;
        }
        this.updateSeriesAnalytics(key, source, matchIds.slice(index), module, ComponentLoaderStatus.ERROR);
        return;
      }
    }
  }

  private updateSeriesAnalytics(
    key: string,
    source: SeriesAnalyticsSource,
    matchIds: readonly string[],
    module: AnalyticsModule,
    status: ComponentLoaderStatus,
    results: Readonly<Record<string, MatchAnalytics | null>> = {},
  ): void {
    const next = new Map(source.analyticsByMatchId);
    for (const matchId of matchIds) {
      const current = next.get(matchId);
      const analytics = results[matchId];
      if (current?.[module]?.status === ComponentLoaderStatus.LOADED && analytics == null) {
        continue;
      }
      const moduleStatus =
        status === ComponentLoaderStatus.LOADED && analytics == null ? ComponentLoaderStatus.ERROR : status;
      let state: SeriesMatchAnalyticsState =
        module === "killMatrix"
          ? { ...current, killMatrix: { status: moduleStatus, data: analytics?.killMatrix ?? null } }
          : { ...current, scoreProgression: { status: moduleStatus, data: analytics?.scoreProgression ?? null } };
      if (analytics?.requestedModules.includes("killMatrix") === true && module !== "killMatrix") {
        state = { ...state, killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix } };
      }
      next.set(matchId, state);
    }
    source.analyticsByMatchId = next;
    this.config.store.setSeriesEntryLoaded(key, { seriesId: source.data.seriesId, ...source });
  }

  private syncRequestedModules(requestedModules: Set<AnalyticsModule>, analytics: MatchAnalytics | null): void {
    if (analytics == null) {
      return;
    }

    for (const module of analytics.requestedModules) {
      requestedModules.add(module);
    }
  }

  private markModulesLoaded(
    moduleStatuses: Map<AnalyticsModule, ComponentLoaderStatus>,
    analytics: MatchAnalytics | null,
  ): void {
    if (analytics == null) {
      return;
    }

    for (const module of analytics.requestedModules) {
      moduleStatuses.set(module, ComponentLoaderStatus.LOADED);
    }
  }

  private mergeAnalytics(existing: MatchAnalytics | null, incoming: MatchAnalytics | null): MatchAnalytics | null {
    if (incoming == null) {
      return existing;
    }
    if (existing == null) {
      return incoming;
    }

    return {
      ...existing,
      ...incoming,
      killMatrix: { ...existing.killMatrix, ...incoming.killMatrix },
      scoreProgression: incoming.scoreProgression ?? existing.scoreProgression,
      requestedModules: [...new Set([...existing.requestedModules, ...incoming.requestedModules])],
    };
  }

  private resolveTeamColors(): readonly TeamColor[] {
    const snapshot = this.config.store.getSnapshot();
    const { teamColorId, enemyColorId } = getStreamerViewTeamColorIds(snapshot.view?.streamerSettings);
    return [
      getTeamColorOrDefault(teamColorId ?? DEFAULT_TEAM_COLORS[0], 0),
      getTeamColorOrDefault(enemyColorId ?? DEFAULT_TEAM_COLORS[1], 1),
    ];
  }
}
