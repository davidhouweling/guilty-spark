import type { HaloInfiniteClient } from "halo-infinite-api";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { StatsController } from "../../../controllers/stats/stats-controller";
import { KillMatrixFormatter } from "../../../controllers/stats/kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA, type KillMatrixPlayer } from "../../../controllers/stats/kill-matrix/types";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { MatchDetailsState, SeriesDetailsState, ViewerMatchTab, ViewerSeriesTab } from "../viewer/types";
import { formatScoreProgression } from "../../stats/score-progression/score-progression-formatter";
import { buildSeriesViewModel, type ResolvedSeriesMatch } from "../../series-stats/build-series-view-model";
import type { SeriesStatsViewModel } from "../../series-stats/types";
import { buildMatchHeaderTitle } from "../stats-panel-header";
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
    this.config.store.reset();
  }

  public preloadMatchStats(matchIds: readonly string[]): void {
    for (const matchId of matchIds) {
      const existingState = this.config.store.getSnapshot().matchStatsByMatchId.get(matchId);
      if (existingState?.status === "loaded" || existingState?.status === "loading") {
        continue;
      }

      void this.loadMatchStatsAsync(matchId);
    }
  }

  public selectMatch(matchId: string): void {
    this.config.store.setSelectedMatchId(matchId);

    const existingState = this.config.store.getSnapshot().matchStatsByMatchId.get(matchId);
    if (existingState?.status === "loaded" || existingState?.status === "loading") {
      return;
    }

    void this.loadMatchStatsAsync(matchId);
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
      analyticsStatus,
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

  private async loadMatchStatsAsync(matchId: string): Promise<void> {
    this.config.store.setMatchStatsState(matchId, { status: "loading" });

    try {
      const stats = await this.config.haloClient.getMatchStats(matchId);
      if (this.shouldAbort()) {
        return;
      }

      const xuids = stats.Players.filter((player) => player.PlayerType === 1).map((player) => getPlayerXuid(player));

      const analyticsPromise = this.loadMatchAnalyticsAsync(matchId);

      const [users, medalMetadata] = await Promise.all([
        this.config.haloClient.getUsers(xuids).catch(() => []),
        this.config.medalMetadataResolver.getMedalMetadataForMatch(stats),
      ]);

      if (this.shouldAbort()) {
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
      if (this.shouldAbort()) {
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
      if (this.shouldAbort()) {
        return;
      }

      this.config.store.setMatchStatsState(matchId, {
        status: "error",
        message: "Failed to load match stats",
      });
    }
  }

  private async loadMatchAnalyticsAsync(matchId: string): Promise<OverlayAnalyticsLoadResult> {
    try {
      const analyticsByMatchId = await this.config.matchAnalyticsService.getBatchMatchAnalytics(
        [matchId],
        ["killMatrix", "scoreProgression"],
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
      scoreProgressionViewData: formatScoreProgression(
        analytics?.scoreProgression ?? null,
        [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)],
        data[0]?.players.length ?? null,
      ),
    };
  }
}
