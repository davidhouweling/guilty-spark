import type { LiveTrackerMatchSummary, PlayerAssociationData } from "./types";

/**
 * Team mapping with player information.
 * Single source of truth for team structure across both trackers.
 */
export interface TeamMapping {
  readonly name: string;
  readonly playerIds: readonly string[];
}

/**
 * Unique identifier for a NeatQueue series
 */
export interface SeriesId {
  readonly guildId: string;
  readonly queueNumber: number;
}

/**
 * Complete series data from NeatQueue tracker.
 * This is the authoritative source for series information when a player
 * is participating in an active NeatQueue series.
 */
export interface SeriesData {
  readonly seriesId: SeriesId;
  readonly teams: readonly TeamMapping[];
  readonly seriesScore: string;
  readonly matchIds: readonly string[];
  readonly discoveredMatches: ReadonlyMap<string, LiveTrackerMatchSummary>;
  readonly playersAssociationData: Record<string, PlayerAssociationData>;
  readonly substitutions: readonly {
    playerOutId: string;
    playerInId: string;
    teamIndex: number;
    teamName: string;
    timestamp: string;
  }[];
  readonly startTime: string;
  readonly lastUpdateTime: string;
}

/**
 * Link between individual tracker and NeatQueue series.
 * Used by individual tracker to reference and fetch series data.
 */
export interface SeriesLink {
  readonly seriesId: SeriesId;
  readonly linkedAt: string;
  readonly lastFetchedAt: string;
}
