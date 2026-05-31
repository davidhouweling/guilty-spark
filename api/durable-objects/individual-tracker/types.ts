import type { IndividualTrackerStatus } from "../../services/database/types/individual_trackers";

export interface IndividualTrackerStartRequest {
  userId: string;
  trackerId: string;
  xuid: string;
  gamertag: string;
  searchStartTime: string;
  idleTimeoutHours: number;
}

export interface IndividualTrackerInternalState {
  userId: string;
  trackerId: string;
  xuid: string;
  gamertag: string;
  status: IndividualTrackerStatus;
  isPaused: boolean;
  startTime: string;
  lastUpdateTime: string;
  searchStartTime: string;
  lastMatchDiscoveredAt: string | undefined;
  checkCount: number;
  idleTimeoutHours: number;
  errorState: {
    consecutiveErrors: number;
    backoffMinutes: number;
    lastSuccessTime: string;
    lastErrorMessage?: string | undefined;
  };
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

export type IndividualTrackerAction = "start" | "pause" | "resume" | "stop" | "status";

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
}

export type IndividualTrackerRequestFor<T extends IndividualTrackerAction> = IndividualTrackerApiMap[T]["request"];

export type IndividualTrackerResponseFor<T extends IndividualTrackerAction> = IndividualTrackerApiMap[T]["response"];
