import type { TrackerProfile } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type { Tracker, TrackerSanitizedState } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { IndividualTrackerStateSanitized } from "../../durable-objects/individual-tracker/types";
import type { IndividualTrackerProfilesRow } from "../../services/database/types/individual_tracker_profiles";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";

export function toTrackerProfile(row: IndividualTrackerProfilesRow): TrackerProfile {
  return {
    profileId: row.ProfileId,
    activeIdentityId: row.ActiveIdentityId,
    name: row.Name,
  };
}

function toSanitizedState(state: IndividualTrackerStateSanitized): TrackerSanitizedState {
  return {
    userId: state.userId,
    trackerId: state.trackerId,
    xuid: state.xuid,
    gamertag: state.gamertag,
    status: state.status,
    isPaused: state.isPaused,
    startTime: state.startTime,
    lastUpdateTime: state.lastUpdateTime,
    idleTimeoutHours: state.idleTimeoutHours,
  };
}

export function toTracker(row: IndividualTrackersRow, state: IndividualTrackerStateSanitized | null): Tracker {
  return {
    trackerId: row.TrackerId,
    gamertag: row.Gamertag,
    xuid: row.Xuid,
    status: row.Status,
    isLive: row.IsLive === 1,
    state: state == null ? null : toSanitizedState(state),
  };
}
