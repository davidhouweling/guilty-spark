import type {
  IndividualTrackerState,
  IndividualTrackerStateMessage,
} from "@guilty-spark/shared/individual-tracker/types";

export type { IndividualTrackerState, IndividualTrackerStateMessage };

// ─── Control plane requests / responses (owner only) ─────────────────────────

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

// ─── WebSocket viewer ───────────────────────────────────────────────────────

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

// ─── Service interface ───────────────────────────────────────────────────────

export interface IndividualLiveTrackerService {
  startTracker(opts: StartTrackerRequest): Promise<StartTrackerResponse>;
  stopTracker(trackerId: string): Promise<StopTrackerResponse>;
  searchGamertag(query: string): Promise<TrackerSearchResult | null>;
  getRecentMatches(xuid: string, start: number, count: number): Promise<readonly TrackerRecentMatch[]>;
  addMatchToTracker(trackerId: string, matchId: string): Promise<void>;
  getTrackers(userId: string): Promise<TrackerListResponse>;
  connectToTracker(userId: string, trackerId: string): IndividualTrackerConnection;
  connectToActiveTracker(userId: string): IndividualTrackerConnection;
  getActiveTrackerState(userId: string): Promise<TrackerStatusResponse>;
}
