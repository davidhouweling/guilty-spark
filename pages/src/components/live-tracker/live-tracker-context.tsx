import React, { createContext, useContext, useMemo } from "react";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import type { MatchStatsData } from "../stats/types";
import type { SeriesMetadata } from "../stats/series-metadata";
import type { LiveTrackerParams } from "./live-tracker-store";
import type {
  LiveTrackerViewModel,
  LiveTrackerMatchRenderModel,
  LiveTrackerSubstitutionRenderModel,
  LiveTrackerTeamRenderModel,
} from "./types";

interface LiveTrackerContextValue {
  readonly model: LiveTrackerViewModel;
  readonly params: LiveTrackerParams;
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
  readonly params: LiveTrackerParams;
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
  params,
  allMatchStats,
  seriesStats,
  children,
}: LiveTrackerProviderProps): React.ReactElement {
  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      model,
      params,
      allMatchStats,
      seriesStats,
    }),
    [model, params, allMatchStats, seriesStats],
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
  title: string;
  subtitle: string;
  iconUrl: string | null;
  statusText: string;
  statusClassName: string;
} {
  const { model } = useLiveTrackerContext();
  return useMemo(
    () => ({
      title: model.title,
      subtitle: model.subtitle,
      iconUrl: model.iconUrl,
      statusText: model.statusText,
      statusClassName: model.statusClassName,
    }),
    [model.title, model.subtitle, model.statusText, model.statusClassName, model.iconUrl],
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
 * Select teams data only (NeatQueue only)
 */
export function useTrackerTeams(): readonly LiveTrackerTeamRenderModel[] | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => (model.state?.type === "neatqueue" ? model.state.teams : null), [model.state]);
}

/**
 * Select matches data only (NeatQueue only)
 */
export function useTrackerMatches(): readonly LiveTrackerMatchRenderModel[] | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => (model.state?.type === "neatqueue" ? model.state.matches : null), [model.state]);
}

/**
 * Select players association data only
 */
export function useTrackerPlayersData(): Record<string, PlayerAssociationData> | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.state?.playersAssociationData ?? null, [model.state?.playersAssociationData]);
}

/**
 * Select series score (NeatQueue only)
 */
export function useSeriesScore(): string | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => (model.state?.type === "neatqueue" ? model.state.seriesScore : null), [model.state]);
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
 * Select a specific match by index (NeatQueue only)
 */
export function useMatchByIndex(index: number): LiveTrackerMatchRenderModel | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => {
    if (model.state?.type !== "neatqueue" || index < 0 || index >= model.state.matches.length) {
      return null;
    }
    return model.state.matches[index];
  }, [model.state, index]);
}

/**
 * Select substitutions (NeatQueue only)
 */
export function useSubstitutions(): readonly LiveTrackerSubstitutionRenderModel[] | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => (model.state?.type === "neatqueue" ? model.state.substitutions : null), [model.state]);
}

/**
 * Select match count
 */
export function useMatchCount(): number {
  const { model } = useLiveTrackerContext();
  return useMemo(() => {
    if (model.state?.type === "neatqueue") {
      return model.state.matches.length;
    }
    if (model.state?.type === "individual") {
      // Count all matches across all groups
      return model.state.groups.reduce((count, group) => {
        if (group.type === "single-match") {
          return count + 1;
        }
        // neatqueue-series or grouped-matches
        return count + group.matches.length;
      }, 0);
    }
    return 0;
  }, [model.state]);
}

/**
 * Check if tracker has matches
 */
export function useHasMatches(): boolean {
  const { model } = useLiveTrackerContext();
  return useMemo(() => {
    if (model.state?.type === "neatqueue") {
      return model.state.matches.length > 0;
    }
    if (model.state?.type === "individual") {
      return model.state.groups.length > 0;
    }
    return false;
  }, [model.state]);
}

/**
 * Select guild ID and queue number (NeatQueue only, for team colors)
 */
export function useTrackerIdentity(): { guildId: string; queueNumber: number } | null {
  const { model } = useLiveTrackerContext();
  return useMemo(() => {
    if (model.state?.type !== "neatqueue") {
      return null;
    }
    return {
      guildId: model.state.guildName,
      queueNumber: model.state.queueNumber,
    };
  }, [model.state]);
}

/**
 * Select tracker params (identity information)
 */
export function useTrackerParams(): LiveTrackerParams {
  const { params } = useLiveTrackerContext();
  return params;
}
