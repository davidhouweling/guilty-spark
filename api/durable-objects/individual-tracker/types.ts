import type { IndividualTrackerStatus } from "../../services/database/types/individual_trackers";

export interface IndividualTrackerStartRequest {
  userId: string;
  trackerId: string;
  xuid: string;
  gamertag: string;
  searchStartTime: string;
  idleTimeoutHours: number;
}

export interface IndividualTrackerState {
  userId: string;
  trackerId: string;
  xuid: string;
  gamertag: string;
  status: IndividualTrackerStatus;
  isPaused: boolean;
  startTime: string;
  lastUpdateTime: string;
  idleTimeoutHours: number;
}

export interface IndividualTrackerMatchSummary {
  matchId: string;
  startTime: string;
  endTime: string;
  mapAssetId: string;
  modeAssetId: string;
  outcome: string;
  score: string;
}

export interface IndividualTrackerInternalState extends IndividualTrackerState {
  searchStartTime: string;
  lastMatchDiscoveredAt: string | undefined;
  checkCount: number;
  matchIds: string[];
  discoveredMatches: Record<string, IndividualTrackerMatchSummary>;
  errorState: {
    consecutiveErrors: number;
    backoffMinutes: number;
    lastSuccessTime: string;
    lastErrorMessage?: string | undefined;
  };
}

export interface IndividualTrackerStartResponse {
  success: true;
  state: IndividualTrackerState;
}

export interface IndividualTrackerPauseResponse {
  success: true;
  state: IndividualTrackerState;
}

export interface IndividualTrackerResumeResponse {
  success: true;
  state: IndividualTrackerState;
}

export interface IndividualTrackerStopResponse {
  success: true;
}

export interface IndividualTrackerStatusResponse {
  state: IndividualTrackerState | null;
}

export interface IndividualTrackerViewState {
  trackerId: string;
  gamertag: string;
  status: IndividualTrackerStatus;
  matches: IndividualTrackerMatchSummary[];
  lastUpdateTime: string;
  lastMatchDiscoveredAt: string | null;
}

export interface IndividualTrackerViewStateResponse {
  state: IndividualTrackerViewState | null;
}

export type IndividualTrackerAction = "start" | "pause" | "resume" | "stop" | "status" | "view-state";

export interface IndividualTrackerApiMap {
  start: {
    request: IndividualTrackerStartRequest;
    response: IndividualTrackerStartResponse;
  };
  pause: {
    request: never;
    response: IndividualTrackerPauseResponse;
  };
  resume: {
    request: never;
    response: IndividualTrackerResumeResponse;
  };
  stop: {
    request: never;
    response: IndividualTrackerStopResponse;
  };
  status: {
    request: never;
    response: IndividualTrackerStatusResponse;
  };
  "view-state": {
    request: never;
    response: IndividualTrackerViewStateResponse;
  };
}

export type IndividualTrackerRequestFor<T extends IndividualTrackerAction> = IndividualTrackerApiMap[T]["request"];

export type IndividualTrackerResponseFor<T extends IndividualTrackerAction> = IndividualTrackerApiMap[T]["response"];
