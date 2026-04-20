import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";

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
  addGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse>;
  removeGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse>;
  reorderGames(request: IndividualTrackerReorderGamesRequest): Promise<IndividualTrackerGamesResponse>;
  startTracker(opts: StartTrackerRequest): Promise<StartTrackerResponse>;
  stopTracker(trackerId: string): Promise<StopTrackerResponse>;
  pauseTracker(trackerId: string): Promise<PauseTrackerResponse>;
  resumeTracker(trackerId: string): Promise<ResumeTrackerResponse>;
  selectLiveTracker(trackerId: string): Promise<void>;
  deleteTracker(trackerId: string): Promise<void>;
  searchGamertag(query: string): Promise<TrackerSearchResult | null>;
  getRecentMatches(xuid: string, start: number, count: number): Promise<readonly TrackerRecentMatch[]>;
  addMatchToTracker(trackerId: string, matchId: string): Promise<void>;
  getTrackers(userId: string): Promise<TrackerListResponse>;
  connectToTracker(userId: string, trackerId: string): IndividualTrackerConnection;
  connectToActiveTracker(userId: string): IndividualTrackerConnection;
  getActiveTrackerState(userId: string): Promise<TrackerStatusResponse>;
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
}

export interface TrackerRecentMatch {
  readonly matchId: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly outcome: string | null;
  readonly mapAssetId: string | null;
  readonly modeAssetId: string | null;
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

export interface TrackerStatusResponse {
  activeTracker: IndividualTrackerState | null;
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

