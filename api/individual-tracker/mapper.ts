import type { TrackerProfile } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type { Tracker, TrackerState } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerDoState } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/lifecycle";
import {
  individualTrackerViewStateContract,
  type IndividualTrackerViewState,
} from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/management";
import type { IndividualTrackerProfilesRow } from "../services/database/types/individual_tracker_profiles";
import type { IndividualTrackersRow } from "../services/database/types/individual_trackers";

export async function fetchTrackerDoViewState(
  env: Env,
  userId: string,
  trackerId: string,
  statsHighlightSlots?: readonly string[],
): Promise<IndividualTrackerViewState | null> {
  const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`);
  const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);
  const url = new URL("http://do/view-state");
  if (statsHighlightSlots != null && statsHighlightSlots.length > 0) {
    url.searchParams.set("statsHighlightSlots", JSON.stringify(statsHighlightSlots));
  }
  const response = await stub.fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`DO view-state request failed with status ${response.status.toString()}`);
  }
  const result = await individualTrackerViewStateContract.fromResponse(response);
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

function toTrackerState(state: IndividualTrackerDoState): TrackerState {
  return {
    userId: state.userId,
    trackerId: state.trackerId,
    xuid: state.xuid,
    gamertag: state.gamertag,
    status: state.status,
    isPaused: state.isPaused,
    startTime: state.startTime,
    lastUpdateTime: state.lastUpdateTime,
    searchStartTime: state.searchStartTime,
    idleTimeoutHours: state.idleTimeoutHours,
    hasActiveSeries: state.hasActiveSeries ?? false,
  };
}

export function toTracker(row: IndividualTrackersRow, state: IndividualTrackerDoState | null): Tracker {
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
            mapBackgroundUrl: match.mapBackgroundUrl,
            modeAssetId: match.modeAssetId,
            gameVariantCategory: match.gameVariantCategory,
            outcome: match.outcome,
            score: match.score,
            killsDeathsAssistsKda: match.killsDeathsAssistsKda,
            damageDealtTakenRatio: match.damageDealtTakenRatio,
            isMatchmaking: match.isMatchmaking,
          })),
    series:
      doState == null
        ? []
        : doState.series.map((group) => ({
            id: group.id,
            matchIds: group.matchIds,
            matchBackgroundUrls: group.matchBackgroundUrls,
            score: group.score,
            title: group.title,
            subtitle: group.subtitle,
            guildIconUrl: group.guildIconUrl,
            teams: group.teams,
          })),
    lastUpdateTime: doState == null ? "" : doState.lastUpdateTime,
    lastMatchDiscoveredAt: doState == null ? null : doState.lastMatchDiscoveredAt,
    hasActiveSeries: doState?.hasActiveSeries ?? false,
    hasRecentCompletedSeries: doState?.hasRecentCompletedSeries ?? false,
    ...(doState?.activeSeriesContext !== undefined ? { activeSeriesContext: doState.activeSeriesContext } : {}),
    ...(doState?.statsHighlights != null ? { statsHighlights: [...doState.statsHighlights] } : {}),
    ...(doState?.preSeriesPlayerInfo != null ? { preSeriesPlayerInfo: doState.preSeriesPlayerInfo } : {}),
  };
}
