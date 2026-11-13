import { compareAsc } from "date-fns";
import type { TrackerMatchSummary, TrackerSeriesGroup } from "@guilty-spark/shared/contracts/individual-tracker/view";
import {
  analyzeMatchGroupings,
  computeSeriesSummaryStats,
  UNKNOWN_DAMAGE_RATIO_DISPLAY,
  UNKNOWN_KDA_DISPLAY,
} from "@guilty-spark/shared/halo/match-enrichment";
import {
  buildSeriesGroupKey,
  getDefaultSeriesGroupSubtitle,
  getDefaultSeriesGroupTitle,
} from "@guilty-spark/shared/individual-tracker/series-grouping";
import type { PreparedMatchHistoryEntry } from "../../services/individual-tracker/condensed-match-history-types";

const UNKNOWN_TRACKED_PLAYER_STATS = {
  killsDeathsAssistsKda: UNKNOWN_KDA_DISPLAY,
  damageDealtTakenRatio: UNKNOWN_DAMAGE_RATIO_DISPLAY,
};

export interface SearchTimelineData {
  readonly matches: readonly TrackerMatchSummary[];
  readonly series: readonly TrackerSeriesGroup[];
}

function toTrackerMatchSummary(entry: PreparedMatchHistoryEntry): TrackerMatchSummary {
  const summaryStats =
    entry.trackedPlayerSummary == null
      ? UNKNOWN_TRACKED_PLAYER_STATS
      : computeSeriesSummaryStats([entry.trackedPlayerSummary]);

  return {
    matchId: entry.matchId,
    startTime: entry.startTimeIso,
    endTime: entry.endTimeIso,
    mapAssetId: entry.mapAssetId,
    mapVersionId: entry.mapVersionId,
    mapName: entry.mapName,
    modeAssetId: entry.modeAssetId,
    gameVariantCategory: entry.gameVariantCategory,
    mapBackgroundUrl: entry.mapThumbnailUrl,
    outcome: entry.outcome,
    score: entry.scoreDisplay ?? "-",
    teamCount: entry.teamCount ?? 0,
    killsDeathsAssistsKda: summaryStats.killsDeathsAssistsKda,
    damageDealtTakenRatio: summaryStats.damageDealtTakenRatio,
    isMatchmaking: entry.isMatchmaking,
    ...(entry.matchmakingPlaylist != null ? { matchmakingPlaylist: entry.matchmakingPlaylist } : {}),
  };
}

function toTrackerSeriesGroup(
  memberEntries: readonly PreparedMatchHistoryEntry[],
  memberSummaries: readonly TrackerMatchSummary[],
): TrackerSeriesGroup {
  const wins = memberEntries.filter((entry) => entry.outcome === "Win").length;
  const losses = memberEntries.filter((entry) => entry.outcome === "Loss").length;
  const seriesStats = computeSeriesSummaryStats(memberEntries.map((entry) => entry.trackedPlayerSummary ?? {}));

  const matchIds = memberEntries.map((entry) => entry.matchId);

  return {
    // A stable identity derived from the full member set (matching the tracker DO's own series id
    // scheme) rather than the first matchId, so pagination re-sorting the accumulated match list
    // doesn't orphan an already-expanded series under a new key purely because array order shifted.
    id: `series:${buildSeriesGroupKey(matchIds)}`,
    matchIds,
    matchBackgroundUrls: memberEntries.map((entry) => entry.mapThumbnailUrl),
    score: `${wins.toString()}:${losses.toString()}`,
    killsDeathsAssistsKda: seriesStats.killsDeathsAssistsKda,
    damageDealtTakenRatio: seriesStats.damageDealtTakenRatio,
    title: getDefaultSeriesGroupTitle(),
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
export function buildSearchTimelineData(loadedEntries: readonly PreparedMatchHistoryEntry[]): SearchTimelineData {
  // Grouping/scoring is computed oldest-first (matching the tracker DO's own convention, so
  // computeSeriesSummaryStats/analyzeMatchGroupings/getDefaultSeriesGroupSubtitle behave
  // identically, and each series' own matchIds stay oldest-to-newest for correct in-series game
  // numbering) before the final result is reversed back to newest-first below.
  const seen = new Set<string>();
  const entries = loadedEntries
    .filter((entry) => {
      if (seen.has(entry.matchId)) {
        return false;
      }
      seen.add(entry.matchId);
      return true;
    })
    .sort((a, b) => compareAsc(new Date(a.startTimeIso), new Date(b.startTimeIso)));
  const matches = entries.map(toTrackerMatchSummary);

  const groupings = analyzeMatchGroupings(
    entries.map((entry) => ({
      matchId: entry.matchId,
      isMatchmaking: entry.isMatchmaking,
      teamRosterSignature: entry.teamRosterSignature,
    })),
  );

  const entriesByMatchId = new Map(entries.map((entry) => [entry.matchId, entry]));
  const summariesByMatchId = new Map(matches.map((summary) => [summary.matchId, summary]));

  const series = groupings.map((matchIds) => {
    const memberEntries = matchIds
      .map((matchId) => entriesByMatchId.get(matchId))
      .filter((entry): entry is PreparedMatchHistoryEntry => entry != null);
    const memberSummaries = matchIds
      .map((matchId) => summariesByMatchId.get(matchId))
      .filter((summary): summary is TrackerMatchSummary => summary != null);
    return toTrackerSeriesGroup(memberEntries, memberSummaries);
  });

  // buildViewerRenderModel only cares that each series' anchor matchId (still its oldest member)
  // appears somewhere in `matches` — reversing the outer order here doesn't affect where a series
  // renders, since its members are always contiguous. Newest-first means "Load more" appends older
  // matches to the END of the list, right next to the button that fetched them, instead of
  // prepending them above the user's current scroll position where they'd go unnoticed.
  return { matches: [...matches].reverse(), series: [...series].reverse() };
}
