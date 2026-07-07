import type { HaloInfiniteClient } from "halo-infinite-api";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { StatsController } from "../../../controllers/stats/stats-controller";
import { KillMatrixFormatter } from "../../../controllers/stats/kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA, type KillMatrixPlayer } from "../../../controllers/stats/kill-matrix/types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { MatchDetailsState, ViewerTimelineItem } from "../viewer/types";
import type { MatchStatsState } from "./individual-tracker-overlay-presenter";
import type { OverlayPageSnapshot, OverlayPageStore } from "./overlay-page-store";

interface OverlayPagePresenterConfig {
  readonly store: OverlayPageStore;
  readonly haloClient: HaloInfiniteClient;
  readonly matchAnalyticsService: MatchAnalyticsService;
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

  public selectSeriesAndToggleIfAvailable(
    timeline: readonly ViewerTimelineItem[] | null,
    seriesId: string,
    onToggleEntry: (item: ViewerTimelineItem) => void,
  ): void {
    this.config.store.setSelectedSeriesId(seriesId);
    if (timeline == null) {
      return;
    }

    const timelineItem = this.findSeriesInTimeline(timeline, seriesId);
    if (timelineItem != null) {
      onToggleEntry(timelineItem);
    }
  }

  public deselect(): void {
    this.config.store.setSelectedMatchId(null);
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

      const [users, analyticsByMatchId] = await Promise.all([
        this.config.haloClient.getUsers(xuids).catch(() => []),
        this.config.matchAnalyticsService
          .getBatchMatchAnalytics([matchId])
          .catch((): Record<string, MatchAnalytics | null> => ({})),
      ]);
      const medalMetadata: MedalMetadata = {};

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
        analytics: analyticsByMatchId[matchId] ?? null,
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

    const { stats, playerMap, medalMetadata, analytics } = matchStatsState;
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
    };
  }

  private findSeriesInTimeline(timeline: readonly ViewerTimelineItem[], seriesId: string): ViewerTimelineItem | null {
    for (const item of timeline) {
      if (item.type === "series" && item.series.id === seriesId) {
        return item;
      }
    }

    return null;
  }
}
