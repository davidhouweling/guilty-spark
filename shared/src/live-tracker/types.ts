export interface LiveTrackerIdentity {
  readonly type: "team";
  readonly guildId: string;
  readonly queueNumber: string;
}

export type LiveTrackerStatus = "active" | "paused" | "stopped";

export interface LiveTrackerMatchSummary {
  readonly matchId: string;
  readonly gameTypeAndMap: string;
  readonly gameType: string;
  readonly gameMap: string;
  readonly gameMapThumbnailUrl: string;
  readonly duration: string;
  readonly gameScore: string;
  readonly gameSubScore: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly playerXuidToGametag: Record<string, string>;
}

export interface LiveTrackerPlayer {
  readonly id: string;
  readonly discordUsername: string;
}

export interface PlayerAssociationData {
  readonly discordId: string;
  readonly discordName: string;
  readonly xboxId: string | null;
  readonly gamertag: string | null;
  readonly currentRank: number | null;
  readonly currentRankTier: string | null;
  readonly currentRankSubTier: number | null;
  readonly currentRankMeasurementMatchesRemaining: number | null;
  readonly currentRankInitialMeasurementMatches: number | null;
  readonly allTimePeakRank: number | null;
  readonly esra: number | null;
  readonly lastRankedGamePlayed: string | null;
}

export interface LiveTrackerTeam {
  readonly name: string;
  readonly playerIds: readonly string[];
}

// ============================================================================
// SHARED NEATQUEUE SERIES DATA (single source of truth)
// ============================================================================

/**
 * Core data structure for a NeatQueue series.
 * Shared between LiveTrackerNeatQueueStateData and LiveTrackerNeatQueueSeriesGroup.
 * Contains all information about players, teams, substitutions, and matches in a series.
 */
export interface LiveTrackerNeatQueueSeriesData {
  readonly players: readonly LiveTrackerPlayer[];
  readonly teams: readonly LiveTrackerTeam[];
  readonly substitutions: readonly {
    playerOutId: string;
    playerInId: string;
    teamIndex: number;
    teamName: string;
    timestamp: string;
  }[];
  readonly seriesScore: string;
  readonly matchSummaries: readonly LiveTrackerMatchSummary[];
  readonly seriesData?: {
    seriesId: {
      guildId: string;
      queueNumber: number;
    };
    teams: readonly {
      name: string;
      playerIds: readonly string[];
    }[];
    seriesScore: string;
    matchIds: readonly string[];
    startTime: string;
    lastUpdateTime: string;
  };
}

// ============================================================================
// TOP-LEVEL DISCRIMINATED UNION
// ============================================================================

/**
 * Top-level live tracker state for Discord guild queues.
 */
export type LiveTrackerStateData = LiveTrackerNeatQueueStateData;

// ============================================================================
// NEATQUEUE TRACKER STATE (extends shared series data)
// ============================================================================

/**
 * State data for NeatQueue team tracker (Discord guild queue).
 * Extends LiveTrackerNeatQueueSeriesData with guild/queue context.
 */
export interface LiveTrackerNeatQueueStateData extends LiveTrackerNeatQueueSeriesData {
  readonly type: "neatqueue";
  readonly guildId: string;
  readonly guildIcon: string | null;
  readonly guildName: string;
  readonly channelId: string;
  readonly queueNumber: number;
  readonly status: LiveTrackerStatus;
  readonly lastUpdateTime: string;
  readonly medalMetadata: Record<number, { name: string; sortingWeight: number }>;
  readonly playersAssociationData: Record<string, PlayerAssociationData> | null;
  readonly rawMatches: Record<string, unknown>;
}

export interface LiveTrackerStateMessage {
  readonly type: "state";
  readonly data: LiveTrackerStateData;
  readonly timestamp: string;
}

export type LiveTrackerMessage = LiveTrackerStateMessage;
