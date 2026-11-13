import type {
  ComputeStatsHighlightsInput,
  StatsHighlightAccumulatedTotals,
} from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { PreparedMatchHistoryEntry } from "../../services/individual-tracker/condensed-match-history-types";

function addContribution(
  totals: StatsHighlightAccumulatedTotals | undefined,
  contribution: NonNullable<PreparedMatchHistoryEntry["highlightContribution"]>,
): StatsHighlightAccumulatedTotals {
  if (totals == null) {
    return { ...contribution };
  }
  return {
    kills: totals.kills + contribution.kills,
    deaths: totals.deaths + contribution.deaths,
    assists: totals.assists + contribution.assists,
    damageDealt: totals.damageDealt + contribution.damageDealt,
    damageTaken: totals.damageTaken + contribution.damageTaken,
    headshotKills: totals.headshotKills + contribution.headshotKills,
    shotsFired: totals.shotsFired + contribution.shotsFired,
    shotsHit: totals.shotsHit + contribution.shotsHit,
    totalLifeSeconds: totals.totalLifeSeconds + contribution.totalLifeSeconds,
    totalSpawns: totals.totalSpawns + contribution.totalSpawns,
    totalLifeSpawns: (totals.totalLifeSpawns ?? 0) + contribution.totalLifeSpawns,
  };
}

export function prepareCondensedSearchHighlights(
  entries: readonly PreparedMatchHistoryEntry[],
): ComputeStatsHighlightsInput {
  const seen = new Set<string>();
  const matches: ComputeStatsHighlightsInput["matches"][number][] = [];
  let totals: StatsHighlightAccumulatedTotals | undefined;

  for (const entry of entries) {
    if (seen.has(entry.matchId)) {
      continue;
    }
    seen.add(entry.matchId);
    matches.push({
      matchId: entry.matchId,
      isMatchmaking: entry.isMatchmaking,
      teamRosterSignature: entry.teamRosterSignature,
      outcome: entry.outcome,
      startTime: entry.startTimeIso,
    });
    if (entry.highlightContribution != null) {
      totals = addContribution(totals, entry.highlightContribution);
    }
  }
  return { matches, totals };
}
