import type { PlaylistCsrContainer } from "halo-infinite-api";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { computeStatsHighlightItems } from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { StatsHighlightItem } from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { SearchEsra } from "@guilty-spark/shared/contracts/individual-tracker/search-esra";
import type { PreparedMatchHistoryEntry } from "../../services/individual-tracker/condensed-match-history-types";
import { prepareCondensedSearchHighlights } from "./prepare-condensed-search-highlights";

// Computes stats highlights from whatever match history entries are currently loaded on the
// search page (growing as "Load more" is clicked), independent of the rank/ESRA values which the
// caller resolves once per gamertag and passes through unchanged.
export function computeSearchStatsHighlights(
  entries: readonly PreparedMatchHistoryEntry[],
  statsHighlightSlots: readonly IndividualStatsHighlightOption[],
  csrContainer: PlaylistCsrContainer | null | undefined,
  esra: SearchEsra | null | undefined,
): readonly StatsHighlightItem[] {
  return computeStatsHighlightItems(prepareCondensedSearchHighlights(entries), statsHighlightSlots, csrContainer, esra);
}
