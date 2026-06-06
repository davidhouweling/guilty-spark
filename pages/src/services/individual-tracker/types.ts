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
}
