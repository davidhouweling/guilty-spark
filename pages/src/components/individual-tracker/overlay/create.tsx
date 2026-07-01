import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { StatsController } from "../../../controllers/stats/stats-controller";
import { KillMatrixFormatter } from "../../../controllers/stats/kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA, type KillMatrixPlayer } from "../../../controllers/stats/kill-matrix/types";
import { useIndividualTrackerViewer } from "../viewer/use-individual-tracker-viewer";
import type { MatchDetailsState } from "../viewer/types";
import type { MatchStatsState } from "./individual-tracker-overlay-presenter";
import { IndividualTrackerOverlay } from "./individual-tracker-overlay";

interface IndividualTrackerOverlayPageProps {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly trackerId: string;
}

export function IndividualTrackerOverlayPage({
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  trackerId,
}: IndividualTrackerOverlayPageProps): React.ReactElement {
  const [selectedMatchId, setSelectedMatchId] = React.useState<string | null>(null);
  const [matchStatsByMatchId, setMatchStatsByMatchId] = React.useState<ReadonlyMap<string, MatchStatsState>>(new Map());

  const { snapshot, model, onRetry } = useIndividualTrackerViewer({
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
    haloClient,
    trackerId,
  });

  React.useEffect(() => {
    setSelectedMatchId(null);
    setMatchStatsByMatchId(new Map());
  }, [trackerId]);

  const setMatchStatsState = React.useCallback((matchId: string, state: MatchStatsState): void => {
    setMatchStatsByMatchId((previous) => {
      const next = new Map(previous);
      next.set(matchId, state);
      return next;
    });
  }, []);

  const loadMatchStats = React.useCallback(
    async (matchId: string): Promise<void> => {
      setMatchStatsState(matchId, { status: "loading" });
      try {
        const stats = await haloClient.getMatchStats(matchId);
        const xuids = stats.Players.filter((player) => player.PlayerType === 1).map((player) => getPlayerXuid(player));

        const [users, analyticsByMatchId] = await Promise.all([
          haloClient.getUsers(xuids),
          matchAnalyticsService.getBatchMatchAnalytics([matchId]),
        ]);
        const medalMetadata: MedalMetadata = {};

        const playerMap = new Map(users.map((user) => [user.xuid, user.gamertag]));
        for (const xuid of xuids) {
          if (!playerMap.has(xuid)) {
            playerMap.set(xuid, xuid);
          }
        }

        setMatchStatsState(matchId, {
          status: "loaded",
          stats,
          playerMap,
          medalMetadata,
          analytics: analyticsByMatchId[matchId] ?? null,
        });
      } catch {
        setMatchStatsState(matchId, {
          status: "error",
          message: "Failed to load match stats",
        });
      }
    },
    [haloClient, matchAnalyticsService, setMatchStatsState],
  );

  const onSelectMatch = React.useCallback(
    (matchId: string): void => {
      setSelectedMatchId(matchId);

      const existingState = matchStatsByMatchId.get(matchId);
      if (existingState?.status === "loaded" || existingState?.status === "loading") {
        return;
      }

      void loadMatchStats(matchId);
    },
    [loadMatchStats, matchStatsByMatchId],
  );

  const onDeselect = React.useCallback((): void => {
    setSelectedMatchId(null);
  }, []);

  const matchStatsState = selectedMatchId == null ? null : (matchStatsByMatchId.get(selectedMatchId) ?? null);

  const matchStatsPanelState = React.useMemo<MatchDetailsState | null>(() => {
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
  }, [matchStatsState, selectedMatchId]);

  return (
    <ComponentLoader
      status={snapshot.status}
      loading={<LoadingState text="Loading tracker..." />}
      error={<ErrorState message={snapshot.errorMessage ?? "Failed to load tracker"} onRetry={onRetry} />}
      loaded={
        model.renderModel != null ? (
          <IndividualTrackerOverlay
            renderModel={model.renderModel}
            matchStatsState={matchStatsState}
            matchStatsPanelState={matchStatsPanelState}
            selectedMatchId={selectedMatchId}
            onSelectMatch={onSelectMatch}
            onDeselect={onDeselect}
          />
        ) : (
          <LoadingState />
        )
      }
    />
  );
}
