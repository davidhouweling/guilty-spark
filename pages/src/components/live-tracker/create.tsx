import React, { useEffect, useMemo, useSyncExternalStore, useRef } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import type { LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
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
import { LiveTrackerPresenter } from "./live-tracker-presenter";
import { LiveTrackerStore, type LiveTrackerParams } from "./live-tracker-store";
import { LiveTrackerView } from "./live-tracker";
import type { LiveTrackerViewModel } from "./types";
import { LiveTrackerProvider } from "./live-tracker-context";

interface LiveTrackerAppProps {
  readonly apiHost: string;
}

interface LiveTrackerFactoryProps {
  readonly services: Services;
}

TimeAgo.addDefaultLocale(en);

// Helper function to compare params
function areParamsEqual(prev: LiveTrackerParams, curr: LiveTrackerParams): boolean {
  if (prev.type !== curr.type) {
    return false;
  }

  if (prev.type === "team" && curr.type === "team") {
    return prev.server === curr.server && prev.queue === curr.queue;
  }

  if (prev.type === "individual" && curr.type === "individual") {
    return prev.gamertag === curr.gamertag;
  }

  return false;
}

// Helper function to deeply compare state messages, ignoring timestamps
function isStateMessageEqual(prev: LiveTrackerMessage | null, curr: LiveTrackerMessage | null): boolean {
  if (prev === curr) {
    return true;
  }

  if (prev === null || curr === null) {
    return false;
  }

  // Compare meaningful data, excluding timestamps that change every broadcast
  const prevData = prev.data;
  const currData = curr.data;

  // Fast checks first
  if (
    prevData.status !== currData.status ||
    prevData.queueNumber !== currData.queueNumber ||
    prevData.guildId !== currData.guildId ||
    prevData.channelId !== currData.channelId ||
    prevData.seriesScore !== currData.seriesScore ||
    prevData.players.length !== currData.players.length ||
    prevData.teams.length !== currData.teams.length ||
    prevData.substitutions.length !== currData.substitutions.length ||
    prevData.discoveredMatches.length !== currData.discoveredMatches.length
  ) {
    return false;
  }

  // Compare players by ID (order matters)
  for (let i = 0; i < prevData.players.length; i++) {
    if (
      prevData.players[i].id !== currData.players[i].id ||
      prevData.players[i].discordUsername !== currData.players[i].discordUsername
    ) {
      return false;
    }
  }

  // Compare teams structure
  for (let i = 0; i < prevData.teams.length; i++) {
    const prevTeam = prevData.teams[i];
    const currTeam = currData.teams[i];
    if (
      prevTeam.name !== currTeam.name ||
      prevTeam.playerIds.length !== currTeam.playerIds.length ||
      !prevTeam.playerIds.every((id, idx) => id === currTeam.playerIds[idx])
    ) {
      return false;
    }
  }

  // Compare substitutions (excluding timestamps if they're the same event)
  for (let i = 0; i < prevData.substitutions.length; i++) {
    const prevSub = prevData.substitutions[i];
    const currSub = currData.substitutions[i];
    if (
      prevSub.playerOutId !== currSub.playerOutId ||
      prevSub.playerInId !== currSub.playerInId ||
      prevSub.teamIndex !== currSub.teamIndex ||
      prevSub.timestamp !== currSub.timestamp
    ) {
      return false;
    }
  }

  // Compare discovered matches by matchId and key properties
  for (let i = 0; i < prevData.discoveredMatches.length; i++) {
    const prevMatch = prevData.discoveredMatches[i];
    const currMatch = currData.discoveredMatches[i];
    if (
      prevMatch.matchId !== currMatch.matchId ||
      prevMatch.gameTypeAndMap !== currMatch.gameTypeAndMap ||
      prevMatch.gameScore !== currMatch.gameScore ||
      prevMatch.duration !== currMatch.duration ||
      prevMatch.startTime !== currMatch.startTime ||
      prevMatch.endTime !== currMatch.endTime
    ) {
      return false;
    }
  }

  // Compare rawMatches keys (actual content changes would be caught by discoveredMatches)
  const prevMatchIds = Object.keys(prevData.rawMatches).sort();
  const currMatchIds = Object.keys(currData.rawMatches).sort();
  if (prevMatchIds.length !== currMatchIds.length || !prevMatchIds.every((id, idx) => id === currMatchIds[idx])) {
    return false;
  }

  // Compare medalMetadata keys (structural check)
  const prevMedalIds = Object.keys(prevData.medalMetadata).sort();
  const currMedalIds = Object.keys(currData.medalMetadata).sort();
  if (prevMedalIds.length !== currMedalIds.length || !prevMedalIds.every((id, idx) => id === currMedalIds[idx])) {
    return false;
  }

  // Compare playersAssociationData if present
  if ((prevData.playersAssociationData == null) !== (currData.playersAssociationData == null)) {
    return false;
  }

  if (prevData.playersAssociationData != null && currData.playersAssociationData != null) {
    const prevPlayerIds = Object.keys(prevData.playersAssociationData).sort();
    const currPlayerIds = Object.keys(currData.playersAssociationData).sort();
    if (prevPlayerIds.length !== currPlayerIds.length || !prevPlayerIds.every((id, idx) => id === currPlayerIds[idx])) {
      return false;
    }

    // Check if any player data changed
    for (const playerId of prevPlayerIds) {
      const prevPlayer = prevData.playersAssociationData[playerId];
      const currPlayer = currData.playersAssociationData[playerId];

      // Compare all player fields except lastRankedGamePlayed timestamp
      if (
        prevPlayer.discordId !== currPlayer.discordId ||
        prevPlayer.discordName !== currPlayer.discordName ||
        prevPlayer.xboxId !== currPlayer.xboxId ||
        prevPlayer.gamertag !== currPlayer.gamertag ||
        prevPlayer.currentRank !== currPlayer.currentRank ||
        prevPlayer.currentRankTier !== currPlayer.currentRankTier ||
        prevPlayer.currentRankSubTier !== currPlayer.currentRankSubTier ||
        prevPlayer.allTimePeakRank !== currPlayer.allTimePeakRank ||
        prevPlayer.esra !== currPlayer.esra ||
        prevPlayer.lastRankedGamePlayed !== currPlayer.lastRankedGamePlayed
      ) {
        return false;
      }
    }
  }

  // All meaningful data is the same, only timestamps differ
  return true;
}

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

  const loaderStatus =
    snapshot.connectionState === "error"
      ? ComponentLoaderStatus.ERROR
      : snapshot.hasReceivedInitialData
        ? ComponentLoaderStatus.LOADED
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
      !areParamsEqual(prev.params, curr.params) ||
      prev.hasConnection !== curr.hasConnection ||
      prev.hasReceivedInitialData !== curr.hasReceivedInitialData ||
      // Deep check the state message data
      !isStateMessageEqual(prev.lastStateMessage, curr.lastStateMessage);

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

  // Compute match stats from model state
  const allMatchStats = useMemo((): { matchId: string; data: MatchStatsData[] | null }[] => {
    if (!model.state) {
      return [];
    }

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
          data: matchStatsPresenter.getData(matchStats, playerMap, model.state?.medalMetadata),
        };
      } catch (error) {
        console.error("Error processing match stats:", error);
        return { matchId: match.matchId, data: null };
      }
    });
  }, [model.state]);

  // Compute series stats from model state
  const seriesStats = useMemo((): {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null => {
    if (!model.state || model.state.matches.length === 0) {
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
          onRetry={() => {
            presenter.start();
          }}
        />
      }
      loaded={
        <LiveTrackerProvider model={model} allMatchStats={allMatchStats} seriesStats={seriesStats}>
          <LiveTrackerView />
        </LiveTrackerProvider>
      }
    />
  );
}

export function LiveTracker({ apiHost }: LiveTrackerAppProps): React.ReactElement {
  const [loadingServices, setLoadingServices] = React.useState<ComponentLoaderStatus>(ComponentLoaderStatus.PENDING);
  const [services, setServices] = React.useState<Services | null>(null);

  useEffect(() => {
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
  }, [apiHost]);

  const loaded = services ? <LiveTrackerFactory services={services} /> : <ErrorState />;

  return <ComponentLoader status={loadingServices} loading={<LoadingState />} error={<ErrorState />} loaded={loaded} />;
}
