import type { MatchStats } from "halo-infinite-api";
import type {
  LiveTrackerMatchSummary,
  LiveTrackerStatus,
  PlayerAssociationData,
} from "@guilty-spark/contracts/live-tracker/types";

// Input types for individual tracker requests
export interface LiveTrackerStartRequestIndividual {
  userId: string;
  guildId: string;
  channelId: string;
  xuid: string;
  gamertag: string;
  interactionToken?: string;
  liveMessageId?: string | undefined;
  searchStartTime: string;
  selectedGameIds: string[]; // Filter to only these matches
  playersAssociationData: Record<string, PlayerAssociationData> | null;
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

// Core state interface for individual tracking
export interface LiveTrackerStateIndividual {
  userId: string;
  xuid: string;
  gamertag: string;
  guildId: string;
  channelId: string;
  isPaused: boolean;
  status: LiveTrackerStatus;
  liveMessageId?: string | undefined;
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
    }
  >;
  channelManagePermissionCache?: boolean;
  lastRefreshAttempt?: string;
  refreshInProgress?: boolean;
  refreshStartedAt?: string | undefined;
  playersAssociationData: Record<string, PlayerAssociationData> | null;
}

// Success response types
export interface LiveTrackerStartSuccessResponse {
  success: true;
  state: LiveTrackerStateIndividual;
}

export interface LiveTrackerStartFailureResponse {
  success: false;
  state: LiveTrackerStateIndividual;
}

export interface LiveTrackerPauseSuccessResponse {
  success: true;
  state: LiveTrackerStateIndividual;
}

export interface LiveTrackerResumeSuccessResponse {
  success: true;
  state: LiveTrackerStateIndividual;
}

export interface LiveTrackerStopSuccessResponse {
  success: true;
  state: LiveTrackerStateIndividual;
}

export interface LiveTrackerRefreshSuccessResponse {
  success: true;
  state: LiveTrackerStateIndividual;
}

export interface LiveTrackerRefreshCooldownErrorResponse {
  success: false;
  error: "cooldown";
  message: string;
}

export interface LiveTrackerRefreshFailureResponse {
  success: false;
  state: LiveTrackerStateIndividual;
}

export interface LiveTrackerStatusSuccessResponse {
  state: LiveTrackerStateIndividual;
}

export interface LiveTrackerRepostSuccessResponse {
  success: true;
  oldMessageId: string;
  newMessageId: string;
}

// Union types for each handler's possible responses
export type LiveTrackerStartResponse = LiveTrackerStartSuccessResponse | LiveTrackerStartFailureResponse;

export type LiveTrackerPauseResponse = LiveTrackerPauseSuccessResponse;

export type LiveTrackerResumeResponse = LiveTrackerResumeSuccessResponse;

export type LiveTrackerStopResponse = LiveTrackerStopSuccessResponse;

export type LiveTrackerRefreshResponse =
  | LiveTrackerRefreshSuccessResponse
  | LiveTrackerRefreshCooldownErrorResponse
  | LiveTrackerRefreshFailureResponse;

export type LiveTrackerStatusResponse = LiveTrackerStatusSuccessResponse;

export type LiveTrackerRepostResponse = LiveTrackerRepostSuccessResponse;

// Type guards for response discrimination
export function isSuccessResponse<T extends { success: boolean }>(response: T): response is T & { success: true } {
  return response.success;
}

export function isErrorResponse<T extends { success: boolean }>(response: T): response is T & { success: false } {
  return !response.success;
}

export function isCooldownError(
  response: LiveTrackerRefreshResponse,
): response is LiveTrackerRefreshCooldownErrorResponse {
  return !isSuccessResponse(response) && "error" in response;
}
