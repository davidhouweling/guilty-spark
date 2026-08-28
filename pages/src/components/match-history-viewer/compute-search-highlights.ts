import type { PlaylistCsrContainer } from "halo-infinite-api";
import { buildTeamRosterSignature } from "@guilty-spark/shared/halo/match-enrichment";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  accumulateMatchStatsForPlayer,
  computeStatsHighlightItems,
} from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type {
  StatsHighlightAccumulatedTotals,
  StatsHighlightItem,
  StatsHighlightMatchSummary,
} from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { SearchEsra } from "@guilty-spark/shared/contracts/individual-tracker/search-esra";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";

// Computes stats highlights from whatever match history entries are currently loaded on the
// search page (growing as "Load more" is clicked), independent of the rank/ESRA values which the
// caller resolves once per gamertag and passes through unchanged.
export function computeSearchStatsHighlights(
  entries: readonly TrackerMatchHistoryEntry[],
  xuid: string,
  statsHighlightSlots: readonly IndividualStatsHighlightOption[],
  csrContainer: PlaylistCsrContainer | null | undefined,
  esra: SearchEsra | null | undefined,
): readonly StatsHighlightItem[] {
  const matches: StatsHighlightMatchSummary[] = entries.map((entry) => ({
    matchId: entry.matchId,
    isMatchmaking: entry.isMatchmaking,
    teamRosterSignature: entry.rawMatchStats != null ? buildTeamRosterSignature(entry.rawMatchStats) : null,
    outcome: entry.outcome,
    startTime: entry.startTimeIso ?? entry.startTime,
  }));

  let totals: StatsHighlightAccumulatedTotals | undefined;
  for (const entry of entries) {
    if (entry.rawMatchStats == null) {
      continue;
    }
    totals = accumulateMatchStatsForPlayer(totals, entry.rawMatchStats, xuid) ?? totals;
  }

  return computeStatsHighlightItems({ matches, totals }, statsHighlightSlots, csrContainer, esra);
}
