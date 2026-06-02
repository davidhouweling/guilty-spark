import type { TrackerProfile } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type { Tracker, TrackerState } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { IndividualTrackerProfilesRow } from "../../services/database/types/individual_tracker_profiles";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";
import type {
  IndividualTrackerState,
  IndividualTrackerViewState,
} from "../../durable-objects/individual-tracker/types";

export function toTrackerProfile(row: IndividualTrackerProfilesRow): TrackerProfile {
  return {
    profileId: row.ProfileId,
    activeIdentityId: row.ActiveIdentityId,
    name: row.Name,
  };
}

function toTrackerState(state: IndividualTrackerState): TrackerState {
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

export function toTracker(row: IndividualTrackersRow, state: IndividualTrackerState | null): Tracker {
  return {
    trackerId: row.TrackerId,
    gamertag: row.Gamertag,
    xuid: row.Xuid,
    status: row.Status,
    isLive: row.IsLive === 1,
    state: state == null ? null : toTrackerState(state),
  };
}

export function toTrackerView(
  row: IndividualTrackersRow,
  doState: IndividualTrackerViewState | null,
): TrackerViewState {
  return {
    trackerId: row.TrackerId,
    gamertag: row.Gamertag,
    status: row.Status,
    isLive: row.IsLive === 1,
    matches:
      doState == null
        ? []
        : doState.matches.map((match) => ({
            matchId: match.matchId,
            startTime: match.startTime,
            endTime: match.endTime,
            mapAssetId: match.mapAssetId,
            mapVersionId: match.mapVersionId,
            mapName: match.mapName,
            modeAssetId: match.modeAssetId,
            gameVariantCategory: match.gameVariantCategory,
            outcome: match.outcome,
            score: match.score,
          })),
    lastUpdateTime: doState == null ? "" : doState.lastUpdateTime,
    lastMatchDiscoveredAt: doState == null ? null : doState.lastMatchDiscoveredAt,
  };
}
