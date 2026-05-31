export type IndividualTrackerStatus = "active" | "paused" | "stopped";

export interface IndividualTrackersRow {
  TrackerId: string;
  UserId: string;
  Gamertag: string;
  Xuid: string;
  Status: IndividualTrackerStatus;
  IsLive: 0 | 1;
  CreatedAt: number;
  UpdatedAt: number;
}
