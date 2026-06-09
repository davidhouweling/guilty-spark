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
  hasActiveSeries?: boolean;
}

export interface IndividualTrackerMatchSummary {
  matchId: string;
  startTime: string;
  endTime: string;
  mapAssetId: string;
  mapVersionId: string;
  mapName: string;
  modeAssetId: string;
  gameVariantCategory: number;
  outcome: string;
  score: string;
  isMatchmaking: boolean;
  teamRosterSignature: string | null;
  teamOutcomes: number[] | null;
}

export interface IndividualTrackerViewMatch {
  matchId: string;
  startTime: string;
  endTime: string;
  mapAssetId: string;
  mapVersionId: string;
  mapName: string;
  modeAssetId: string;
  gameVariantCategory: number;
  outcome: string;
  score: string;
}

export interface SeriesPlayer {
  discordId: string | null;
  discordName: string | null;
  gamertag: string | null;
  xboxId: string | null;
}

export interface SeriesTeam {
  name: string;
  players: SeriesPlayer[];
}

export interface ActiveSeries {
  title: string;
  subtitle: string | null;
  guildIconUrl: string | null;
  teams: SeriesTeam[];
  matchIds: string[];
  startedAt: string;
  isActive: boolean;
}

export interface SeriesContextPayload {
  title: string;
  subtitle: string;
  guildIconUrl: string | null;
  teams: SeriesTeam[];
}

export interface IndividualTrackerSeriesGroup {
  id: string;
  matchIds: string[];
  score: string;
  title: string;
  subtitle: string;
  guildIconUrl?: string | null;
  teams?: SeriesTeam[];
}

export interface AccumulatedPlayerTotals {
  kills: number;
  deaths: number;
  assists: number;
  headshotKills: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  damageTaken: number;
  totalLifeSeconds: number;
  totalSpawns: number;
  totalLifeSpawns?: number;
}

export interface TopBarStatItem {
  label: string;
  value: string;
}

export interface IndividualTrackerInternalState extends IndividualTrackerState {
  searchStartTime: string;
  lastMatchDiscoveredAt: string | undefined;
  checkCount: number;
  matchIds: string[];
  discoveredMatches: Record<string, IndividualTrackerMatchSummary>;
  selectedMatchIds: string[];
  accumulatedPlayerTotals?: AccumulatedPlayerTotals;
  accumulatedMatchIds?: string[];
  activeSeries?: ActiveSeries;
  completedSeries?: ActiveSeries[];
  errorState: {
    consecutiveErrors: number;
    backoffMinutes: number;
    lastSuccessTime: string;
    lastErrorMessage?: string | undefined;
  };
}

export interface IndividualTrackerSeriesTeam {
  name: string;
  members: string[];
}

export interface IndividualTrackerStartSeriesRequest {
  titleOverride: string | null;
  subtitleOverride: string | null;
  teams: IndividualTrackerSeriesTeam[];
  matchIds?: string[];
}

export interface IndividualTrackerStartSeriesResponse {
  success: true;
}

export interface IndividualTrackerSelectMatchesRequest {
  matchIds: string[];
}

export interface IndividualTrackerSelectMatchesResponse {
  success: true;
}

export interface IndividualTrackerNudgeResponse {
  success: true;
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
  matches: IndividualTrackerViewMatch[];
  series: IndividualTrackerSeriesGroup[];
  lastUpdateTime: string;
  lastMatchDiscoveredAt: string | null;
  topBarStats?: readonly TopBarStatItem[];
}

export interface IndividualTrackerViewStateResponse {
  state: IndividualTrackerViewState | null;
}

export type IndividualTrackerAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "status"
  | "view-state"
  | "select-matches"
  | "nudge";

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
  "select-matches": {
    request: IndividualTrackerSelectMatchesRequest;
    response: IndividualTrackerSelectMatchesResponse;
  };
  nudge: {
    request: SeriesContextPayload | null;
    response: IndividualTrackerNudgeResponse;
  };
}

export type IndividualTrackerRequestFor<T extends IndividualTrackerAction> = IndividualTrackerApiMap[T]["request"];

export type IndividualTrackerResponseFor<T extends IndividualTrackerAction> = IndividualTrackerApiMap[T]["response"];
