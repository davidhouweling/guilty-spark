import { getDurationInIsoString } from "@guilty-spark/shared/halo/duration";
import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import type { AnalyticsModule, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getStreamerViewTeamColorIds } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/series-matches/types";
import type { StatsDetailController } from "../stats/stats-detail-controller";
import { ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { DEFAULT_TEAM_COLORS, getTeamColorOrDefault } from "../../components/team-colors/team-colors";
import type { TeamColor } from "../../components/team-colors/team-colors";
import type { SeriesMatchAnalyticsById } from "../../components/series-stats/types";
import type { SeriesAnalyticsController } from "../series-analytics/series-analytics-controller";
import { SeriesDetailController } from "../series-detail/series-detail-controller";
import type {
  IndividualTrackerViewerStore,
  MatchEntryLoadedState,
} from "../../components/individual-tracker/viewer/viewer-store";
import type { ViewerTimelineItem } from "../../components/individual-tracker/viewer/types";

interface MatchAnalyticsSource {
  readonly matchSource: MatchDetail;
  analytics: MatchAnalytics | null;
  readonly requestedModules: Set<AnalyticsModule>;
  readonly moduleStatuses: Map<AnalyticsModule, ComponentLoaderStatus>;
}

export interface EntryDetailControllerConfig {
  readonly store: IndividualTrackerViewerStore;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly statsDetailController: StatsDetailController;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly createSeriesAnalyticsController: (
    onChange: (analyticsByMatchId: SeriesMatchAnalyticsById) => void,
  ) => SeriesAnalyticsController;
  readonly trackerId?: string;
}

export class EntryDetailController {
  private readonly config: EntryDetailControllerConfig;
  private readonly matchAnalyticsSources = new Map<string, MatchAnalyticsSource>();
  private readonly seriesDetailController: SeriesDetailController;
  private isDisposed = false;

  public constructor(config: EntryDetailControllerConfig) {
    this.config = config;
    this.seriesDetailController = new SeriesDetailController({
      seriesMatchesService: config.seriesMatchesService,
      trackerId: config.trackerId,
      createSeriesAnalyticsController: config.createSeriesAnalyticsController,
      onChange: (seriesId, state): void => {
        const key = `series:${seriesId}`;
        if (state.status === "loading") {
          config.store.setEntryLoading(key, "series");
        } else if (state.status === "error") {
          config.store.setEntryError(key, "series", state.message);
        } else {
          config.store.setSeriesEntryLoaded(key, {
            seriesId: state.data.seriesId,
            data: state.data,
            analyticsByMatchId: state.analyticsByMatchId,
          });
        }
      },
    });
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
    this.seriesDetailController.dispose();
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

    if (item.type === "match") {
      const cachedEntryState = snapshot.entryStates.get(key);
      if (cachedEntryState != null && cachedEntryState.state.status !== "error") {
        return;
      }
      void this.fetchMatchEntry(key, item.match.matchId);
      return;
    }

    if (item.series.matches.length === 0) {
      return;
    }

    this.seriesDetailController.load({
      seriesId: item.series.id,
      matchIds: item.series.matches.map((match) => match.matchId),
      teamMappingMode: "substitution-aware",
    });
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

    this.seriesDetailController.loadAnalytics(item.series.id, module, matchId);
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
    const response = await this.config.seriesMatchesService.getMatchDetails([matchId], this.config.trackerId);
    const result = response.results.find((candidate) => candidate.matchId === matchId);
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
    const controller = this.config.statsDetailController;
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
