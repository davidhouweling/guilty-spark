import React, { createContext, useContext, useMemo } from "react";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import type { MatchStatsData } from "../../controllers/stats/types";
import type { SeriesMetadata } from "../../controllers/stats/series-metadata";
import { type ComponentLoaderStatus } from "../component-loader/component-loader";
import type { KillMatrixPivotData } from "../../controllers/stats/kill-matrix/types";
import type { LiveTrackerParams } from "./live-tracker-store";
import type {
  LiveTrackerAvailablePlayer,
  LiveTrackerViewModel,
  LiveTrackerMatchRenderModel,
  LiveTrackerSubstitutionRenderModel,
  LiveTrackerTeamRenderModel,
} from "./types";

interface MatchKillMatrix {
  readonly matchId: string;
  readonly pivotData: KillMatrixPivotData;
  readonly transposedPivotData: KillMatrixPivotData;
}

interface KillMatrixResult {
  readonly pivotData: KillMatrixPivotData;
  readonly transposedPivotData: KillMatrixPivotData;
}

interface LiveTrackerContextValue {
  readonly model: LiveTrackerViewModel;
  readonly params: LiveTrackerParams;
  readonly allMatchStats: readonly { matchId: string; data: MatchStatsData[] | null }[];
  readonly seriesStats: {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null;
  readonly analyticsStatus: ComponentLoaderStatus;
  readonly allMatchKillMatrix: readonly MatchKillMatrix[];
  readonly seriesKillMatrix: KillMatrixResult | null;
}

const LiveTrackerContext = createContext<LiveTrackerContextValue | null>(null);

export interface LiveTrackerProviderProps {
  readonly model: LiveTrackerViewModel;
  readonly params: LiveTrackerParams;
  readonly allMatchStats: readonly { matchId: string; data: MatchStatsData[] | null }[];
  readonly seriesStats: {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null;
  readonly analyticsStatus: ComponentLoaderStatus;
  readonly allMatchKillMatrix: readonly MatchKillMatrix[];
  readonly seriesKillMatrix: KillMatrixResult | null;
  readonly children: React.ReactNode;
}

export function LiveTrackerProvider({
  model,
  params,
  allMatchStats,
  seriesStats,
  analyticsStatus,
  allMatchKillMatrix,
  seriesKillMatrix,
  children,
}: LiveTrackerProviderProps): React.ReactElement {
  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      model,
      params,
      allMatchStats,
      seriesStats,
      analyticsStatus,
      allMatchKillMatrix,
      seriesKillMatrix,
    }),
    [model, params, allMatchStats, seriesStats, analyticsStatus, allMatchKillMatrix, seriesKillMatrix],
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
 * Select substitutions sorted by timestamp (pre-sorted by presenter)
 */
export function useSubstitutions(): readonly LiveTrackerSubstitutionRenderModel[] {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.sortedSubstitutions, [model.sortedSubstitutions]);
}

/**
 * Select available players for settings (pre-computed by presenter)
 */
export function useAvailablePlayers(): readonly LiveTrackerAvailablePlayer[] {
  const { model } = useLiveTrackerContext();
  return useMemo(() => model.availablePlayers, [model.availablePlayers]);
}

/**
 * Select match count
 */
export function useMatchCount(): number {
  const { model } = useLiveTrackerContext();
  return useMemo(() => {
    if (model.state == null) {
      return 0;
    }
    return model.state.matches.length;
  }, [model.state]);
}

/**
 * Check if tracker has matches
 */
export function useHasMatches(): boolean {
  const { model } = useLiveTrackerContext();
  return useMemo(() => {
    if (model.state == null) {
      return false;
    }
    return model.state.matches.length > 0;
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

/**
 * Select analytics loading status
 */
export function useAnalyticsStatus(): ComponentLoaderStatus {
  const { analyticsStatus } = useLiveTrackerContext();
  return analyticsStatus;
}

/**
 * Select kill matrix data for all matches
 */
export function useAllMatchKillMatrix(): readonly MatchKillMatrix[] {
  const { allMatchKillMatrix } = useLiveTrackerContext();
  return allMatchKillMatrix;
}

/**
 * Select series-level kill matrix data
 */
export function useSeriesKillMatrix(): KillMatrixResult | null {
  const { seriesKillMatrix } = useLiveTrackerContext();
  return seriesKillMatrix;
}
