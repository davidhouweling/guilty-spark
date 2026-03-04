import React, { createContext, useContext, useMemo } from "react";
import type { PlayerAssociationData } from "@guilty-spark/contracts/live-tracker/types";
import type { MatchStatsData } from "../stats/types";
import type { SeriesMetadata } from "../stats/series-metadata";
import type {
  LiveTrackerViewModel,
  LiveTrackerMatchRenderModel,
  LiveTrackerSubstitutionRenderModel,
  LiveTrackerTeamRenderModel,
} from "./types";

interface LiveTrackerContextValue {
  readonly model: LiveTrackerViewModel;
  readonly allMatchStats: readonly { matchId: string; data: MatchStatsData[] | null }[];
  readonly seriesStats: {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null;
}

const LiveTrackerContext = createContext<LiveTrackerContextValue | null>(null);

interface LiveTrackerProviderProps {
  readonly model: LiveTrackerViewModel;
  readonly allMatchStats: readonly { matchId: string; data: MatchStatsData[] | null }[];
  readonly seriesStats: {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null;
  readonly children: React.ReactNode;
}

export function LiveTrackerProvider({
  model,
  allMatchStats,
  seriesStats,
  children,
}: LiveTrackerProviderProps): React.ReactElement {
  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      model,
      allMatchStats,
      seriesStats,
    }),
    [model, allMatchStats, seriesStats],
  );

  return <LiveTrackerContext.Provider value={value}>{children}</LiveTrackerContext.Provider>;
}

function useLiveTrackerContext(): LiveTrackerContextValue {
  const context = useContext(LiveTrackerContext);
  if (context === null) {
    throw new Error("useLiveTrackerContext must be used within LiveTrackerProvider");
  }
  return context;
}

// Selector Hooks - Each returns a stable reference when data hasn't changed

/**
 * Select basic model information (status, guild name, etc.)
 */
export function useTrackerInfo(): {
  guildNameText: string;
  queueNumberText: string;
  statusText: string;
  statusClassName: string;
} {
  const { model } = useLiveTrackerContext();
  return useMemo(
    () => ({
      guildNameText: model.guildNameText,
      queueNumberText: model.queueNumberText,
      statusText: model.statusText,
      statusClassName: model.statusClassName,
    }),
    [model.guildNameText, model.queueNumberText, model.statusText, model.statusClassName],
  );
}

/**
 * Select full state (when component needs all state data)
 */
export function useTrackerState(): LiveTrackerViewModel["state"] {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.state, [model.state]);
}

/**
 * Select teams data only
 */
export function useTrackerTeams(): readonly LiveTrackerTeamRenderModel[] | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.state?.teams ?? null, [model.state?.teams]);
}

/**
 * Select matches data only
 */
export function useTrackerMatches(): readonly LiveTrackerMatchRenderModel[] | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.state?.matches ?? null, [model.state?.matches]);
}

/**
 * Select players association data only
 */
export function useTrackerPlayersData(): Record<string, PlayerAssociationData> | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.state?.playersAssociationData ?? null, [model.state?.playersAssociationData]);
}

/**
 * Select series score
 */
export function useSeriesScore(): string | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.state?.seriesScore ?? null, [model.state?.seriesScore]);
}

/**
 * Select all match stats (computed data)
 */
export function useAllMatchStats(): readonly { matchId: string; data: MatchStatsData[] | null }[] {
  const { allMatchStats } = useLiveTrackerContext();
  return allMatchStats;
}

/**
 * Select series stats (computed data)
 */
export function useSeriesStats(): {
  teamData: MatchStatsData[];
  playerData: MatchStatsData[];
  metadata: SeriesMetadata | null;
} | null {
  const { seriesStats } = useLiveTrackerContext();
  return seriesStats;
}

/**
 * Select a specific match by index
 */
export function useMatchByIndex(index: number): LiveTrackerMatchRenderModel | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => {
    if (model.state == null || index < 0 || index >= model.state.matches.length) {
      return null;
    }
    return model.state.matches[index];
  }, [model.state, index]);
}

/**
 * Select substitutions
 */
export function useSubstitutions(): readonly LiveTrackerSubstitutionRenderModel[] | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.state?.substitutions ?? null, [model.state?.substitutions]);
}

/**
 * Select match count
 */
export function useMatchCount(): number {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.state?.matches.length ?? 0, [model.state?.matches.length]);
}

/**
 * Check if tracker has matches
 */
export function useHasMatches(): boolean {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.state != null && model.state.matches.length > 0, [model.state?.matches.length]);
}

/**
 * Select guild ID and queue number (for team colors)
 */
export function useTrackerIdentity(): { guildId: string; queueNumber: number } | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => {
    if (model.state == null) {
      return null;
    }
    return {
      guildId: model.state.guildName,
      queueNumber: model.state.queueNumber,
    };
  }, [model.state?.guildName, model.state?.queueNumber]);
}
