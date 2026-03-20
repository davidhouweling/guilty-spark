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
import { TrackerInitiationFactory } from "../tracker-initiation/create";
import { UnreachableError } from "../../base/unreachable-error";
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
  readonly apiHost: string;
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

  // First check if types match
  if (prevData.type !== currData.type) {
    return false;
  }

  // Common fields
  if (prevData.status !== currData.status) {
    return false;
  }

  // Compare rawMatches keys (actual content changes would be caught by match arrays)
  const prevMatchIds = Object.keys(prevData.rawMatches).sort();
  const currMatchIds = Object.keys(currData.rawMatches).sort();
  if (prevMatchIds.length !== currMatchIds.length || !prevMatchIds.every((id, idx) => id === currMatchIds[idx])) {
    return false;
  }

  // Compare medalMetadata keys (structural check)
  const prevMedalIds = Object.keys(prevData.medalMetadata).sort();
  const currMedalIds = Object.keys(prevData.medalMetadata).sort();
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

  // Type-specific comparisons
  if (prevData.type === "neatqueue" && currData.type === "neatqueue") {
    if (
      prevData.queueNumber !== currData.queueNumber ||
      prevData.guildId !== currData.guildId ||
      prevData.channelId !== currData.channelId ||
      prevData.guildName !== currData.guildName ||
      prevData.seriesScore !== currData.seriesScore ||
      prevData.players.length !== currData.players.length ||
      prevData.teams.length !== currData.teams.length ||
      prevData.substitutions.length !== currData.substitutions.length ||
      prevData.matchSummaries.length !== currData.matchSummaries.length
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
        !prevTeam.playerIds.every((id: string, idx: number) => id === currTeam.playerIds[idx])
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

    // Compare match summaries by matchId and key properties
    for (let i = 0; i < prevData.matchSummaries.length; i++) {
      const prevMatch = prevData.matchSummaries[i];
      const currMatch = currData.matchSummaries[i];
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

    return true;
  }

  if (prevData.type === "individual" && currData.type === "individual") {
    if (
      prevData.gamertag !== currData.gamertag ||
      prevData.xuid !== currData.xuid ||
      prevData.groups.length !== currData.groups.length
    ) {
      return false;
    }

    // Compare groups structure
    for (let i = 0; i < prevData.groups.length; i++) {
      const prevGroup = prevData.groups[i];
      const currGroup = currData.groups[i];

      if (prevGroup.type !== currGroup.type || prevGroup.groupId !== currGroup.groupId) {
        return false;
      }

      // Type-specific group comparisons (types are equal at this point)
      switch (prevGroup.type) {
        case "neatqueue-series": {
          // Type assertion: we know currGroup.type === "neatqueue-series" from the equality check above
          const currentTyped = currGroup as typeof prevGroup;
          if (
            prevGroup.seriesScore !== currentTyped.seriesScore ||
            prevGroup.matchSummaries.length !== currentTyped.matchSummaries.length ||
            prevGroup.players.length !== currentTyped.players.length ||
            prevGroup.teams.length !== currentTyped.teams.length
          ) {
            return false;
          }
          break;
        }
        case "grouped-matches": {
          const currentTyped = currGroup as typeof prevGroup;
          if (
            prevGroup.label !== currentTyped.label ||
            prevGroup.seriesScore !== currentTyped.seriesScore ||
            prevGroup.matchSummaries.length !== currentTyped.matchSummaries.length
          ) {
            return false;
          }
          break;
        }
        case "single-match": {
          const currentTyped = currGroup as typeof prevGroup;
          if (prevGroup.matchSummary.matchId !== currentTyped.matchSummary.matchId) {
            return false;
          }
          break;
        }
        default:
          throw new UnreachableError(prevGroup);
      }
    }

    return true;
  }

  // All meaningful data is the same, only timestamps differ
  return true;
}

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
  const [loadingServices, setLoadingServices] = React.useState<ComponentLoaderStatus>(ComponentLoaderStatus.PENDING);
  const [services, setServices] = React.useState<Services | null>(null);

  // Check URL params to determine if we need to connect to a tracker
  const shouldConnectToTracker = React.useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const url = new URL(window.location.href);
    const gamertag = url.searchParams.get("gamertag");
    const server = url.searchParams.get("server");
    const queue = url.searchParams.get("queue");

    // Individual mode: needs gamertag
    if (gamertag !== null && gamertag.length > 0) {
      return true;
    }

    // Team mode: needs both server and queue
    if (server !== null && server.length > 0 && queue !== null && queue.length > 0) {
      return true;
    }

    return false;
  }, []);

  // If we don't have params to connect, show TrackerInitiation immediately
  if (!shouldConnectToTracker) {
    return <TrackerInitiationFactory apiHost={apiHost} initialGamertag="" />;
  }

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

  const loaded = services ? <LiveTrackerFactory services={services} apiHost={apiHost} /> : <ErrorState />;

  return <ComponentLoader status={loadingServices} loading={<LoadingState />} error={<ErrorState />} loaded={loaded} />;
}
