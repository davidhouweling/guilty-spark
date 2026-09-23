export type IndividualTrackerStatus = "active" | "paused" | "stopped";
export type IndividualTrackerType = "personal" | "series";

export interface IndividualTrackersRow {
  TrackerId: string;
  UserId: string;
  Gamertag: string;
  Xuid: string;
  Status: IndividualTrackerStatus;
  IsLive: 0 | 1;
  TrackerType: IndividualTrackerType;
  SourceGuildId: string | null;
  SourceQueueNumber: number | null;
  CreatedAt: number;
  UpdatedAt: number;
}
