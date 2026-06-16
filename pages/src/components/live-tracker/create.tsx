import React, { useEffect, useMemo, useSyncExternalStore, useRef } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { createMatchStatsFormatter } from "../../controllers/stats/create";
import type { MatchStatsData } from "../../controllers/stats/types";
import { SeriesTeamStatsFormatter } from "../../controllers/stats/series-team-stats-formatter";
import { SeriesPlayerStatsFormatter } from "../../controllers/stats/series-player-stats-formatter";
import { calculateSeriesMetadata, type SeriesMetadata } from "../../controllers/stats/series-metadata";
import type { LiveTrackerService } from "../../services/live-tracker/types";
import { LiveTrackerPresenter } from "./live-tracker-presenter";
import { LiveTrackerStore } from "./live-tracker-store";
import { LiveTrackerView } from "./live-tracker";
import type { LiveTrackerViewModel } from "./types";
import { LiveTrackerProvider } from "./live-tracker-context";

interface LiveTrackerProps {
  readonly liveTrackerService: LiveTrackerService;
}

export function LiveTracker({ liveTrackerService }: LiveTrackerProps): React.ReactElement {
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
        const matchStatsFormatter = createMatchStatsFormatter(matchStats.MatchInfo.GameVariantCategory);
        const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
        return {
          matchId: match.matchId,
          data: matchStatsFormatter.getData(matchStats, playerMap, medalMetadata),
        };
      } catch (error) {
        console.error("Error processing match stats:", error);
        return { matchId: match.matchId, data: null };
      }
    });
  }, [model.state]); // Depend on entire state to catch type changes

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
      const teamFormatter = new SeriesTeamStatsFormatter();
      const playerFormatter = new SeriesPlayerStatsFormatter();

      const allPlayerXuidToGametag = new Map<string, string>();
      for (const match of model.state.matches) {
        for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
          allPlayerXuidToGametag.set(xuid, gamertag);
        }
      }

      const metadata = calculateSeriesMetadata(model.state.matches, model.state.seriesScore);

      return {
        teamData: teamFormatter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, model.state.medalMetadata),
        playerData: playerFormatter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, model.state.medalMetadata),
        metadata,
      };
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
        >
          <LiveTrackerView />
        </LiveTrackerProvider>
      }
    />
  );
}
