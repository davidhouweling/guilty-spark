import type { HaloInfiniteClient } from "halo-infinite-api";
import { getDurationInIsoString } from "@guilty-spark/shared/halo/duration";
import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { StatsController } from "../../../controllers/stats/stats-controller";
import { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";
import { KillMatrixFormatter } from "../../../controllers/stats/kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA } from "../../../controllers/stats/kill-matrix/types";
import type { KillMatrixPlayer } from "../../../controllers/stats/kill-matrix/types";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/series-matches/types";
import type {
  MatchDetailsState,
  SeriesDetailsState,
  ViewerMatchTab,
  ViewerSeriesTab,
  ViewerTimelineItem,
} from "../viewer/types";
import { formatScoreProgression } from "../../stats/score-progression/score-progression-formatter";
import { buildSeriesViewModel } from "../../series-stats/build-series-view-model";
import type { ResolvedSeriesMatch } from "../../series-stats/build-series-view-model";
import type { SeriesStatsViewModel } from "../../series-stats/types";
import { buildMatchHeaderTitle } from "../stats-panel-header";
import { projectStandaloneMatchStats } from "./standalone-match-stats";
import type { MatchStatsState } from "./individual-tracker-overlay-presenter";
import type { OverlayPageSnapshot, OverlayPageStore } from "./overlay-page-store";

interface LoadedSeriesMatch {
  readonly match: ViewerMatchTab;
  readonly state: Extract<MatchStatsState, { status: "loaded" }>;
}

interface OverlayPagePresenterConfig {
  readonly store: OverlayPageStore;
  readonly haloClient: HaloInfiniteClient;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly trackerId?: string;
}

interface OverlayAnalyticsLoadResult {
  readonly status: ComponentLoaderStatus;
  readonly analyticsByMatchId: Readonly<Record<string, MatchAnalytics | null>>;
}

export interface OverlayPageViewModel {
  readonly selectedMatchId: string | null;
  readonly selectedSeriesId: string | null;
  readonly matchStatsState: MatchStatsState | null;
  readonly matchStatsPanelState: MatchDetailsState | null;
}

export class OverlayPagePresenter {
  private readonly config: OverlayPagePresenterConfig;
  private readonly statsDetailController = new StatsDetailController();
  private readonly loads = new Map<string, { token: symbol; source: "raw" | "detail" }>();
  private isDisposed = false;

  private shouldAbort(): boolean {
    return this.isDisposed;
  }

  public constructor(config: OverlayPagePresenterConfig) {
    this.config = config;
  }

  public dispose(): void {
    this.isDisposed = true;
  }

  public reset(): void {
    this.loads.clear();
    this.config.store.reset();
  }

  public preloadMatchStats(matchIds: readonly string[]): void {
    const matchIdsToLoad: string[] = [];
    for (const matchId of matchIds) {
      const existingState = this.config.store.getSnapshot().matchStatsByMatchId.get(matchId);
      if (
        existingState?.status === "loaded" ||
        (existingState?.status === "loading" && this.loads.get(matchId)?.source === "raw")
      ) {
        continue;
      }

      matchIdsToLoad.push(matchId);
    }
    if (matchIdsToLoad.length === 0) {
      return;
    }

    const analyticsPromise = this.loadMatchAnalyticsAsync(matchIdsToLoad);
    for (const matchId of matchIdsToLoad) {
      const token = Symbol();
      this.loads.set(matchId, { token, source: "raw" });
      void this.loadMatchStatsAsync(matchId, token, analyticsPromise);
    }
  }

  public preloadTimelineMatchStats(timeline: readonly ViewerTimelineItem[]): void {
    const seriesIds = new Set(
      timeline.flatMap((item) => (item.type === "series" ? item.series.matches.map((match) => match.matchId) : [])),
    );
    this.preloadMatchStats([...seriesIds]);
    const standaloneIds = timeline.flatMap((item) =>
      item.type === "match" && !seriesIds.has(item.match.matchId) ? [item.match.matchId] : [],
    );
    this.preloadStandaloneMatchStats(standaloneIds);
  }

  private preloadStandaloneMatchStats(matchIds: readonly string[]): void {
    const pending = [...new Set(matchIds)].filter((matchId) => {
      const state = this.config.store.getSnapshot().matchStatsByMatchId.get(matchId);
      return (
        state?.status !== "condensed" && !(state?.status === "loading" && this.loads.get(matchId)?.source === "detail")
      );
    });
    if (pending.length === 0) {
      return;
    }
    for (const matchId of pending) {
      const token = Symbol();
      this.loads.set(matchId, { token, source: "detail" });
      void this.loadStandaloneMatchStatsAsync(matchId, token);
    }
  }

  public findSelectedMatch(
    timeline: readonly ViewerTimelineItem[],
    selectedMatchId: string | null,
  ): ViewerMatchTab | null {
    if (selectedMatchId == null) {
      return null;
    }

    for (const item of timeline) {
      if (item.type === "match" && item.match.matchId === selectedMatchId) {
        return item.match;
      }

      if (item.type === "series") {
        const seriesMatch = item.series.matches.find((match) => match.matchId === selectedMatchId);
        if (seriesMatch != null) {
          return seriesMatch;
        }
      }
    }

    return null;
  }

  public findSelectedSeries(
    timeline: readonly ViewerTimelineItem[],
    selectedSeriesId: string | null,
  ): ViewerSeriesTab | null {
    if (selectedSeriesId == null) {
      return null;
    }

    for (const item of timeline) {
      if (item.type === "series" && item.series.id === selectedSeriesId) {
        return item.series;
      }
    }

    return null;
  }

  public selectMatch(matchId: string, timeline: readonly ViewerTimelineItem[] = []): void {
    const standalone =
      timeline.some((item) => item.type === "match" && item.match.matchId === matchId) &&
      !timeline.some(
        (item) => item.type === "series" && item.series.matches.some((match) => match.matchId === matchId),
      );
    this.config.store.setSelectedMatchId(matchId);

    const existingState = this.config.store.getSnapshot().matchStatsByMatchId.get(matchId);
    if (standalone && existingState?.status === "condensed") {
      this.loadStandaloneAnalytics(matchId, existingState);
      return;
    }
    if (
      (!standalone && existingState?.status === "loaded") ||
      (existingState?.status === "loading" && this.loads.get(matchId)?.source === (standalone ? "detail" : "raw"))
    ) {
      return;
    }

    if (standalone) {
      this.preloadStandaloneMatchStats([matchId]);
    } else {
      this.preloadMatchStats([matchId]);
    }
  }

  public selectSeries(seriesId: string): void {
    this.config.store.setSelectedSeriesId(seriesId);
  }

  public deselect(): void {
    this.config.store.setSelectedMatchId(null);
  }

  public buildSeriesStatsPanelState(
    series: ViewerSeriesTab | null,
    matchStatsByMatchId: ReadonlyMap<string, MatchStatsState>,
  ): SeriesDetailsState | null {
    if (series == null || series.matches.length === 0) {
      return null;
    }

    for (const match of series.matches) {
      const state = matchStatsByMatchId.get(match.matchId);
      if (state?.status === "error") {
        return { status: "error", message: state.message };
      }
    }

    const loadedMatches = this.toLoadedSeriesMatches(series, matchStatsByMatchId);
    if (loadedMatches == null) {
      return { status: "loading" };
    }

    return {
      status: "loaded",
      seriesId: series.id,
      viewModel: this.buildSeriesViewModelFromCache(series, loadedMatches),
    };
  }

  private toLoadedSeriesMatches(
    series: ViewerSeriesTab,
    matchStatsByMatchId: ReadonlyMap<string, MatchStatsState>,
  ): readonly LoadedSeriesMatch[] | null {
    const loaded: LoadedSeriesMatch[] = [];
    for (const match of series.matches) {
      const state = matchStatsByMatchId.get(match.matchId);
      if (state?.status !== "loaded") {
        return null;
      }
      loaded.push({ match, state });
    }

    return loaded;
  }

  private buildSeriesViewModelFromCache(
    series: ViewerSeriesTab,
    loadedMatches: readonly LoadedSeriesMatch[],
  ): SeriesStatsViewModel {
    const playerMap = new Map<string, string>();
    const medalMetadata: MedalMetadata = {};
    const analyticsByMatchId = new Map<string, MatchAnalytics>();
    let analyticsStatus = ComponentLoaderStatus.LOADED;

    for (const { match, state } of loadedMatches) {
      for (const [xuid, gamertag] of state.playerMap) {
        playerMap.set(xuid, gamertag);
      }
      Object.assign(medalMetadata, state.medalMetadata);
      if (state.analytics != null) {
        analyticsByMatchId.set(match.matchId, state.analytics);
      }
      if (state.analyticsStatus === ComponentLoaderStatus.LOADING) {
        analyticsStatus = ComponentLoaderStatus.LOADING;
      } else if (
        state.analyticsStatus === ComponentLoaderStatus.ERROR &&
        analyticsStatus === ComponentLoaderStatus.LOADED
      ) {
        analyticsStatus = ComponentLoaderStatus.ERROR;
      }
    }

    const matches: ResolvedSeriesMatch[] = loadedMatches.map(({ match, state }) => ({
      matchId: match.matchId,
      gameTypeAndMap: buildMatchHeaderTitle(match),
      gameVariantCategory: match.gameVariantCategory,
      gameType: match.gameModeName,
      gameMap: match.mapName,
      gameMapThumbnailUrl: match.mapBackgroundUrl,
      duration: match.duration,
      gameScore: match.score,
      gameSubScore: null,
      startTime: match.startTime,
      endTime: match.endTime,
      rawMatch: state.stats,
    }));

    return buildSeriesViewModel({
      series,
      matches,
      rawMatches: loadedMatches.map(({ state }) => state.stats),
      medalMetadata,
      playerMap,
      teamColors: [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)],
      analyticsByMatchId,
      killMatrixStatus: analyticsStatus,
      scoreProgressionStatus: analyticsStatus,
    });
  }

  public present(snapshot: OverlayPageSnapshot): OverlayPageViewModel {
    const matchStatsState =
      snapshot.selectedMatchId == null ? null : (snapshot.matchStatsByMatchId.get(snapshot.selectedMatchId) ?? null);

    return {
      selectedMatchId: snapshot.selectedMatchId,
      selectedSeriesId: snapshot.selectedSeriesId,
      matchStatsState,
      matchStatsPanelState: this.toMatchStatsPanelState(snapshot.selectedMatchId, matchStatsState),
    };
  }

  private async loadMatchStatsAsync(
    matchId: string,
    token: symbol,
    analyticsPromise: Promise<OverlayAnalyticsLoadResult> = this.loadMatchAnalyticsAsync([matchId]),
  ): Promise<void> {
    this.config.store.setMatchStatsState(matchId, { status: "loading" });

    try {
      const stats = await this.config.haloClient.getMatchStats(matchId);
      if (this.shouldAbort() || this.loads.get(matchId)?.token !== token) {
        return;
      }

      const xuids = stats.Players.filter((player) => player.PlayerType === 1).map((player) => getPlayerXuid(player));

      const [users, medalMetadata] = await Promise.all([
        this.config.haloClient.getUsers(xuids).catch(() => []),
        this.config.medalMetadataResolver.getMedalMetadataForMatch(stats),
      ]);

      if (this.shouldAbort() || this.loads.get(matchId)?.token !== token) {
        return;
      }

      const playerMap = new Map(users.map((user) => [user.xuid, user.gamertag]));
      for (const xuid of xuids) {
        if (!playerMap.has(xuid)) {
          playerMap.set(xuid, xuid);
        }
      }

      this.config.store.setMatchStatsState(matchId, {
        status: "loaded",
        stats,
        playerMap,
        medalMetadata,
        analytics: null,
        analyticsStatus: ComponentLoaderStatus.LOADING,
      });

      const analyticsResult = await analyticsPromise;
      if (this.shouldAbort() || this.loads.get(matchId)?.token !== token) {
        return;
      }

      this.config.store.setMatchStatsState(matchId, {
        status: "loaded",
        stats,
        playerMap,
        medalMetadata,
        analytics: analyticsResult.analyticsByMatchId[matchId] ?? null,
        analyticsStatus: analyticsResult.status,
      });
    } catch {
      if (this.shouldAbort() || this.loads.get(matchId)?.token !== token) {
        return;
      }

      this.config.store.setMatchStatsState(matchId, {
        status: "error",
        message: "Failed to load match stats",
      });
    }
  }

  private async loadStandaloneMatchStatsAsync(matchId: string, token: symbol): Promise<void> {
    this.config.store.setMatchStatsState(matchId, { status: "loading" });
    try {
      const response = await this.config.seriesMatchesService.getMatchDetails([matchId], this.config.trackerId);
      if (this.shouldAbort() || this.loads.get(matchId)?.token !== token) {
        return;
      }
      const result = response.results.find((item) => item.matchId === matchId);
      if (result?.status !== "resolved") {
        throw new Error("Failed to load match stats");
      }
      this.setStandaloneMatchState(matchId, result.detail, null, ComponentLoaderStatus.PENDING);
      const state = this.config.store.getSnapshot().matchStatsByMatchId.get(matchId);
      if (this.config.store.getSnapshot().selectedMatchId === matchId && state?.status === "condensed") {
        this.loadStandaloneAnalytics(matchId, state);
      }
    } catch {
      if (this.shouldAbort() || this.loads.get(matchId)?.token !== token) {
        return;
      }
      this.config.store.setMatchStatsState(matchId, { status: "error", message: "Failed to load match stats" });
    }
  }

  private loadStandaloneAnalytics(matchId: string, state: Extract<MatchStatsState, { status: "condensed" }>): void {
    const token = this.loads.get(matchId)?.token;
    if (token == null || state.panel.scoreProgressionStatus !== ComponentLoaderStatus.PENDING) {
      return;
    }
    this.setStandaloneMatchState(matchId, state.detail, null, ComponentLoaderStatus.LOADING);
    void this.loadStandaloneAnalyticsAsync(matchId, state.detail, token);
  }

  private async loadStandaloneAnalyticsAsync(matchId: string, detail: MatchDetail, token: symbol): Promise<void> {
    const analytics = await this.loadMatchAnalyticsAsync([matchId], this.config.trackerId);
    if (this.shouldAbort() || this.loads.get(matchId)?.token !== token) {
      return;
    }
    this.setStandaloneMatchState(matchId, detail, analytics.analyticsByMatchId[matchId] ?? null, analytics.status);
  }

  private setStandaloneMatchState(
    matchId: string,
    detail: MatchDetail,
    analytics: MatchAnalytics | null,
    status: ComponentLoaderStatus,
  ): void {
    const projection = projectStandaloneMatchStats(detail, this.statsDetailController);
    const data = projection.hasUnknownRarity
      ? projectStandaloneMatchStats(detail, this.statsDetailController, "panel").teams
      : projection.teams;
    const teamColors = [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)];
    this.config.store.setMatchStatsState(matchId, {
      status: "condensed",
      detail,
      tickerData: projection.teams,
      panel: {
        status: "loaded",
        matchId,
        gameVariantCategory: detail.mode.gameVariantCategory,
        gameMapThumbnailUrl: detail.map.thumbnailUrl ?? "",
        duration: getDurationInIsoString(Math.floor(detail.durationSeconds)),
        startTime: detail.startTime,
        endTime: detail.endTime,
        data,
        ...this.statsDetailController.mapMatchDetailToAnalytics(detail, {
          killMatrix: analytics?.killMatrix ?? null,
          scoreProgression: analytics?.scoreProgression ?? null,
          teamColors,
          teamSize: data[0]?.players.length ?? null,
        }),
        killMatrixStatus: status,
        scoreProgressionStatus: status,
      },
    });
  }

  private async loadMatchAnalyticsAsync(
    matchIds: readonly string[],
    trackerId?: string,
  ): Promise<OverlayAnalyticsLoadResult> {
    try {
      const analyticsByMatchId = await this.config.matchAnalyticsService.getBatchMatchAnalytics(
        matchIds,
        ["killMatrix", "scoreProgression"],
        trackerId,
      );

      return {
        status: ComponentLoaderStatus.LOADED,
        analyticsByMatchId,
      };
    } catch {
      return {
        status: ComponentLoaderStatus.ERROR,
        analyticsByMatchId: {},
      };
    }
  }

  private toMatchStatsPanelState(
    selectedMatchId: string | null,
    matchStatsState: MatchStatsState | null,
  ): MatchDetailsState | null {
    if (selectedMatchId == null || matchStatsState == null) {
      return null;
    }

    if (matchStatsState.status === "loading") {
      return { status: "loading" };
    }

    if (matchStatsState.status === "error") {
      return { status: "error", message: matchStatsState.message };
    }

    if (matchStatsState.status === "condensed") {
      return matchStatsState.panel;
    }

    const { stats, playerMap, medalMetadata, analytics, analyticsStatus } = matchStatsState;
    const controller = new StatsController();
    controller.loadMatch(stats, playerMap, medalMetadata);
    if (analytics != null) {
      controller.loadAnalytics(analytics, playerMap);
    }

    const killMatrixRows = analytics != null ? controller.getKillMatrix() : null;
    const players = controller.getPlayers();
    const playersByGamertag = new Map(players.map((player) => [player.gamertag, player]));
    const data = controller.getMatchStats();
    const resolvedPlayers = data
      .flatMap((teamData) => teamData.players.map((player) => playersByGamertag.get(player.name)))
      .filter((player): player is KillMatrixPlayer => player != null);
    const orderedPlayers = resolvedPlayers.length === players.length ? resolvedPlayers : players;
    const crossTeam =
      killMatrixRows != null ? KillMatrixFormatter.buildCrossTeam(killMatrixRows, orderedPlayers) : null;

    return {
      status: "loaded",
      matchId: stats.MatchId,
      gameVariantCategory: stats.MatchInfo.GameVariantCategory,
      gameMapThumbnailUrl: "",
      duration: stats.MatchInfo.Duration,
      startTime: stats.MatchInfo.StartTime,
      endTime: stats.MatchInfo.EndTime,
      data,
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
      killMatrixStatus: analyticsStatus,
      scoreProgressionStatus: analyticsStatus,
      scoreProgressionViewData: formatScoreProgression(
        analytics?.scoreProgression ?? null,
        [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)],
        data[0]?.players.length ?? null,
      ),
    };
  }
}
