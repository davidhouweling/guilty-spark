export type LiveTrackerIdentity =
  | {
      readonly type: "team";
      readonly guildId: string;
      readonly queueNumber: string;
    }
  | {
      readonly type: "individual";
      readonly gamertag: string;
    };

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
 * Top-level discriminated union for live tracker state.
 * Use type field to determine which tracker type is active:
 * - "neatqueue": Team-based tracker for Discord guild queues
 * - "individual": Player-based tracker for single gamertag
 */
export type LiveTrackerStateData = LiveTrackerNeatQueueStateData | LiveTrackerIndividualStateData;

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

// ============================================================================
// INDIVIDUAL TRACKER STATE
// ============================================================================

/**
 * State data for Individual tracker (single player, non-NeatQueue).
 * Contains heterogeneous groups: NeatQueue series, manual groupings, single matches.
 */
export interface LiveTrackerIndividualStateData {
  readonly type: "individual";
  readonly gamertag: string;
  readonly xuid: string;
  readonly status: LiveTrackerStatus;
  readonly lastUpdateTime: string;
  readonly medalMetadata: Record<number, { name: string; sortingWeight: number }>;
  readonly playersAssociationData: Record<string, PlayerAssociationData> | null;
  readonly groups: readonly LiveTrackerIndividualGroup[];
  readonly rawMatches: Record<string, unknown>;
}

// ============================================================================
// INDIVIDUAL GROUPS (discriminated union)
// ============================================================================

/**
 * Discriminated union for Individual tracker match groups.
 * Each group type represents a different way matches are organized:
 * - "neatqueue-series": Active NeatQueue series (enables UI component reuse)
 * - "grouped-matches": Manually grouped matches (same participants)
 * - "single-match": Ungrouped individual match
 */
export type LiveTrackerIndividualGroup =
  | LiveTrackerNeatQueueSeriesGroup
  | LiveTrackerManualMatchGroup
  | LiveTrackerSingleMatchGroup;

/**
 * NeatQueue series within an Individual tracker.
 * Extends shared series data, enabling reuse of NeatQueue series UI components.
 * Created when player participates in an active Discord guild queue.
 */
export interface LiveTrackerNeatQueueSeriesGroup extends LiveTrackerNeatQueueSeriesData {
  readonly type: "neatqueue-series";
  readonly groupId: string;
  readonly seriesId: {
    guildId: string;
    queueNumber: number;
  };
}

/**
 * Manually-grouped matches (same participants over time).
 * E.g., "Custom Games • Feb 15-16 • 5 players"
 * Series score always computed from match results.
 */
export interface LiveTrackerManualMatchGroup {
  readonly type: "grouped-matches";
  readonly groupId: string;
  readonly label: string;
  readonly seriesScore: string; // Required - computed from matches
  readonly matchSummaries: readonly LiveTrackerMatchSummary[];
}

/**
 * Single ungrouped match.
 * Used for matches that don't belong to any series or manual grouping.
 */
export interface LiveTrackerSingleMatchGroup {
  readonly type: "single-match";
  readonly groupId: string; // Use matchId as groupId
  readonly matchSummary: LiveTrackerMatchSummary;
}

export interface LiveTrackerStateMessage {
  readonly type: "state";
  readonly data: LiveTrackerStateData;
  readonly timestamp: string;
}

export type LiveTrackerMessage = LiveTrackerStateMessage;
