import type { MatchStats } from "halo-infinite-api";
import type {
  LiveTrackerMatchSummary,
  LiveTrackerStatus,
  PlayerAssociationData,
} from "@guilty-spark/contracts/live-tracker/types";

// Input types for individual tracker requests
export interface LiveTrackerIndividualStartRequest {
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
export interface LiveTrackerIndividualState {
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
      seriesId?: {
        guildId: string;
        queueNumber: number;
      };
    }
  >;
  channelManagePermissionCache?: boolean;
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
