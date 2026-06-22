import type { IndividualTrackerStatus } from "../../services/database/types/individual_trackers";

export interface IndividualTrackerState {
  userId: string;
  trackerId: string;
  xuid: string;
  gamertag: string;
  status: IndividualTrackerStatus;
  isPaused: boolean;
  startTime: string;
  lastUpdateTime: string;
  searchStartTime?: string;
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
  isMatchmaking: boolean;
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
  seriesGroupOverrides?: IndividualTrackerSeriesGroupOverride[];
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

export interface IndividualTrackerEditSeriesRequest {
  titleOverride?: string | null;
  subtitleOverride?: string | null;
  teams?: IndividualTrackerSeriesTeam[];
}

export interface IndividualTrackerStartSeriesResponse {
  success: true;
}

export interface IndividualTrackerSeriesGroupOverride {
  matchIds: string[];
  titleOverride: string | null;
  subtitleOverride: string | null;
}

export interface IndividualTrackerSelectMatchesRequest {
  matchIds: string[];
  seriesGroups?: IndividualTrackerSeriesGroupOverride[];
}

export interface IndividualTrackerSelectMatchesResponse {
  success: true;
}

export interface IndividualTrackerNudgeResponse {
  success: true;
}

export interface IndividualTrackerEditSeriesResponse {
  success: true;
}

export interface IndividualTrackerResumeSeriesResponse {
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

export interface ActiveSeriesContext {
  title: string;
  subtitle: string | null;
  teams: SeriesTeam[];
}

export interface IndividualTrackerViewState {
  trackerId: string;
  gamertag: string;
  status: IndividualTrackerStatus;
  matches: IndividualTrackerViewMatch[];
  series: IndividualTrackerSeriesGroup[];
  lastUpdateTime: string;
  lastMatchDiscoveredAt: string | null;
  hasActiveSeries: boolean;
  hasRecentCompletedSeries: boolean;
  activeSeriesContext?: ActiveSeriesContext;
  topBarStats?: TopBarStatItem[];
}

export interface IndividualTrackerViewStateResponse {
  state: IndividualTrackerViewState | null;
}
