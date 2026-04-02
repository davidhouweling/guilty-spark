import React, { useEffect, useMemo, useSyncExternalStore, useRef } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import { installServices } from "../../services/install";
import type { Services } from "../../services/types";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { createMatchStatsPresenter } from "../stats/create";
import type { MatchStatsData } from "../stats/types";
import { SeriesTeamStatsPresenter } from "../stats/series-team-stats-presenter";
import { SeriesPlayerStatsPresenter } from "../stats/series-player-stats-presenter";
import { calculateSeriesMetadata, type SeriesMetadata } from "../stats/series-metadata";
import { TrackerInitiationFactory } from "../tracker-initiation/create";
import { LiveTrackerPresenter } from "./live-tracker-presenter";
import { LiveTrackerStore } from "./live-tracker-store";
import { LiveTrackerView } from "./live-tracker";
import type { LiveTrackerViewModel } from "./types";
import { LiveTrackerProvider } from "./live-tracker-context";

interface LiveTrackerAppProps {
  readonly apiHost: string;
}

interface LiveTrackerFactoryProps {
  readonly services: Services;
  readonly apiHost: string;
}

TimeAgo.addDefaultLocale(en);

export function LiveTrackerFactory({ services, apiHost }: LiveTrackerFactoryProps): React.ReactElement {
  const store = useMemo(() => new LiveTrackerStore(), []);

  const presenter = useMemo(() => {
    return new LiveTrackerPresenter({
      services,
      getUrl: (): URL => new URL(window.location.href),
      store,
    });
  }, [services, store]);

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
    : snapshot.connectionState === "error" || snapshot.connectionState === "stopped"
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
        const matchStatsPresenter = createMatchStatsPresenter(matchStats.MatchInfo.GameVariantCategory);
        const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
        return {
          matchId: match.matchId,
          data: matchStatsPresenter.getData(matchStats, playerMap, medalMetadata),
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
      const teamPresenter = new SeriesTeamStatsPresenter();
      const playerPresenter = new SeriesPlayerStatsPresenter();

      const allPlayerXuidToGametag = new Map<string, string>();
      for (const match of model.state.matches) {
        for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
          allPlayerXuidToGametag.set(xuid, gamertag);
        }
      }

      const metadata = calculateSeriesMetadata(model.state.matches, model.state.seriesScore);

      return {
        teamData: teamPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, model.state.medalMetadata),
        playerData: playerPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, model.state.medalMetadata),
        metadata,
      };
    } catch (error) {
      console.error("Error processing series stats:", error);
      return null;
    }
  }, [model.state]); // Depend on entire state to catch type changes

  // Show TrackerInitiation for idle or not_found states
  if (snapshot.connectionState === "idle" || snapshot.connectionState === "not_found") {
    const initialGamertag = snapshot.params.type === "individual" ? snapshot.params.gamertag : "";
    return <TrackerInitiationFactory apiHost={apiHost} initialGamertag={initialGamertag} />;
  }

  return (
    <ComponentLoader
      status={loaderStatus}
      loading={<LoadingState />}
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

export function LiveTracker({ apiHost }: LiveTrackerAppProps): React.ReactElement {
  const [loadingServices, setLoadingServices] = React.useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = React.useState<Services | null>(null);
  const [shouldConnectToTracker, setShouldConnectToTracker] = React.useState(false);

  // Check URL params to determine if we need to connect to a tracker
  // Use useEffect to avoid hydration mismatch (server has no window)
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    const gamertag = url.searchParams.get("gamertag");
    const server = url.searchParams.get("server");
    const queue = url.searchParams.get("queue");

    // Individual mode: needs gamertag
    if (gamertag !== null && gamertag.length > 0) {
      setShouldConnectToTracker(true);
      return;
    }

    // Team mode: needs both server and queue
    if (server !== null && server.length > 0 && queue !== null && queue.length > 0) {
      setShouldConnectToTracker(true);
    }
  }, []);

  // Load services when we have tracker params
  useEffect(() => {
    if (!shouldConnectToTracker) {
      return;
    }

    let isCancelled = false;

    setServices(null);
    setLoadingServices(ComponentLoaderStatus.PENDING);

    installServices(apiHost)
      .then((installedServices) => {
        if (isCancelled) {
          return;
        }

        setServices(installedServices);
        setLoadingServices(ComponentLoaderStatus.LOADED);
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
        setLoadingServices(ComponentLoaderStatus.ERROR);
      });

    return (): void => {
      isCancelled = true;
    };
  }, [apiHost, shouldConnectToTracker]);

  if (!services) {
    return <LoadingState />;
  }

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<LoadingState />}
      error={<ErrorState />}
      loaded={
        !shouldConnectToTracker ? (
          <TrackerInitiationFactory apiHost={apiHost} initialGamertag="" />
        ) : (
          <LiveTrackerFactory services={services} apiHost={apiHost} />
        )
      }
    />
  );
}
