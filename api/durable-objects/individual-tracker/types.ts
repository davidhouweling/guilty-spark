import type { LiveTrackerStatus } from "@guilty-spark/shared/live-tracker/types";

export const IDLE_TIMEOUT_HOURS = [1, 2, 3, 4, 5, 6] as const;
export type IdleTimeoutHours = (typeof IDLE_TIMEOUT_HOURS)[number];
export const DEFAULT_IDLE_TIMEOUT_HOURS: IdleTimeoutHours = 1;
export const MAX_ACTIVE_TRACKERS_PER_USER = 5;

/**
 * Lightweight match summary stored in the DO state.
 * Only contains fields directly available from getPlayerMatches (no additional API calls).
 */
export interface IndividualTrackerMatchSummary {
  readonly matchId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly mapAssetId: string;
  readonly modeAssetId: string;
}

// ─── Token management ───────────────────────────────────────────────────────

export interface UserMicrosoftTokens {
  /** User's Microsoft OAuth access token (for Halo API calls). */
  accessToken: string;
  /** User's Microsoft OAuth refresh token (optional, for auto-refresh). */
  refreshToken: string | undefined;
  /** When the access token expires (milliseconds since epoch). */
  expiresAt: number | undefined;
}

// ─── Inbound requests ────────────────────────────────────────────────────────

export interface IndividualTrackerStartRequest {
  /** The owning Microsoft user ID — used to gate all control mutations. */
  userId: string;
  /** Stable UUID for this tracker instance, created by the worker and stored in D1. */
  trackerId: string;
  /** XUID resolved from the linked identity. */
  xuid: string;
  /** Gamertag resolved from the linked identity or provided by the user. */
  gamertag: string;
  /** ISO timestamp to start searching for matches from. Defaults to now. */
  searchStartTime: string;
  /** How many hours of inactivity (no new matches) before auto-stopping. */
  idleTimeoutHours: IdleTimeoutHours;
  /** User's Microsoft OAuth access token for making API calls as the authenticated user. */
  userMicrosoftAccessToken: string;
  /** Optional refresh token to auto-renew access token. */
  userMicrosoftRefreshToken: string | undefined;
}

export interface IndividualTrackerGamesMutateRequest {
  /** Must match the tracker's owning userId to be accepted. */
  userId: string;
  matchId: string;
}

export interface IndividualTrackerSelectActiveRequest {
  /** Must match the tracker's owning userId. */
  userId: string;
}

// ─── Core state ──────────────────────────────────────────────────────────────

export interface IndividualTrackerState {
  userId: string;
  trackerId: string;
  xuid: string;
  gamertag: string;

  status: LiveTrackerStatus;
  isPaused: boolean;

  startTime: string;
  lastUpdateTime: string;
  searchStartTime: string;
  /** ISO timestamp of the last time a new match was discovered. Used for idle timeout. */
  lastMatchDiscoveredAt: string;

  checkCount: number;
  idleTimeoutHours: IdleTimeoutHours;

  /** User's Microsoft OAuth tokens for Halo API calls (held for tracker session duration). */
  userMicrosoftTokens: UserMicrosoftTokens | null;

  discoveredMatches: Record<string, IndividualTrackerMatchSummary>;
  matchIds: string[];
  /** Set of matchIds explicitly excluded by the owner while the tracker is active. */
  excludedMatchIds: string[];

  errorState: {
    consecutiveErrors: number;
    backoffMinutes: number;
    lastSuccessTime: string;
    lastErrorMessage?: string;
  };

  refreshInProgress: boolean | undefined;
  refreshStartedAt: string | undefined;
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface IndividualTrackerStartSuccessResponse {
  success: true;
  state: IndividualTrackerState;
}

export interface IndividualTrackerStartFailureResponse {
  success: false;
  error: string;
}

export type IndividualTrackerStartResponse =
  | IndividualTrackerStartSuccessResponse
  | IndividualTrackerStartFailureResponse;

export interface IndividualTrackerStopSuccessResponse {
  success: true;
  state: IndividualTrackerState;
}

export type IndividualTrackerStopResponse = IndividualTrackerStopSuccessResponse;

export interface IndividualTrackerStatusSuccessResponse {
  state: IndividualTrackerState;
}

export type IndividualTrackerStatusResponse = IndividualTrackerStatusSuccessResponse;

export interface IndividualTrackerGamesAddSuccessResponse {
  success: true;
  matchId: string;
}

export interface IndividualTrackerGamesAddFailureResponse {
  success: false;
  error: string;
}

export type IndividualTrackerGamesAddResponse =
  | IndividualTrackerGamesAddSuccessResponse
  | IndividualTrackerGamesAddFailureResponse;

export interface IndividualTrackerGamesRemoveSuccessResponse {
  success: true;
  matchId: string;
}

export type IndividualTrackerGamesRemoveResponse = IndividualTrackerGamesRemoveSuccessResponse;

// ─── Type guards ─────────────────────────────────────────────────────────────

export function isSuccessResponse<T extends { success: boolean }>(response: T): response is T & { success: true } {
  return response.success;
}
