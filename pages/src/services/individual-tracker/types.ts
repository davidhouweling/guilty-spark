import type {
  TrackerProfileResponse,
  UpdateTrackerProfileRequest,
} from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type {
  StartTrackerRequest,
  TrackerResponse,
  TrackersResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";

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
