import type { MatchStats } from "halo-infinite-api";
import type {
  LiveTrackerMatchSummary,
  LiveTrackerStatus,
  PlayerAssociationData,
} from "@guilty-spark/contracts/live-tracker/types";

// Input types for individual tracker requests
export interface LiveTrackerIndividualStartRequest {
  xuid: string;
  gamertag: string;
  searchStartTime: string;
  selectedGameIds: string[]; // Filter to only these matches
  playersAssociationData: Record<string, PlayerAssociationData> | null;
  initialTarget?: UpdateTarget; // Optional: pre-created target (e.g., Discord) to add on start
}

// Web-based start request (no Discord integration)
export interface LiveTrackerIndividualWebStartRequest {
  xuid: string;
  gamertag: string;
  searchStartTime: string;
  selectedMatchIds: string[]; // User-selected match IDs from the web UI
  groupings: string[][]; // Array of arrays - each inner array is match IDs to group together
}

export interface LiveTrackerSubstitutionRequest {
  playerOutId: string;
  playerInId: string;
}

export interface LiveTrackerRefreshRequest {
  matchCompleted?: boolean;
}

export interface LiveTrackerRepostRequest {
  newMessageId: string;
}

// Update target types for multi-platform broadcast system
export interface DiscordTarget {
  userId: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  lastMatchCount: number; // Track match count to determine when to create new messages
}

export interface WebSocketTarget {
  sessionId: string;
}

export interface UpdateTarget {
  id: string; // Unique identifier for this target
  type: "discord" | "websocket";
  createdAt: string;
  lastUpdatedAt?: string;

  // Failure tracking
  lastFailureAt?: string;
  failureReason?: string;
  markedForRemoval?: boolean; // Internal flag for cleanup

  // Platform-specific fields (discriminated by type)
  discord?: DiscordTarget;
  websocket?: WebSocketTarget;
}

// Core state interface for individual tracking
export interface LiveTrackerIndividualState {
  // Player identification
  xuid: string;
  gamertag: string;

  // Core tracking state
  isPaused: boolean;
  status: LiveTrackerStatus;

  // Multi-platform update targets
  updateTargets: UpdateTarget[];

  // Core tracking fields
  startTime: string;
  lastUpdateTime: string;
  searchStartTime: string;
  checkCount: number;
  selectedGameIds: string[];
  substitutions: []; // No substitutions for individual tracking
  discoveredMatches: Record<string, LiveTrackerMatchSummary>;
  rawMatches: Record<string, MatchStats>;
  seriesScore: string;
  lastMessageState: {
    matchCount: number;
    substitutionCount: 0;
  };
  errorState: {
    consecutiveErrors: number;
    backoffMinutes: number;
    lastSuccessTime: string;
    lastErrorMessage?: string | undefined;
  };
  matchGroupings: Record<
    string,
    {
      groupId: string;
      matchIds: string[];
      participants: string[]; // Player XUIDs in this group
      seriesId?: {
        guildId: string;
        queueNumber: number;
      };
    }
  >;
  lastRefreshAttempt?: string;
  refreshInProgress?: boolean;
  refreshStartedAt?: string | undefined;
  playersAssociationData: Record<string, PlayerAssociationData> | null;
}

// Success response types
export interface LiveTrackerIndividualStartSuccessResponse {
  success: true;
  state: LiveTrackerIndividualState;
}

export interface LiveTrackerIndividualStartFailureResponse {
  success: false;
  state: LiveTrackerIndividualState;
}

export interface LiveTrackerIndividualWebStartSuccessResponse {
  success: true;
  websocketUrl: string;
  gamertag: string;
}

export interface LiveTrackerIndividualWebStartFailureResponse {
  success: false;
  error: string;
}

export interface LiveTrackerIndividualPauseSuccessResponse {
  success: true;
  state: LiveTrackerIndividualState;
}

export interface LiveTrackerIndividualResumeSuccessResponse {
  success: true;
  state: LiveTrackerIndividualState;
}

export interface LiveTrackerIndividualStopSuccessResponse {
  success: true;
  state: LiveTrackerIndividualState;
}

export interface LiveTrackerIndividualRefreshSuccessResponse {
  success: true;
  state: LiveTrackerIndividualState;
}

export interface LiveTrackerIndividualRefreshCooldownErrorResponse {
  success: false;
  error: "cooldown";
  message: string;
}

export interface LiveTrackerIndividualRefreshFailureResponse {
  success: false;
  state: LiveTrackerIndividualState;
}

export interface LiveTrackerIndividualStatusSuccessResponse {
  state: LiveTrackerIndividualState;
}

export interface LiveTrackerIndividualRepostSuccessResponse {
  success: true;
  oldMessageId: string;
  newMessageId: string;
}

// Union types for each handler's possible responses
export type LiveTrackerIndividualStartResponse =
  | LiveTrackerIndividualStartSuccessResponse
  | LiveTrackerIndividualStartFailureResponse;

export type LiveTrackerIndividualWebStartResponse =
  | LiveTrackerIndividualWebStartSuccessResponse
  | LiveTrackerIndividualWebStartFailureResponse;

export type LiveTrackerIndividualPauseResponse = LiveTrackerIndividualPauseSuccessResponse;

export type LiveTrackerIndividualResumeResponse = LiveTrackerIndividualResumeSuccessResponse;

export type LiveTrackerIndividualStopResponse = LiveTrackerIndividualStopSuccessResponse;

export type LiveTrackerIndividualRefreshResponse =
  | LiveTrackerIndividualRefreshSuccessResponse
  | LiveTrackerIndividualRefreshCooldownErrorResponse
  | LiveTrackerIndividualRefreshFailureResponse;

export type LiveTrackerIndividualStatusResponse = LiveTrackerIndividualStatusSuccessResponse;

export type LiveTrackerIndividualRepostResponse = LiveTrackerIndividualRepostSuccessResponse;

// Type guards for response discrimination
export function isSuccessResponse<T extends { success: boolean }>(response: T): response is T & { success: true } {
  return response.success;
}

export function isErrorResponse<T extends { success: boolean }>(response: T): response is T & { success: false } {
  return !response.success;
}

export function isCooldownError(
  response: LiveTrackerIndividualRefreshResponse,
): response is LiveTrackerIndividualRefreshCooldownErrorResponse {
  return !isSuccessResponse(response) && "error" in response;
}
