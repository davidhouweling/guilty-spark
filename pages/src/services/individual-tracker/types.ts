import type {
  TrackerProfileResponse,
  UpdateTrackerProfileRequest,
} from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type {
  StartTrackerRequest,
  TrackerResponse,
  TrackersResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { GameVariantCategory, MatchStats } from "halo-infinite-api";

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

export interface IndividualTrackerService {
  getProfile(): Promise<TrackerProfileResponse>;
  updateProfile(req: UpdateTrackerProfileRequest): Promise<TrackerProfileResponse>;
  listTrackers(): Promise<TrackersResponse>;
  startTracker(req: StartTrackerRequest): Promise<TrackerResponse>;
  stopTracker(trackerId: string): Promise<void>;
  pauseTracker(trackerId: string): Promise<TrackerResponse>;
  resumeTracker(trackerId: string): Promise<TrackerResponse>;
  selectActive(trackerId: string): Promise<TrackerResponse>;
  getTrackerStatus(trackerId: string): Promise<TrackerResponse>;
  searchGamertag(query: string): Promise<TrackerSearchResult | null>;
  getMatchHistory(xuid: string, start: number, count: number): Promise<TrackerMatchHistoryResponse>;
  syncMatchesToTracker(request: TrackerSyncMatchesRequest): Promise<void>;
}
