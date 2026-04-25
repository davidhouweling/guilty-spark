import React, { useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import type { Services } from "../services/types";
import { ErrorState } from "../components/error-state/error-state";
import { LoadingState } from "../components/loading-state/loading-state";
import { createMatchStatsPresenter } from "../components/stats/create";
import type { MatchStatsData } from "../components/stats/types";
import { SeriesTeamStatsPresenter } from "../components/stats/series-team-stats-presenter";
import { SeriesPlayerStatsPresenter } from "../components/stats/series-player-stats-presenter";
import { calculateSeriesMetadata, type SeriesMetadata } from "../components/stats/series-metadata";
import { ComponentLoader, ComponentLoaderStatus } from "../components/component-loader/component-loader";
import { LiveTrackerPresenter } from "../components/live-tracker/live-tracker-presenter";
import { LiveTrackerStore } from "../components/live-tracker/live-tracker-store";
import { LiveTrackerView } from "../components/live-tracker/live-tracker";
import type { LiveTrackerViewModel } from "../components/live-tracker/types";
import { LiveTrackerProvider } from "../components/live-tracker/live-tracker-context";
import { BaseApp } from "./base-app";

interface LiveTrackerAppProps {
  readonly apiHost: string;
}

interface LiveTrackerFactoryProps {
  readonly services: Services;
}

TimeAgo.addDefaultLocale(en);

export function LiveTrackerFactory({ services }: LiveTrackerFactoryProps): React.ReactElement {
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

  const modelRef = useRef<LiveTrackerViewModel | null>(null);
  const snapshotRef = useRef<typeof snapshot | null>(null);

  const model = useMemo((): LiveTrackerViewModel => {
    if (modelRef.current === null || snapshotRef.current === null) {
      const newModel = LiveTrackerPresenter.present(snapshot);
      modelRef.current = newModel;
      snapshotRef.current = snapshot;
      return newModel;
    }

    const prev = snapshotRef.current;
    const curr = snapshot;

    if (prev === curr) {
      return modelRef.current;
    }

    const hasChanged =
      prev.connectionState !== curr.connectionState ||
      prev.statusText !== curr.statusText ||
      !LiveTrackerPresenter.areParamsEqual(prev.params, curr.params) ||
      prev.hasConnection !== curr.hasConnection ||
      prev.hasReceivedInitialData !== curr.hasReceivedInitialData ||
      !LiveTrackerPresenter.isStateMessageEqual(prev.lastStateMessage, curr.lastStateMessage);

    if (!hasChanged) {
      return modelRef.current;
    }

    const newModel = LiveTrackerPresenter.present(snapshot);
    modelRef.current = newModel;
    snapshotRef.current = snapshot;
    return newModel;
  }, [snapshot]);

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
  }, [model.state]);

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
  }, [model.state]);

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

export function LiveTrackerApp({ apiHost }: LiveTrackerAppProps): React.ReactElement {
  const [shouldConnectToTracker, setShouldConnectToTracker] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const server = url.searchParams.get("server");
    const queue = url.searchParams.get("queue");

    if (server !== null && server.length > 0 && queue !== null && queue.length > 0) {
      setShouldConnectToTracker(true);
    }
  }, []);

  if (!shouldConnectToTracker) {
    return <ErrorState message={LiveTrackerPresenter.usageText} />;
  }

  return (
    <BaseApp
      apiHost={apiHost}
      loading={<LoadingState />}
      error={<ErrorState />}
      loaded={(services) => <LiveTrackerFactory services={services} />}
    />
  );
}
