import type { MatchStats } from "halo-infinite-api";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { AnalyticsModule, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesMatchesResponse } from "@guilty-spark/shared/contracts/stats/series-matches";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { isMatchStats } from "../../../controllers/stats/is-match-stats";
import { StatsController } from "../../../controllers/stats/stats-controller";
import { KillMatrixFormatter } from "../../../controllers/stats/kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA } from "../../../controllers/stats/kill-matrix/types";
import type { KillMatrixPlayer } from "../../../controllers/stats/kill-matrix/types";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { DEFAULT_TEAM_COLORS, getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import { buildSeriesViewModel } from "../../series-stats/build-series-view-model";
import { formatScoreProgression } from "../../stats/score-progression/score-progression-formatter";
import type { IndividualTrackerViewerStore, MatchEntryLoadedState, SeriesEntryLoadedState } from "./viewer-store";
import type { ViewerSeriesTab, ViewerTimelineItem } from "./types";

export interface MatchStatsLoadedState {
  readonly stats: MatchStats;
  readonly playerMap: Map<string, string>;
  readonly medalMetadata: MedalMetadata;
  readonly gameMapThumbnailUrl: string;
}

interface MatchAnalyticsSource {
  readonly matchSource: MatchStatsLoadedState;
  analytics: MatchAnalytics | null;
  readonly requestedModules: Set<AnalyticsModule>;
  readonly moduleStatuses: Map<AnalyticsModule, ComponentLoaderStatus>;
}

interface SeriesAnalyticsSource {
  readonly series: ViewerSeriesTab;
  readonly matches: SeriesMatchesResponse["matches"];
  readonly rawMatches: readonly MatchStats[];
  readonly medalMetadata: MedalMetadata;
  readonly playerMap: Map<string, string>;
  readonly analyticsByMatchId: Map<string, MatchAnalytics>;
  readonly requestedModules: Set<AnalyticsModule>;
  readonly moduleStatuses: Map<AnalyticsModule, ComponentLoaderStatus>;
}

export interface EntryDetailControllerConfig {
  readonly store: IndividualTrackerViewerStore;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly trackerId?: string;
}

const SERIES_MATCHES_BATCH_SIZE = 30;

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

  public loadAnalytics(item: ViewerTimelineItem, module: AnalyticsModule): void {
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
    if (source == null || this.isModuleSatisfied(source.requestedModules, module)) {
      return;
    }

    source.requestedModules.add(module);
    void this.fetchSeriesAnalyticsAsync(key, module, source);
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

  private async fetchMatchSource(matchId: string): Promise<MatchStatsLoadedState> {
    const seriesMatches = await this.config.seriesMatchesService.getSeriesMatches([matchId], this.config.trackerId);

    if (seriesMatches.matches.length === 0) {
      throw new Error("Failed to load match source");
    }

    const [matchSummary] = seriesMatches.matches;
    if (!isMatchStats(matchSummary.rawMatch)) {
      throw new Error("Failed to load match source");
    }

    const stats = matchSummary.rawMatch;
    const playerMap = new Map(Object.entries(seriesMatches.playerXuidToGametag));
    const xuids = stats.Players.filter((p) => p.PlayerType === 1).map((p) => getPlayerXuid(p));
    for (const xuid of xuids) {
      if (!playerMap.has(xuid)) {
        playerMap.set(xuid, xuid);
      }
    }

    const medalMetadata = await this.config.medalMetadataResolver.getMedalMetadataForMatch(stats);

    return { stats, playerMap, medalMetadata, gameMapThumbnailUrl: matchSummary.gameMapThumbnailUrl };
  }

  private toMatchEntryLoadedState(
    loadedState: MatchStatsLoadedState,
    analytics: MatchAnalytics | null,
    killMatrixStatus: ComponentLoaderStatus,
    scoreProgressionStatus: ComponentLoaderStatus,
    teamColors: readonly TeamColor[],
  ): MatchEntryLoadedState {
    const { stats, playerMap, medalMetadata, gameMapThumbnailUrl } = loadedState;
    const controller = new StatsController();
    controller.loadMatch(stats, playerMap, medalMetadata);
    if (analytics != null) {
      controller.loadAnalytics(analytics, playerMap);
    }

    const killMatrixRows = analytics != null ? controller.getKillMatrix() : null;
    const players = controller.getPlayers();
    const playersByGamertag = new Map(players.map((p) => [p.gamertag, p]));
    const matchStats = controller.getMatchStats();
    const resolvedPlayers = matchStats
      .flatMap((teamData) => teamData.players.map((p) => playersByGamertag.get(p.name)))
      .filter((p): p is KillMatrixPlayer => p != null);
    const orderedPlayers = resolvedPlayers.length === players.length ? resolvedPlayers : players;
    const crossTeam =
      killMatrixRows != null ? KillMatrixFormatter.buildCrossTeam(killMatrixRows, orderedPlayers) : null;

    return {
      matchId: stats.MatchId,
      gameVariantCategory: stats.MatchInfo.GameVariantCategory,
      gameMapThumbnailUrl,
      duration: stats.MatchInfo.Duration,
      startTime: stats.MatchInfo.StartTime,
      endTime: stats.MatchInfo.EndTime,
      data: matchStats,
      killMatrixPivotData:
        killMatrixRows != null
          ? KillMatrixFormatter.pivot(killMatrixRows, orderedPlayers)
          : EMPTY_KILL_MATRIX_PIVOT_DATA,
      transposedKillMatrixPivotData:
        killMatrixRows != null
          ? KillMatrixFormatter.transpose(killMatrixRows, orderedPlayers)
          : EMPTY_KILL_MATRIX_PIVOT_DATA,
      crossTeamKillMatrixData: crossTeam?.crossTeamData ?? null,
      swappedCrossTeamKillMatrixData: crossTeam?.swappedCrossTeamData ?? null,
      killMatrixStatus,
      scoreProgressionStatus,
      scoreProgressionViewData: formatScoreProgression(
        analytics?.scoreProgression ?? null,
        teamColors,
        matchStats[0]?.players.length ?? null,
      ),
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

      source.analytics = this.mergeAnalytics(source.analytics, results[matchId] ?? null);
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

      source.requestedModules.delete(module);
      source.moduleStatuses.set(module, ComponentLoaderStatus.ERROR);
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
      const requestedMatchIds = series.matches.map((match) => match.matchId);
      const uniqueMatchIds = [...new Set(requestedMatchIds)];
      const seriesDataChunks: SeriesMatchesResponse[] = [];

      for (let index = 0; index < uniqueMatchIds.length; index += SERIES_MATCHES_BATCH_SIZE) {
        if (this.shouldAbort()) {
          return;
        }
        const batchMatchIds = uniqueMatchIds.slice(index, index + SERIES_MATCHES_BATCH_SIZE);
        const batchSeriesData = await this.config.seriesMatchesService.getSeriesMatches(
          batchMatchIds,
          this.config.trackerId,
        );
        if (this.shouldAbort()) {
          return;
        }
        seriesDataChunks.push(batchSeriesData);
      }

      const mergedMatchesById = new Map(seriesDataChunks.flatMap((chunk) => chunk.matches).map((m) => [m.matchId, m]));
      const mergedSeriesData: SeriesMatchesResponse = {
        playerXuidToGametag: Object.assign({}, ...seriesDataChunks.map((chunk) => chunk.playerXuidToGametag)),
        matches: requestedMatchIds
          .map((matchId) => mergedMatchesById.get(matchId))
          .filter((match): match is SeriesMatchesResponse["matches"][number] => match != null),
      };

      const playerMap = new Map(Object.entries(mergedSeriesData.playerXuidToGametag));
      const rawMatches = mergedSeriesData.matches
        .map((m) => m.rawMatch)
        .filter((m): m is MatchStats => isMatchStats(m));
      const medalMetadata = await this.config.medalMetadataResolver.getMedalMetadataForMatches(rawMatches);

      const teamColors = this.resolveTeamColors();
      const viewModel = buildSeriesViewModel({
        series,
        matches: mergedSeriesData.matches,
        rawMatches,
        medalMetadata,
        playerMap,
        teamColors,
        analyticsByMatchId: new Map(),
        killMatrixStatus: ComponentLoaderStatus.PENDING,
        scoreProgressionStatus: ComponentLoaderStatus.PENDING,
      });

      const state: SeriesEntryLoadedState = { seriesId: series.id, viewModel };
      this.config.store.setSeriesEntryLoaded(key, state);
      this.seriesAnalyticsSources.set(key, {
        series,
        matches: mergedSeriesData.matches,
        rawMatches,
        medalMetadata,
        playerMap,
        analyticsByMatchId: new Map(),
        requestedModules: new Set(),
        moduleStatuses: new Map(),
      });
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
  ): Promise<void> {
    source.moduleStatuses.set(module, ComponentLoaderStatus.LOADING);
    const loadingViewModel = buildSeriesViewModel({
      ...source,
      teamColors: this.resolveTeamColors(),
      killMatrixStatus: source.moduleStatuses.get("killMatrix") ?? ComponentLoaderStatus.PENDING,
      scoreProgressionStatus: source.moduleStatuses.get("scoreProgression") ?? ComponentLoaderStatus.PENDING,
    });
    this.config.store.setSeriesEntryLoaded(key, { seriesId: source.series.id, viewModel: loadingViewModel });

    const requestedMatchIds = source.series.matches.map((match) => match.matchId);
    const uniqueMatchIds = [...new Set(requestedMatchIds)];
    if (uniqueMatchIds.length === 0) {
      source.moduleStatuses.set(module, ComponentLoaderStatus.LOADED);
      const loadedViewModel = buildSeriesViewModel({
        ...source,
        teamColors: this.resolveTeamColors(),
        killMatrixStatus: source.moduleStatuses.get("killMatrix") ?? ComponentLoaderStatus.PENDING,
        scoreProgressionStatus: source.moduleStatuses.get("scoreProgression") ?? ComponentLoaderStatus.PENDING,
      });
      this.config.store.setSeriesEntryLoaded(key, { seriesId: source.series.id, viewModel: loadedViewModel });
      return;
    }

    try {
      for (let index = 0; index < uniqueMatchIds.length; index += SERIES_MATCHES_BATCH_SIZE) {
        if (this.shouldAbort()) {
          return;
        }

        const batchMatchIds = uniqueMatchIds.slice(index, index + SERIES_MATCHES_BATCH_SIZE);
        const batch = await this.config.matchAnalyticsService.getBatchMatchAnalytics(
          batchMatchIds,
          [module],
          this.config.trackerId,
        );

        if (this.shouldAbort()) {
          return;
        }

        for (const [matchId, analytics] of Object.entries(batch)) {
          if (analytics != null) {
            const mergedAnalytics = this.mergeAnalytics(source.analyticsByMatchId.get(matchId) ?? null, analytics);
            if (mergedAnalytics != null) {
              source.analyticsByMatchId.set(matchId, mergedAnalytics);
              this.syncRequestedModules(source.requestedModules, mergedAnalytics);
              this.markModulesLoaded(source.moduleStatuses, mergedAnalytics);
            }
          }
        }
      }

      source.moduleStatuses.set(module, ComponentLoaderStatus.LOADED);
      const loadedViewModel = buildSeriesViewModel({
        ...source,
        teamColors: this.resolveTeamColors(),
        killMatrixStatus: source.moduleStatuses.get("killMatrix") ?? ComponentLoaderStatus.PENDING,
        scoreProgressionStatus: source.moduleStatuses.get("scoreProgression") ?? ComponentLoaderStatus.PENDING,
      });
      this.config.store.setSeriesEntryLoaded(key, { seriesId: source.series.id, viewModel: loadedViewModel });
    } catch {
      if (this.shouldAbort()) {
        return;
      }

      source.requestedModules.delete(module);
      source.moduleStatuses.set(module, ComponentLoaderStatus.ERROR);
      const erroredViewModel = buildSeriesViewModel({
        ...source,
        teamColors: this.resolveTeamColors(),
        killMatrixStatus: source.moduleStatuses.get("killMatrix") ?? ComponentLoaderStatus.PENDING,
        scoreProgressionStatus: source.moduleStatuses.get("scoreProgression") ?? ComponentLoaderStatus.PENDING,
      });
      this.config.store.setSeriesEntryLoaded(key, { seriesId: source.series.id, viewModel: erroredViewModel });
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
      requestedModules: [...new Set([...existing.requestedModules, ...incoming.requestedModules])],
    };
  }

  private resolveTeamColors(): readonly TeamColor[] {
    const snapshot = this.config.store.getSnapshot();
    const styleFlags = snapshot.view?.streamerSettings?.styleFlags;
    return [
      getTeamColorOrDefault(styleFlags?.playerTeamColor ?? styleFlags?.teamColor ?? DEFAULT_TEAM_COLORS[0], 0),
      getTeamColorOrDefault(styleFlags?.playerEnemyColor ?? styleFlags?.enemyColor ?? DEFAULT_TEAM_COLORS[1], 1),
    ];
  }
}
