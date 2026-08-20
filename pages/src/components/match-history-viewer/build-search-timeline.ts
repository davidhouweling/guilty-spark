import { compareAsc } from "date-fns";
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
import type { TrackedPlayerSummaryStats } from "@guilty-spark/shared/halo/match-enrichment";
import {
  buildSeriesGroupKey,
  getDefaultSeriesGroupSubtitle,
  getDefaultSeriesGroupTitle,
} from "@guilty-spark/shared/individual-tracker/series-grouping";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";

const UNKNOWN_TRACKED_PLAYER_STATS: TrackedPlayerSummaryStats = {
  killsDeathsAssistsKda: UNKNOWN_KDA_DISPLAY,
  damageDealtTakenRatio: UNKNOWN_DAMAGE_RATIO_DISPLAY,
};

export interface SearchTimelineData {
  readonly matches: readonly TrackerMatchSummary[];
  readonly series: readonly TrackerSeriesGroup[];
}

function matchEntryStartTime(entry: TrackerMatchHistoryEntry): string {
  return entry.startTimeIso ?? entry.startTime;
}

// computeTrackedPlayerSummaryStats scans every player in a match's raw stats blob, so it's
// computed once per match here and threaded through to both the per-match summary and the
// series aggregate below, instead of being recomputed for each place that needs it.
function computeStatsByMatchId(
  entries: readonly TrackerMatchHistoryEntry[],
  xuid: string,
): ReadonlyMap<string, TrackedPlayerSummaryStats | null> {
  return new Map(
    entries.map((entry) => [
      entry.matchId,
      entry.rawMatchStats != null ? computeTrackedPlayerSummaryStats(entry.rawMatchStats, xuid) : null,
    ]),
  );
}

function toTrackerMatchSummary(
  entry: TrackerMatchHistoryEntry,
  stats: TrackedPlayerSummaryStats | null,
): TrackerMatchSummary {
  const { rawMatchStats } = entry;
  const summaryStats = stats ?? UNKNOWN_TRACKED_PLAYER_STATS;

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
  statsByMatchId: ReadonlyMap<string, TrackedPlayerSummaryStats | null>,
): TrackerSeriesGroup {
  const wins = memberEntries.filter((entry) => entry.outcome === "Win").length;
  const losses = memberEntries.filter((entry) => entry.outcome === "Loss").length;
  const seriesStats = computeSeriesSummaryStats(
    memberEntries.map((entry) => {
      const stats = statsByMatchId.get(entry.matchId);
      return {
        kills: stats?.kills,
        deaths: stats?.deaths,
        assists: stats?.assists,
        damageDealt: stats?.damageDealt,
        damageTaken: stats?.damageTaken,
      };
    }),
  );

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
export function buildSearchTimelineData(
  rawEntries: readonly TrackerMatchHistoryEntry[],
  xuid: string,
): SearchTimelineData {
  // getMatchHistory() returns matches newest-first, but the tracker DO (and therefore
  // buildViewerRenderModel, which this feeds) expects matches/series oldest-first — it anchors
  // each series on its first matchId and walks the timeline in that same order.
  const entries = [...rawEntries].sort((a, b) =>
    compareAsc(new Date(matchEntryStartTime(a)), new Date(matchEntryStartTime(b))),
  );
  const statsByMatchId = computeStatsByMatchId(entries, xuid);
  const matches = entries.map((entry) => toTrackerMatchSummary(entry, statsByMatchId.get(entry.matchId) ?? null));

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
    return toTrackerSeriesGroup(memberEntries, memberSummaries, statsByMatchId);
  });

  return { matches, series };
}
