import type { APIGuildMember } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import type { LiveTrackerMatchSummary, LiveTrackerStatus } from "@guilty-spark/contracts/live-tracker/types";
import type { LiveTrackerEmbedData } from "../live-tracker/types.mjs";

// Input types for requests to the LiveTracker DO
export interface LiveTrackerStartRequest {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  interactionToken?: string;
  liveMessageId?: string | undefined;
  players: Record<string, APIGuildMember>;
  teams: { name: string; playerIds: string[] }[];
  queueStartTime: string;
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

// Core state interface
export interface LiveTrackerState {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  isPaused: boolean;
  status: LiveTrackerStatus;
  liveMessageId?: string | undefined;
  startTime: string;
  lastUpdateTime: string;
  searchStartTime: string;
  checkCount: number;
  players: Record<string, APIGuildMember>;
  teams: {
    name: string;
    playerIds: string[];
  }[];
  substitutions: {
    playerOutId: string;
    playerInId: string;
    teamIndex: number;
    teamName: string;
    timestamp: string;
  }[];
  errorState: {
    consecutiveErrors: number;
    backoffMinutes: number;
    lastSuccessTime: string;
    lastErrorMessage?: string | undefined;
  };
  discoveredMatches: Record<string, LiveTrackerMatchSummary>;
  rawMatches: Record<string, MatchStats>;
  seriesScore: string;
  lastMessageState: {
    matchCount: number;
    substitutionCount: number;
  };
  channelManagePermissionCache?: boolean;
  lastRefreshAttempt?: string;
}

// Success response types
export interface LiveTrackerStartSuccessResponse {
  success: true;
  state: LiveTrackerState;
}

export interface LiveTrackerStartFailureResponse {
  success: false;
  state: LiveTrackerState;
}

export interface LiveTrackerPauseSuccessResponse {
  success: true;
  state: LiveTrackerState;
  embedData?: LiveTrackerEmbedData | undefined;
}

export interface LiveTrackerResumeSuccessResponse {
  success: true;
  state: LiveTrackerState;
  embedData?: LiveTrackerEmbedData | undefined;
}

export interface LiveTrackerStopSuccessResponse {
  success: true;
  state: LiveTrackerState;
  embedData?: LiveTrackerEmbedData | undefined;
}

export interface LiveTrackerRefreshSuccessResponse {
  success: true;
  state: LiveTrackerState;
}

export interface LiveTrackerRefreshCooldownErrorResponse {
  success: false;
  error: "cooldown";
  message: string;
}

export interface LiveTrackerRefreshFailureResponse {
  success: false;
  state: LiveTrackerState;
}

export interface LiveTrackerSubstitutionSuccessResponse {
  success: true;
  substitution: {
    playerOutId: string;
    playerInId: string;
    teamIndex: number;
  };
}

export interface LiveTrackerStatusSuccessResponse {
  state: LiveTrackerState;
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

export type LiveTrackerSubstitutionResponse = LiveTrackerSubstitutionSuccessResponse;

export type LiveTrackerStatusResponse = LiveTrackerStatusSuccessResponse;

export type LiveTrackerRepostResponse = LiveTrackerRepostSuccessResponse;

// Error response types for HTTP errors (when Response is not JSON)
export interface LiveTrackerHttpError {
  status: 400 | 404 | 429 | 500;
  message: string;
}

// Utility type for extracting JSON response from a Response
export type ExtractJsonResponse<T> = T extends Response ? (T extends { json(): Promise<infer U> } ? U : never) : T;

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

// Branded types for route validation
export type LiveTrackerAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "refresh"
  | "substitution"
  | "status"
  | "repost";

export interface LiveTrackerRoute {
  action: LiveTrackerAction;
  request: Request;
}

// Type mapping for request/response pairs
export interface LiveTrackerApiMap {
  start: {
    request: LiveTrackerStartRequest;
    response: LiveTrackerStartResponse;
  };
  pause: {
    request: never;
    response: LiveTrackerPauseResponse;
  };
  resume: {
    request: never;
    response: LiveTrackerResumeResponse;
  };
  stop: {
    request: never;
    response: LiveTrackerStopResponse;
  };
  refresh: {
    request: never;
    response: LiveTrackerRefreshResponse;
  };
  substitution: {
    request: LiveTrackerSubstitutionRequest;
    response: LiveTrackerSubstitutionResponse;
  };
  status: {
    request: never;
    response: LiveTrackerStatusResponse;
  };
  repost: {
    request: LiveTrackerRepostRequest;
    response: LiveTrackerRepostResponse;
  };
}

// Helper type for getting request type for an action
export type LiveTrackerRequestFor<T extends LiveTrackerAction> = LiveTrackerApiMap[T]["request"];

// Helper type for getting response type for an action
export type LiveTrackerResponseFor<T extends LiveTrackerAction> = LiveTrackerApiMap[T]["response"];
