export type IndividualTrackerStatus = "active" | "paused" | "stopped";

/**
 * Lightweight match summary stored in the DO state.
 * Contains only fields directly available from getPlayerMatches.
 */
export interface IndividualTrackerMatchSummary {
  readonly matchId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly mapAssetId: string;
  readonly modeAssetId: string;
}

/**
 * Full state of an individual tracker Durable Object.
 * Transmitted to viewer clients via WebSocket.
 */
export interface IndividualTrackerState {
  readonly userId: string;
  readonly trackerId: string;
  readonly xuid: string;
  readonly gamertag: string;
  readonly teamColor?: string;
  readonly enemyColor?: string;

  readonly status: IndividualTrackerStatus;
  readonly isPaused: boolean;

  readonly startTime: string;
  readonly lastUpdateTime: string;
  readonly searchStartTime: string;
  /** ISO timestamp of the last time a new match was discovered. Used for idle timeout. */
  readonly lastMatchDiscoveredAt: string;

  readonly checkCount: number;
  readonly idleTimeoutHours: number;

  readonly discoveredMatches: Record<string, IndividualTrackerMatchSummary>;
  readonly matchIds: readonly string[];
  /** Match IDs explicitly excluded by the owner during active tracking. */
  readonly excludedMatchIds: readonly string[];

  readonly errorState: {
    readonly consecutiveErrors: number;
    readonly backoffMinutes: number;
    readonly lastSuccessTime: string;
    readonly lastErrorMessage?: string;
  };

  readonly refreshInProgress: boolean | undefined;
  readonly refreshStartedAt: string | undefined;
}

/**
 * WebSocket message envelope sent from the DO to viewer clients.
 */
export interface IndividualTrackerStateMessage {
  readonly type: "state";
  readonly data: IndividualTrackerState;
  readonly timestamp: string;
}
