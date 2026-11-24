import type { HaloInfiniteClient } from "halo-infinite-api";
import { getDurationInIsoString } from "@guilty-spark/shared/halo/duration";
import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { SeriesAnalyticsController } from "../../../controllers/series-analytics/series-analytics-controller";
import { SeriesDetailController } from "../../../controllers/series-detail/series-detail-controller";
import type { SeriesDetailState } from "../../../controllers/series-detail/types";
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
  ViewerSeriesDetailsState,
  ViewerTimelineItem,
} from "../viewer/types";
import { formatScoreProgression } from "../../stats/score-progression/score-progression-formatter";
import { SeriesDetailStatsViewModelPresenter } from "../../series-stats/series-detail-stats-view-model-presenter";
import type { SeriesMatchAnalyticsState } from "../../series-stats/types";
import { projectStandaloneMatchStats } from "./standalone-match-stats";
import type { MatchStatsState } from "./individual-tracker-overlay-presenter";
import type { OverlayPageSnapshot, OverlayPageStore } from "./overlay-page-store";

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
  private readonly seriesStatsPresenter = new SeriesDetailStatsViewModelPresenter(this.statsDetailController);
  private readonly loads = new Map<string, { token: symbol; source: "raw" | "detail" }>();
  private readonly seriesIds = new Set<string>();
  private readonly seriesIdByMatchId = new Map<string, string>();
  private readonly seriesDetailController: SeriesDetailController;
  private isDisposed = false;

  private shouldAbort(): boolean {
    return this.isDisposed;
  }

  public constructor(config: OverlayPagePresenterConfig) {
    this.config = config;
    this.seriesDetailController = new SeriesDetailController({
      seriesMatchesService: config.seriesMatchesService,
      trackerId: config.trackerId,
      createSeriesAnalyticsController: (onChange): SeriesAnalyticsController =>
        new SeriesAnalyticsController({
          matchAnalyticsService: config.matchAnalyticsService,
          trackerId: config.trackerId,
          onChange,
        }),
      onChange: (seriesId, state): void => {
        this.onSeriesDetailsChange(seriesId, state);
      },
    });
  }

  public dispose(): void {
    this.isDisposed = true;
    this.seriesDetailController.dispose();
  }

  public reset(): void {
    this.loads.clear();
    this.seriesIds.clear();
    this.seriesIdByMatchId.clear();
    this.seriesDetailController.reset();
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
    const series = timeline.filter(
      (item): item is Extract<ViewerTimelineItem, { readonly type: "series" }> =>
        item.type === "series" && item.series.matches.length > 0,
    );
    const activeSeriesIds = new Set(series.map((item) => item.series.id));
    for (const seriesId of this.seriesIds) {
      if (!activeSeriesIds.has(seriesId)) {
        this.seriesDetailController.invalidate(seriesId);
        this.config.store.removeSeriesDetailsState(seriesId);
        this.seriesIds.delete(seriesId);
      }
    }
    this.seriesIdByMatchId.clear();
    for (const item of series) {
      this.seriesIds.add(item.series.id);
      for (const match of item.series.matches) {
        this.seriesIdByMatchId.set(match.matchId, item.series.id);
      }
      this.seriesDetailController.load({
        seriesId: item.series.id,
        matchIds: item.series.matches.map((match) => match.matchId),
        teamMappingMode: "substitution-aware",
      });
    }
    const standaloneIds = timeline.flatMap((item) =>
      item.type === "match" && !this.seriesIdByMatchId.has(item.match.matchId) ? [item.match.matchId] : [],
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
    const series = timeline.find(
      (item) => item.type === "series" && item.series.matches.some((match) => match.matchId === matchId),
    );
    const seriesId = this.seriesIdByMatchId.get(matchId) ?? (series?.type === "series" ? series.series.id : undefined);
    const standalone =
      timeline.some((item) => item.type === "match" && item.match.matchId === matchId) && seriesId == null;
    this.config.store.setSelectedMatchId(matchId);

    const existingState = this.config.store.getSnapshot().matchStatsByMatchId.get(matchId);
    if (seriesId != null) {
      this.seriesDetailController.loadAnalytics(seriesId, "scoreProgression", matchId);
      return;
    }
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

  public loadSeriesAnalytics(seriesId: string, module: "killMatrix" | "scoreProgression", matchId?: string): void {
    this.seriesDetailController.loadAnalytics(seriesId, module, matchId);
  }

  public deselect(): void {
    this.config.store.setSelectedMatchId(null);
  }

  public buildSeriesStatsPanelState(
    series: ViewerSeriesTab | null,
    seriesDetailsById: ReadonlyMap<string, ViewerSeriesDetailsState>,
  ): SeriesDetailsState | null {
    if (series == null || series.matches.length === 0) {
      return null;
    }

    const state = seriesDetailsById.get(series.id);
    if (state == null || state.status === "loading") {
      return { status: "loading" };
    }
    if (state.status === "error") {
      return { status: "error", message: state.message };
    }

    return {
      status: "loaded",
      seriesId: series.id,
      viewModel: this.seriesStatsPresenter.present(
        {
          ...state.data,
          context: { ...state.data.context, title: series.title, subtitle: series.subtitle },
        },
        state.analyticsByMatchId,
      ),
    };
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

  private onSeriesDetailsChange(seriesId: string, state: SeriesDetailState): void {
    if (state.status === "loading") {
      this.config.store.setSeriesDetailsState(seriesId, state);
      return;
    }
    if (state.status === "error") {
      this.config.store.setSeriesDetailsState(seriesId, state);
      for (const [matchId, ownerSeriesId] of this.seriesIdByMatchId) {
        if (ownerSeriesId === seriesId) {
          this.config.store.setMatchStatsState(matchId, { status: "error", message: "Failed to load match stats" });
        }
      }
      return;
    }

    this.config.store.setSeriesDetailsState(seriesId, {
      status: "loaded",
      seriesId: state.data.seriesId,
      data: state.data,
      analyticsByMatchId: state.analyticsByMatchId,
    });
    for (const result of state.data.matches.results) {
      if (this.seriesIdByMatchId.get(result.matchId) !== seriesId) {
        continue;
      }
      if (result.status === "resolved") {
        this.setSeriesMatchState(result.matchId, result.detail, state.analyticsByMatchId.get(result.matchId));
      } else {
        this.config.store.setMatchStatsState(result.matchId, {
          status: "error",
          message: "Failed to load match stats",
        });
      }
    }

    const snapshot = this.config.store.getSnapshot();
    if (snapshot.selectedMatchId != null && this.seriesIdByMatchId.get(snapshot.selectedMatchId) === seriesId) {
      this.seriesDetailController.loadAnalytics(seriesId, "scoreProgression", snapshot.selectedMatchId);
    }
  }

  private setSeriesMatchState(
    matchId: string,
    detail: MatchDetail,
    analytics: SeriesMatchAnalyticsState | undefined,
  ): void {
    this.loads.set(matchId, { token: Symbol(), source: "detail" });
    this.setCondensedMatchState(
      matchId,
      detail,
      analytics?.killMatrix?.data ?? null,
      analytics?.scoreProgression?.data ?? null,
      analytics?.killMatrix?.status ?? ComponentLoaderStatus.PENDING,
      analytics?.scoreProgression?.status ?? ComponentLoaderStatus.PENDING,
    );
  }

  private setStandaloneMatchState(
    matchId: string,
    detail: MatchDetail,
    analytics: MatchAnalytics | null,
    status: ComponentLoaderStatus,
  ): void {
    this.setCondensedMatchState(
      matchId,
      detail,
      analytics?.killMatrix ?? null,
      analytics?.scoreProgression ?? null,
      status,
      status,
    );
  }

  private setCondensedMatchState(
    matchId: string,
    detail: MatchDetail,
    killMatrix: MatchAnalytics["killMatrix"] | null,
    scoreProgression: MatchAnalytics["scoreProgression"] | null,
    killMatrixStatus: ComponentLoaderStatus,
    scoreProgressionStatus: ComponentLoaderStatus,
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
          killMatrix,
          scoreProgression,
          teamColors,
          teamSize: data[0]?.players.length ?? null,
        }),
        killMatrixStatus,
        scoreProgressionStatus,
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
