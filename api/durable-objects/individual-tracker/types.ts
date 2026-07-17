import type { NormalizedMatchOutcome } from "@guilty-spark/shared/halo/match-enrichment";
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
  mapBackgroundUrl: string;
  modeAssetId: string;
  gameVariantCategory: number;
  outcome: NormalizedMatchOutcome;
  score: string;
  killsDeathsAssistsKda?: string;
  damageDealtTakenRatio?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  damageDealt?: number;
  damageTaken?: number;
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
  mapBackgroundUrl: string;
  modeAssetId: string;
  gameVariantCategory: number;
  outcome: NormalizedMatchOutcome;
  score: string;
  killsDeathsAssistsKda: string;
  damageDealtTakenRatio: string;
  isMatchmaking: boolean;
}

export interface SeriesPlayer {
  discordId: string | null;
  discordName: string | null;
  gamertag: string | null;
  xboxId: string | null;
  currentRank?: number | null | undefined;
  currentRankTier?: string | null | undefined;
  currentRankSubTier?: number | null | undefined;
  currentRankMeasurementMatchesRemaining?: number | null | undefined;
  currentRankInitialMeasurementMatches?: number | null | undefined;
  allTimePeakRank?: number | null | undefined;
  esra?: number | null | undefined;
  lastRankedGamePlayed?: string | null | undefined;
}

export interface SeriesTeam {
  id: number;
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
  matchBackgroundUrls: string[];
  score: string;
  killsDeathsAssistsKda: string;
  damageDealtTakenRatio: string;
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

export interface StatsHighlightItem {
  label: string;
  value: string;
  rankIcon?: {
    rankTier: string | null;
    subTier: number | null;
    measurementMatchesRemaining: number | null;
    initialMeasurementMatches: number | null;
  };
}

export interface PreSeriesPlayerInfo {
  currentRank: number | null;
  currentRankTier: string | null;
  currentRankSubTier: number | null;
  currentRankMeasurementMatchesRemaining: number | null;
  currentRankInitialMeasurementMatches: number | null;
  allTimePeakRank: number | null;
  esra: number | null;
  lastRankedGamePlayed: string | null;
}

export interface IndividualTrackerInternalState extends IndividualTrackerState {
  searchStartTime: string;
  lastMatchDiscoveredAt: string | undefined;
  lastSuccessfulFetch?: string;
  lastSeenMatchId?: string;
  checkCount: number;
  matchIds: string[];
  discoveredMatches: Record<string, IndividualTrackerMatchSummary>;
  selectedMatchIds: string[];
  accumulatedPlayerTotals?: AccumulatedPlayerTotals;
  accumulatedMatchIds?: string[];
  preSeriesPlayerInfo?: PreSeriesPlayerInfo;
  preSeriesPlayerInfoLatestMatchId?: string | null;
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

export interface IndividualTrackerRefreshResponse {
  success: true;
}

export interface IndividualTrackerStatusResponse {
  state: IndividualTrackerState | null;
}

export interface ActiveSeriesContext {
  title: string;
  subtitle: string | null;
  guildIconUrl: string | null;
  startedAt?: string;
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
  lastSuccessfulFetch?: string;
  hasActiveSeries: boolean;
  hasRecentCompletedSeries: boolean;
  activeSeriesContext?: ActiveSeriesContext;
  statsHighlights?: StatsHighlightItem[];
  preSeriesPlayerInfo?: PreSeriesPlayerInfo;
}

export interface IndividualTrackerViewStateResponse {
  state: IndividualTrackerViewState | null;
}
