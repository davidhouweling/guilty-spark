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

export interface IndividualTrackerStateSanitized {
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
  state: IndividualTrackerStateSanitized;
}

export interface IndividualTrackerPauseResponse {
  success: true;
  state: IndividualTrackerStateSanitized;
}

export interface IndividualTrackerResumeResponse {
  success: true;
  state: IndividualTrackerStateSanitized;
}

export interface IndividualTrackerStopResponse {
  success: true;
}

export interface IndividualTrackerStatusResponse {
  state: IndividualTrackerStateSanitized | null;
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
