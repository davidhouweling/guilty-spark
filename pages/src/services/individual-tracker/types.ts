import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type {
  StreamerViewEffectiveDefaults,
  StreamerViewLayoutOptions,
  StreamerViewStyleFlags,
  StreamerViewVisibleSections,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { GameVariantCategory, MatchStats } from "halo-infinite-api";

export interface IndividualTrackerProfile {
  ProfileId: string;
  UserId: string;
  ActiveIdentityId: string | null;
  Name: string;
  CreatedAt: number;
  UpdatedAt: number;
}

export interface IndividualTrackerGame {
  ProfileId: string;
  MatchId: string;
  Position: number;
  Included: 0 | 1;
  AnnotationsJson: string;
  CreatedAt: number;
  UpdatedAt: number;
}

export interface IndividualTrackerProfileResponse {
  profile: IndividualTrackerProfile | null;
  games: IndividualTrackerGame[];
}

export interface IndividualTrackerCreateProfileRequest {
  name?: string;
  activeIdentityId?: string | null;
}

export interface IndividualTrackerCreateProfileResponse {
  profile: IndividualTrackerProfile;
}

export interface IndividualTrackerUpdateProfileRequest {
  profileId: string;
  name?: string;
  activeIdentityId?: string | null;
}

export interface IndividualTrackerUpdateProfileResponse {
  profile: IndividualTrackerProfile;
}

export interface IndividualTrackerStreamerViewSettings {
  readonly profileId: string;
  readonly layoutOptions: StreamerViewLayoutOptions;
  readonly visibleSections: StreamerViewVisibleSections;
  readonly styleFlags: StreamerViewStyleFlags;
  readonly effectiveDefaults: StreamerViewEffectiveDefaults;
  readonly updatedAt: number | null;
}

export interface IndividualTrackerUpdateStreamerViewSettingsRequest {
  readonly profileId: string;
  readonly layoutOptions?: StreamerViewLayoutOptions;
  readonly visibleSections?: StreamerViewVisibleSections;
  readonly styleFlags?: StreamerViewStyleFlags;
}

export interface IndividualTrackerMutateGamesRequest {
  profileId: string;
  matchId: string;
}

export interface IndividualTrackerReorderGamesRequest {
  profileId: string;
  orderedMatchIds: string[];
}

export interface IndividualTrackerGamesResponse {
  games: IndividualTrackerGame[];
}

export interface IndividualTrackerService {
  getProfile(): Promise<IndividualTrackerProfileResponse>;
  createProfile(request: IndividualTrackerCreateProfileRequest): Promise<IndividualTrackerCreateProfileResponse>;
  updateProfile(request: IndividualTrackerUpdateProfileRequest): Promise<IndividualTrackerUpdateProfileResponse>;
  getStreamerViewSettings(profileId: string): Promise<IndividualTrackerStreamerViewSettings>;
  updateStreamerViewSettings(
    request: IndividualTrackerUpdateStreamerViewSettingsRequest,
  ): Promise<IndividualTrackerStreamerViewSettings>;
  addGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse>;
  removeGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse>;
  reorderGames(request: IndividualTrackerReorderGamesRequest): Promise<IndividualTrackerGamesResponse>;
  startTracker(opts: StartTrackerRequest): Promise<StartTrackerResponse>;
  stopTracker(trackerId: string): Promise<StopTrackerResponse>;
  pauseTracker(trackerId: string): Promise<PauseTrackerResponse>;
  resumeTracker(trackerId: string): Promise<ResumeTrackerResponse>;
  startSeries(request: StartSeriesRequest): Promise<StartSeriesResponse>;
  endSeries(trackerId: string): Promise<EndSeriesResponse>;
  refreshTracker(trackerId: string): Promise<RefreshTrackerResponse>;
  selectLiveTracker(trackerId: string): Promise<void>;
  deleteTracker(trackerId: string): Promise<void>;
  searchGamertag(query: string): Promise<TrackerSearchResult | null>;
  getMatchHistory(xuid: string, start: number, count: number): Promise<TrackerMatchHistoryResponse>;
  getMedalMetadata(matches: readonly MatchStats[]): Promise<MedalMetadata>;
  syncMatchesToTracker(request: TrackerSyncMatchesRequest): Promise<void>;
  updateSeriesGroup(request: TrackerSeriesGroupUpdateRequest): Promise<IndividualTrackerState>;
  addMatchToTracker(trackerId: string, matchId: string): Promise<void>;
  removeMatchFromTracker(trackerId: string, matchId: string): Promise<void>;
  getTrackers(userId: string): Promise<TrackerListResponse>;
  connectToTracker(userId: string, trackerId: string): IndividualTrackerConnection;
  connectToActiveTracker(xuid: string): IndividualTrackerConnection;
  getActiveTrackerView(xuid: string): Promise<ActiveTrackerViewResponse>;
  getActiveTrackerState(xuid: string): Promise<TrackerStatusResponse>;
  getTrackerState(userId: string, trackerId: string): Promise<TrackerStatusResponse>;
}

export type {
  IndividualTrackerState,
  IndividualTrackerStateMessage,
} from "@guilty-spark/shared/individual-tracker/types";

export interface StartTrackerRequest {
  idleTimeoutHours?: number;
  searchStartTime?: string;
  gamertag?: string;
  userMicrosoftAccessToken?: string;
  userMicrosoftRefreshToken?: string;
}

export interface StartTrackerSuccessResponse {
  success: true;
  state: IndividualTrackerState;
}

export interface StartTrackerFailureResponse {
  success: false;
  error: string;
}

export type StartTrackerResponse = StartTrackerSuccessResponse | StartTrackerFailureResponse;

export interface TrackerSearchResult {
  readonly gamertag: string;
  readonly xuid: string;
  readonly rankLabel: string | null;
  readonly csrLabel: string | null;
  readonly currentRankTier: string | null;
  readonly currentRankSubTier: number | null;
  readonly currentRankMeasurementMatchesRemaining: number | null;
  readonly currentRankInitialMeasurementMatches: number | null;
  readonly allTimePeakRankLabel: string | null;
  readonly allTimePeakCsrLabel: string | null;
  readonly allTimePeakRankTier: string | null;
  readonly allTimePeakRankSubTier: number | null;
  readonly seasonPeakCsrLabel: string | null;
  readonly seasonPeakRankTier: string | null;
  readonly seasonPeakRankSubTier: number | null;
  readonly matchmadeMatchCount: number | null;
  readonly customMatchCount: number | null;
}

export interface TrackerMatchHistoryEntry {
  readonly matchId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly mapAssetId: string;
  readonly mapVersionId: string;
  readonly modeAssetId: string;
  readonly modeVersionId: string;
  readonly gameVariantCategory: GameVariantCategory;
  readonly startTimeIso?: string | undefined;
  readonly endTimeIso?: string | undefined;
  readonly duration: string;
  readonly mapName: string;
  readonly modeName: string;
  readonly gameType?: string | undefined;
  readonly gameMap?: string | undefined;
  readonly gameTypeAndMap?: string | undefined;
  readonly outcome: "Win" | "Loss" | "Tie" | "DNF" | "Unknown";
  readonly resultString: string;
  readonly isMatchmaking: boolean;
  readonly category: "matchmaking" | "custom" | "local" | "unknown";
  readonly teams: readonly (readonly string[])[];
  readonly rawMatchStats?: MatchStats | null | undefined;
  readonly playerXuidToGametag?: Readonly<Record<string, string>> | undefined;
  readonly mapThumbnailUrl: string;
}

export interface TrackerMatchHistoryResponse {
  readonly matches: readonly TrackerMatchHistoryEntry[];
  readonly suggestedGroupings: readonly (readonly string[])[];
}

export interface TrackerSyncMatchesRequest {
  readonly trackerId: string;
  readonly selectedMatchIds: readonly string[];
  readonly matchGroupings: readonly (readonly string[])[];
  readonly matches: readonly TrackerMatchHistoryEntry[];
}

export interface TrackerSeriesGroupUpdateRequest {
  readonly trackerId: string;
  readonly matchIds: readonly string[];
  readonly titleOverride: string | null;
  readonly subtitleOverride: string | null;
}

export interface StopTrackerSuccessResponse {
  success: true;
  state: IndividualTrackerState;
}

export type StopTrackerResponse = StopTrackerSuccessResponse;

export interface PauseTrackerSuccessResponse {
  success: true;
  state: IndividualTrackerState;
}

export type PauseTrackerResponse = PauseTrackerSuccessResponse;

export interface ResumeTrackerSuccessResponse {
  success: true;
  state: IndividualTrackerState;
}

export type ResumeTrackerResponse = ResumeTrackerSuccessResponse;

export interface StartSeriesTeamRequest {
  readonly name: string;
  readonly members: readonly string[];
}

export interface StartSeriesRequest {
  readonly trackerId: string;
  readonly titleOverride: string | null;
  readonly subtitleOverride: string | null;
  readonly teams: readonly StartSeriesTeamRequest[];
}

export interface StartSeriesSuccessResponse {
  success: true;
  state: IndividualTrackerState;
}

export type StartSeriesResponse = StartSeriesSuccessResponse;

export interface EndSeriesSuccessResponse {
  success: true;
  state: IndividualTrackerState;
}

export type EndSeriesResponse = EndSeriesSuccessResponse;

export interface RefreshTrackerSuccessResponse {
  success: true;
  state: IndividualTrackerState;
}

export interface RefreshTrackerFailureResponse {
  success: false;
  error?: string;
  message?: string;
}

export type RefreshTrackerResponse = RefreshTrackerSuccessResponse | RefreshTrackerFailureResponse;

export interface TrackerStatusResponse {
  activeTracker: IndividualTrackerState | null;
}

export interface ActiveTrackerViewResponse {
  readonly status: "active" | "offline" | "not-found";
  readonly activeTracker: IndividualTrackerState | null;
  readonly streamerView: IndividualTrackerStreamerViewSettings | null;
}

export interface TrackerReference {
  trackerId: string;
  gamertag: string;
  updatedAt: number;
}

export interface TrackerListResponse {
  trackers: readonly TrackerReference[];
  statuses: Record<string, IndividualTrackerState | null>;
}

export type IndividualTrackerConnectionStatus =
  | "connecting"
  | "connected"
  | "stopped"
  | "error"
  | "disconnected"
  | "not_found";

export type IndividualTrackerStatusListener = (status: IndividualTrackerConnectionStatus, detail?: string) => void;

export type IndividualTrackerStateListener = (state: IndividualTrackerState) => void;

export interface IndividualTrackerSubscription {
  unsubscribe(): void;
}

export interface IndividualTrackerConnection {
  subscribe(listener: IndividualTrackerStateListener): IndividualTrackerSubscription;
  subscribeStatus(listener: IndividualTrackerStatusListener): IndividualTrackerSubscription;
  disconnect(): void;
}
