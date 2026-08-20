import type { MatchStats, PlaylistCsrContainer } from "halo-infinite-api";
import {
  accumulateMatchStatsForPlayer,
  computeStatsHighlightItems,
} from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { StatsHighlightItem } from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { PlayerEsraData } from "../../services/halo/types";
import type { IndividualTrackerInternalState, IndividualTrackerMatchSummary } from "./types";

export function getActiveMatchIds(state: IndividualTrackerInternalState): Set<string> {
  return new Set(state.selectedMatchIds);
}

export function accumulatePlayerStats(state: IndividualTrackerInternalState, matchStats: MatchStats): boolean {
  const next = accumulateMatchStatsForPlayer(state.accumulatedPlayerTotals, matchStats, state.xuid);
  if (next == null) {
    return false;
  }

  state.accumulatedPlayerTotals = next;
  return true;
}

export function computeStatsHighlights(
  state: IndividualTrackerInternalState,
  statsHighlightSlots: readonly IndividualStatsHighlightOption[],
  csrContainer?: PlaylistCsrContainer | null,
  esraData?: PlayerEsraData | null,
): readonly StatsHighlightItem[] {
  const activeIds = getActiveMatchIds(state);
  const matches = state.matchIds
    .filter((id) => activeIds.has(id))
    .map((id) => state.discoveredMatches[id])
    .filter((s): s is IndividualTrackerMatchSummary => s != null);

  return computeStatsHighlightItems(
    { matches, totals: state.accumulatedPlayerTotals },
    statsHighlightSlots,
    csrContainer,
    esraData,
  );
}
