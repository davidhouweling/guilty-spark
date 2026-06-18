import React, { useEffect, useMemo, useState, useSyncExternalStore, useRef } from "react";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import type { MatchStatsData } from "../../controllers/stats/types";
import { StatsController } from "../../controllers/stats/stats-controller";
import { calculateSeriesMetadata, type SeriesMetadata } from "../../controllers/stats/series-metadata";
import { KillMatrixFormatter } from "../../controllers/stats/kill-matrix/kill-matrix-formatter";
import {
  EMPTY_KILL_MATRIX_PIVOT_DATA,
  type KillMatrixPivotData,
  type KillMatrixPlayer,
  type KillMatrixViewRow,
} from "../../controllers/stats/kill-matrix/types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { LiveTrackerService } from "../../services/live-tracker/types";
import { LiveTrackerPresenter } from "./live-tracker-presenter";
import { LiveTrackerStore } from "./live-tracker-store";
import { LiveTrackerView } from "./live-tracker";
import type { LiveTrackerViewModel } from "./types";
import { LiveTrackerProvider } from "./live-tracker-context";

const GAMES_SUFFIX_RE = /\s+\(\d+\/\d+ games\)$/;

interface LiveTrackerProps {
  readonly liveTrackerService: LiveTrackerService;
  readonly matchAnalyticsService: MatchAnalyticsService;
}

export function LiveTracker({ liveTrackerService, matchAnalyticsService }: LiveTrackerProps): React.ReactElement {
  const store = useMemo(() => new LiveTrackerStore(), []);

  const presenter = useMemo(() => {
    return new LiveTrackerPresenter({
      liveTrackerService,
      getUrl: (): URL => new URL(window.location.href),
      store,
    });
  }, [liveTrackerService, store]);

  useEffect(() => {
    presenter.start();

    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const loaderStatus = snapshot.hasReceivedInitialData
    ? ComponentLoaderStatus.LOADED
    : snapshot.connectionState === "error" ||
        snapshot.connectionState === "stopped" ||
        snapshot.connectionState === "not_found"
      ? ComponentLoaderStatus.ERROR
      : ComponentLoaderStatus.LOADING;

  // Memoize model creation to prevent unnecessary re-renders when WebSocket
  // sends identical data (e.g., heartbeat messages every 3 minutes)
  const modelRef = useRef<LiveTrackerViewModel | null>(null);
  const snapshotRef = useRef<typeof snapshot | null>(null);

  const model = useMemo((): LiveTrackerViewModel => {
    // If this is the first render, create the model
    if (modelRef.current === null || snapshotRef.current === null) {
      const newModel = LiveTrackerPresenter.present(snapshot);
      modelRef.current = newModel;
      snapshotRef.current = snapshot;
      return newModel;
    }

    const prev = snapshotRef.current;
    const curr = snapshot;

    // Quick reference equality check
    if (prev === curr) {
      return modelRef.current;
    }

    // Check if any meaningful data has changed
    const hasChanged =
      prev.connectionState !== curr.connectionState ||
      prev.statusText !== curr.statusText ||
      !LiveTrackerPresenter.areParamsEqual(prev.params, curr.params) ||
      prev.hasConnection !== curr.hasConnection ||
      prev.hasReceivedInitialData !== curr.hasReceivedInitialData ||
      // Deep check the state message data
      !LiveTrackerPresenter.isStateMessageEqual(prev.lastStateMessage, curr.lastStateMessage);

    if (!hasChanged) {
      // Data is the same, return the previous model to prevent re-renders
      return modelRef.current;
    }

    // Data has changed, create a new model
    const newModel = LiveTrackerPresenter.present(snapshot);
    modelRef.current = newModel;
    snapshotRef.current = snapshot;
    return newModel;
  }, [snapshot]);

  // Compute match stats from model state (NeatQueue only)
  const allMatchStats = useMemo((): { matchId: string; data: MatchStatsData[] | null }[] => {
    if (model.state?.type !== "neatqueue") {
      return [];
    }

    const { medalMetadata } = model.state;

    return model.state.matches.map((match) => {
      if (match.rawMatchStats == null) {
        return { matchId: match.matchId, data: null };
      }

      try {
        const matchStats = match.rawMatchStats;
        const controller = new StatsController();
        const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
        controller.loadMatch(matchStats, playerMap, medalMetadata);
        return { matchId: match.matchId, data: controller.getMatchStats() };
      } catch (error) {
        console.error("Error processing match stats:", error);
        return { matchId: match.matchId, data: null };
      }
    });
  }, [model.state]); // Depend on entire state to catch type changes

  const [analyticsByMatchId, setAnalyticsByMatchId] = useState<ReadonlyMap<string, MatchAnalytics>>(new Map());
  const [analyticsStatus, setAnalyticsStatus] = useState(ComponentLoaderStatus.LOADING);

  const completeMatchIdsKey = useMemo((): string => {
    if (model.state?.type !== "neatqueue") {return "";}
    return model.state.matches
      .filter((m) => m.rawMatchStats != null)
      .map((m) => m.matchId)
      .join(",");
  }, [model.state]);

  useEffect(() => {
    if (!completeMatchIdsKey) {
      setAnalyticsByMatchId(new Map());
      setAnalyticsStatus(ComponentLoaderStatus.LOADED);
      return;
    }

    let cancelled = false;
    setAnalyticsStatus(ComponentLoaderStatus.LOADING);
    const matchIds = completeMatchIdsKey.split(",");

    matchAnalyticsService
      .getBatchMatchAnalytics(matchIds)
      .then((results) => {
        if (cancelled) {return;}
        const map = new Map<string, MatchAnalytics>();
        for (const [matchId, analytics] of Object.entries(results)) {
          if (analytics != null) {
            map.set(matchId, analytics);
          }
        }
        setAnalyticsByMatchId(map);
        setAnalyticsStatus(ComponentLoaderStatus.LOADED);
      })
      .catch(() => {
        if (cancelled) {return;}
        setAnalyticsStatus(ComponentLoaderStatus.ERROR);
      });

    return (): void => {
      cancelled = true;
    };
  }, [completeMatchIdsKey, matchAnalyticsService]);

  const { allMatchKillMatrix, seriesKillMatrix } = useMemo((): {
    allMatchKillMatrix: readonly {
      matchId: string;
      pivotData: KillMatrixPivotData;
      transposedPivotData: KillMatrixPivotData;
    }[];
    seriesKillMatrix: { pivotData: KillMatrixPivotData; transposedPivotData: KillMatrixPivotData } | null;
  } => {
    if (model.state?.type !== "neatqueue" || analyticsByMatchId.size === 0) {
      return { allMatchKillMatrix: [], seriesKillMatrix: null };
    }

    const { medalMetadata } = model.state;
    const formatter = new KillMatrixFormatter();

    const allPlayerXuidToGametag = new Map<string, string>();
    for (const match of model.state.matches) {
      for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
        allPlayerXuidToGametag.set(xuid, gamertag);
      }
    }

    let seriesPlayers: readonly KillMatrixPlayer[] | undefined;
    let playersByXuid: ReadonlyMap<string, { gamertag: string; teamId: number | null }> = new Map();

    const rawMatchStats = model.state.matches
      .map((m) => m.rawMatchStats)
      .filter((s): s is NonNullable<typeof s> => s != null);

    if (rawMatchStats.length > 0) {
      try {
        const seriesController = new StatsController();
        seriesController.loadSeries(rawMatchStats, allPlayerXuidToGametag, medalMetadata);
        const players = seriesController.getPlayers();
        const playersByGamertag = new Map(players.map((p) => [p.gamertag, p]));
        const seriesData = seriesController.getSeriesStats();
        const resolvedPlayers = seriesData.playerData
          .flatMap((teamData) =>
            teamData.players.map((p) => playersByGamertag.get(p.name.replace(GAMES_SUFFIX_RE, ""))),
          )
          .filter((p): p is KillMatrixPlayer => p != null);
        seriesPlayers = resolvedPlayers.length === players.length ? resolvedPlayers : players;
        playersByXuid = new Map(players.map((p) => [p.xuid, { gamertag: p.gamertag, teamId: p.teamId }]));
      } catch (error) {
        console.error("Error building kill matrix player data:", error);
      }
    }

    const matchKillMatrixRows = new Map<string, readonly KillMatrixViewRow[]>();
    const computedAllMatchKillMatrix = model.state.matches.map((match) => {
      const analytics = analyticsByMatchId.get(match.matchId);
      if (analytics == null) {
        return {
          matchId: match.matchId,
          pivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
          transposedPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
        };
      }
      const rows = formatter.present({ analytics, playersByXuid });
      matchKillMatrixRows.set(match.matchId, rows);
      return {
        matchId: match.matchId,
        pivotData: KillMatrixFormatter.pivot(rows, seriesPlayers),
        transposedPivotData: KillMatrixFormatter.transpose(rows, seriesPlayers),
      };
    });

    if (matchKillMatrixRows.size === 0) {
      return { allMatchKillMatrix: computedAllMatchKillMatrix, seriesKillMatrix: null };
    }

    const aggregatedRows = KillMatrixFormatter.aggregate([...matchKillMatrixRows.values()].flatMap((rows) => rows));

    return {
      allMatchKillMatrix: computedAllMatchKillMatrix,
      seriesKillMatrix: {
        pivotData: KillMatrixFormatter.pivot(aggregatedRows, seriesPlayers),
        transposedPivotData: KillMatrixFormatter.transpose(aggregatedRows, seriesPlayers),
      },
    };
  }, [model.state, analyticsByMatchId]);

  // Compute series stats from model state (NeatQueue only)
  const seriesStats = useMemo((): {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null => {
    if (model.state?.type !== "neatqueue" || model.state.matches.length === 0) {
      return null;
    }

    const rawMatchStats = model.state.matches
      .map((match) => match.rawMatchStats)
      .filter((stats): stats is NonNullable<typeof stats> => stats != null);

    if (rawMatchStats.length === 0) {
      return null;
    }

    try {
      const allPlayerXuidToGametag = new Map<string, string>();
      for (const match of model.state.matches) {
        for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
          allPlayerXuidToGametag.set(xuid, gamertag);
        }
      }

      const controller = new StatsController();
      controller.loadSeries(rawMatchStats, allPlayerXuidToGametag, model.state.medalMetadata);
      const { teamData, playerData } = controller.getSeriesStats();
      const metadata = calculateSeriesMetadata(model.state.matches, model.state.seriesScore);

      return { teamData, playerData, metadata };
    } catch (error) {
      console.error("Error processing series stats:", error);
      return null;
    }
  }, [model.state]); // Depend on entire state to catch type changes

  return (
    <ComponentLoader
      status={loaderStatus}
      loading={<LoadingState text={snapshot.statusText} />}
      error={
        <ErrorState
          message={snapshot.statusText}
          onRetry={
            snapshot.connectionState === "error" || snapshot.connectionState === "disconnected"
              ? (): void => {
                  presenter.start();
                }
              : undefined
          }
        />
      }
      loaded={
        <LiveTrackerProvider
          model={model}
          params={snapshot.params}
          allMatchStats={allMatchStats}
          seriesStats={seriesStats}
          analyticsStatus={analyticsStatus}
          allMatchKillMatrix={allMatchKillMatrix}
          seriesKillMatrix={seriesKillMatrix}
        >
          <LiveTrackerView />
        </LiveTrackerProvider>
      }
    />
  );
}
