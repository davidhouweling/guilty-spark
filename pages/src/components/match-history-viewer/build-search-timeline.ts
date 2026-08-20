import type { TrackerMatchSummary, TrackerSeriesGroup } from "@guilty-spark/shared/contracts/individual-tracker/view";
import {
  analyzeMatchGroupings,
  buildMatchScore,
  buildTeamRosterSignature,
  computeSeriesSummaryStats,
  computeTrackedPlayerSummaryStats,
  UNKNOWN_DAMAGE_RATIO_DISPLAY,
  UNKNOWN_KDA_DISPLAY,
} from "@guilty-spark/shared/halo/match-enrichment";
import { getDefaultSeriesGroupSubtitle } from "@guilty-spark/shared/individual-tracker/series-grouping";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";

const SEARCH_SERIES_TITLE = "Series";

export interface SearchTimelineData {
  readonly matches: readonly TrackerMatchSummary[];
  readonly series: readonly TrackerSeriesGroup[];
}

function toTrackerMatchSummary(entry: TrackerMatchHistoryEntry, xuid: string): TrackerMatchSummary {
  const { rawMatchStats } = entry;
  const summaryStats =
    rawMatchStats != null
      ? computeTrackedPlayerSummaryStats(rawMatchStats, xuid)
      : { killsDeathsAssistsKda: UNKNOWN_KDA_DISPLAY, damageDealtTakenRatio: UNKNOWN_DAMAGE_RATIO_DISPLAY };

  return {
    matchId: entry.matchId,
    startTime: entry.startTimeIso ?? entry.startTime,
    endTime: entry.endTimeIso ?? entry.endTime,
    mapAssetId: entry.mapAssetId,
    mapVersionId: entry.mapVersionId,
    mapName: entry.mapName,
    modeAssetId: entry.modeAssetId,
    gameVariantCategory: entry.gameVariantCategory,
    mapBackgroundUrl: entry.mapThumbnailUrl,
    outcome: entry.outcome,
    score: rawMatchStats != null ? buildMatchScore(rawMatchStats) : "-",
    teamCount: rawMatchStats?.Teams.length ?? 0,
    killsDeathsAssistsKda: summaryStats.killsDeathsAssistsKda,
    damageDealtTakenRatio: summaryStats.damageDealtTakenRatio,
    isMatchmaking: entry.isMatchmaking,
    ...(entry.matchmakingPlaylist != null ? { matchmakingPlaylist: entry.matchmakingPlaylist } : {}),
  };
}

function toTrackerSeriesGroup(
  memberEntries: readonly TrackerMatchHistoryEntry[],
  memberSummaries: readonly TrackerMatchSummary[],
  xuid: string,
): TrackerSeriesGroup {
  const [anchor] = memberEntries;
  const wins = memberEntries.filter((entry) => entry.outcome === "Win").length;
  const losses = memberEntries.filter((entry) => entry.outcome === "Loss").length;
  const seriesStats = computeSeriesSummaryStats(
    memberEntries.map((entry) => {
      const stats = entry.rawMatchStats != null ? computeTrackedPlayerSummaryStats(entry.rawMatchStats, xuid) : null;
      return {
        kills: stats?.kills,
        deaths: stats?.deaths,
        assists: stats?.assists,
        damageDealt: stats?.damageDealt,
        damageTaken: stats?.damageTaken,
      };
    }),
  );

  return {
    id: anchor.matchId,
    matchIds: memberEntries.map((entry) => entry.matchId),
    matchBackgroundUrls: memberEntries.map((entry) => entry.mapThumbnailUrl),
    score: `${wins.toString()}:${losses.toString()}`,
    killsDeathsAssistsKda: seriesStats.killsDeathsAssistsKda,
    damageDealtTakenRatio: seriesStats.damageDealtTakenRatio,
    title: SEARCH_SERIES_TITLE,
    subtitle: getDefaultSeriesGroupSubtitle(
      memberSummaries.map((summary) => ({
        startTime: summary.startTime,
        mapAssetId: summary.mapAssetId,
        mapVersionId: summary.mapVersionId,
        gameVariantCategory: summary.gameVariantCategory,
        outcome: summary.outcome,
      })),
    ),
  };
}

// Builds the same TrackerMatchSummary/TrackerSeriesGroup shapes the tracker Durable Object
// produces, but from a plain, newest-first list of search-result match history entries — so the
// result can be fed into the existing buildViewerRenderModel/IndividualTrackerViewer unchanged.
export function buildSearchTimelineData(
  entries: readonly TrackerMatchHistoryEntry[],
  xuid: string,
): SearchTimelineData {
  const matches = entries.map((entry) => toTrackerMatchSummary(entry, xuid));

  const groupings = analyzeMatchGroupings(
    entries.map((entry) => ({
      matchId: entry.matchId,
      isMatchmaking: entry.isMatchmaking,
      teamRosterSignature: entry.rawMatchStats != null ? buildTeamRosterSignature(entry.rawMatchStats) : null,
    })),
  );

  const entriesByMatchId = new Map(entries.map((entry) => [entry.matchId, entry]));
  const summariesByMatchId = new Map(matches.map((summary) => [summary.matchId, summary]));

  const series = groupings.map((matchIds) => {
    const memberEntries = matchIds
      .map((matchId) => entriesByMatchId.get(matchId))
      .filter((entry): entry is TrackerMatchHistoryEntry => entry != null);
    const memberSummaries = matchIds
      .map((matchId) => summariesByMatchId.get(matchId))
      .filter((summary): summary is TrackerMatchSummary => summary != null);
    return toTrackerSeriesGroup(memberEntries, memberSummaries, xuid);
  });

  return { matches, series };
}
