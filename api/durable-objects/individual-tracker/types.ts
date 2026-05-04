import type { IndividualTrackerSeriesGroup } from "@guilty-spark/shared/individual-tracker/types";
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
  /** Optional observer-style color for tracked team. */
  teamColor?: string;
  /** Optional observer-style color for opposing team. */
  enemyColor?: string;
}

export interface IndividualTrackerViewerStyleUpdateRequest {
  /** Must match the tracker's owning userId to be accepted. */
  userId: string;
  teamColor?: string;
  enemyColor?: string;
}

export interface IndividualTrackerGamesMutateRequest {
  /** Must match the tracker's owning userId to be accepted. */
  userId: string;
  matchId: string;
}

export interface IndividualTrackerGamesSyncRequest {
  /** Must match the tracker's owning userId to be accepted. */
  userId: string;
  selectedMatchIds: string[];
  matchGroupings: string[][];
  matchSummaries: IndividualTrackerMatchSummary[];
}

export interface IndividualTrackerSeriesGroupUpdateRequest {
  /** Must match the tracker's owning userId to be accepted. */
  userId: string;
  matchIds: string[];
  titleOverride: string | null;
  subtitleOverride: string | null;
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
  teamColor: string;
  enemyColor: string;

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
  matchGroupings: string[][];
  seriesGroups: IndividualTrackerSeriesGroup[];
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

/**
 * Sanitized state for client-facing responses (excludes sensitive token data).
 * All fields are identical to IndividualTrackerState except userMicrosoftTokens is never included.
 */
export type IndividualTrackerStateSanitized = Omit<IndividualTrackerState, "userMicrosoftTokens">;

/**
 * Sanitize tracker state for client-facing responses by removing sensitive token information.
 */
export function sanitizeTrackerState(state: IndividualTrackerState): IndividualTrackerStateSanitized {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userMicrosoftTokens, ...sanitized } = state;
  return sanitized;
}

export interface IndividualTrackerStartSuccessResponse {
  success: true;
  state: IndividualTrackerStateSanitized;
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
  state: IndividualTrackerStateSanitized;
}

export type IndividualTrackerStopResponse = IndividualTrackerStopSuccessResponse;

export interface IndividualTrackerPauseSuccessResponse {
  success: true;
  state: IndividualTrackerStateSanitized;
}

export type IndividualTrackerPauseResponse = IndividualTrackerPauseSuccessResponse;

export interface IndividualTrackerResumeSuccessResponse {
  success: true;
  state: IndividualTrackerStateSanitized;
}

export type IndividualTrackerResumeResponse = IndividualTrackerResumeSuccessResponse;

export interface IndividualTrackerRefreshSuccessResponse {
  success: true;
  state: IndividualTrackerStateSanitized;
}

export interface IndividualTrackerRefreshFailureResponse {
  success: false;
  error?: string;
  message?: string;
}

export type IndividualTrackerRefreshResponse =
  | IndividualTrackerRefreshSuccessResponse
  | IndividualTrackerRefreshFailureResponse;

export interface IndividualTrackerStatusSuccessResponse {
  state: IndividualTrackerStateSanitized;
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

export interface IndividualTrackerGamesSyncSuccessResponse {
  success: true;
  state: IndividualTrackerStateSanitized;
}

export type IndividualTrackerGamesSyncResponse = IndividualTrackerGamesSyncSuccessResponse;

export interface IndividualTrackerSeriesGroupUpdateSuccessResponse {
  success: true;
  state: IndividualTrackerStateSanitized;
}

export type IndividualTrackerSeriesGroupUpdateResponse = IndividualTrackerSeriesGroupUpdateSuccessResponse;

// ─── Type guards ─────────────────────────────────────────────────────────────

export function isSuccessResponse<T extends { success: boolean }>(response: T): response is T & { success: true } {
  return response.success;
}
