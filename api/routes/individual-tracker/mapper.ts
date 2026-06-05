import type { TrackerProfile } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type { Tracker, TrackerState } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerProfilesRow } from "../../services/database/types/individual_tracker_profiles";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";
import type {
  IndividualTrackerState,
  IndividualTrackerViewState,
  IndividualTrackerViewStateResponse,
} from "../../durable-objects/individual-tracker/types";

export async function fetchTrackerDoViewState(
  env: Env,
  userId: string,
  trackerId: string,
  topBarStatSlots?: readonly string[],
): Promise<IndividualTrackerViewState | null> {
  const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`);
  const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);
  const url = new URL("http://do/view-state");
  if (topBarStatSlots != null && topBarStatSlots.length > 0) {
    url.searchParams.set("topBarStatSlots", JSON.stringify(topBarStatSlots));
  }
  const response = await stub.fetch(url.toString(), { method: "GET" });
  const result = await response.json<IndividualTrackerViewStateResponse>();
  return result.state;
}

export function computeAccumulated(matches: readonly { outcome: string }[]): {
  total: number;
  wins: number;
  losses: number;
  ties: number;
} {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const match of matches) {
    if (match.outcome === "Win") {
      wins++;
    } else if (match.outcome === "Loss") {
      losses++;
    } else if (match.outcome === "Tie") {
      ties++;
    }
  }
  return { total: matches.length, wins, losses, ties };
}

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
  streamerSettings?: StreamerViewSettings,
): TrackerViewState {
  return {
    trackerId: row.TrackerId,
    gamertag: row.Gamertag,
    status: row.Status,
    isLive: row.IsLive === 1,
    ...(streamerSettings !== undefined ? { streamerSettings } : {}),
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
    series:
      doState == null
        ? []
        : doState.series.map((group) => ({
            id: group.id,
            matchIds: group.matchIds,
            score: group.score,
            title: group.title,
            subtitle: group.subtitle,
          })),
    lastUpdateTime: doState == null ? "" : doState.lastUpdateTime,
    lastMatchDiscoveredAt: doState == null ? null : doState.lastMatchDiscoveredAt,
    ...(doState?.topBarStats != null ? { topBarStats: [...doState.topBarStats] } : {}),
  };
}
