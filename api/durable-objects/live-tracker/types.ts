import type { APIGuildMember } from "discord-api-types/v10";
import type {
  LiveTrackerMatchSummary,
  LiveTrackerStatus,
  PlayerAssociationData,
} from "@guilty-spark/shared/live-tracker/types";
import type { LiveTrackerRefreshResponse } from "@guilty-spark/shared/contracts/durable-objects/live-tracker/management";

// Mutable version of TeamMapping for internal state management
export interface TeamMapping {
  name: string;
  playerIds: string[];
}

// Core DO state interface — uses concrete types for DO-internal logic
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
  playersAssociationData: Record<string, PlayerAssociationData>;
  teams: TeamMapping[];
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
  matchIds: string[];
  seriesScore: string;
  lastMessageState: {
    matchCount: number;
    substitutionCount: number;
  };
  channelManagePermissionCache?: boolean;
  lastRefreshAttempt?: string;
  refreshInProgress?: boolean;
  refreshStartedAt?: string | undefined;
}

// Cooldown sub-type extracted from the union contract
export type LiveTrackerRefreshCooldownErrorResponse = Extract<
  LiveTrackerRefreshResponse,
  { success: false; error: "cooldown" }
>;

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
  return !response.success && "error" in response;
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
