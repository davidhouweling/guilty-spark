import type { MatchStats, PlaylistCsrContainer } from "halo-infinite-api";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { computeStatsHighlightItems } from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { PlayerEsraData } from "../../services/halo/types";
import type { IndividualTrackerInternalState, IndividualTrackerMatchSummary, StatsHighlightItem } from "./types";

export function getActiveMatchIds(state: IndividualTrackerInternalState): Set<string> {
  return new Set(state.selectedMatchIds);
}

export function accumulatePlayerStats(state: IndividualTrackerInternalState, matchStats: MatchStats): boolean {
  const trackedXuid = state.xuid;
  const player = matchStats.Players.find((p) => getPlayerXuid(p) === trackedXuid);
  if (player == null) {
    return false;
  }

  const playerStats = player.PlayerTeamStats[0]?.Stats.CoreStats;
  if (playerStats == null) {
    return false;
  }

  const totals = {
    kills: 0,
    deaths: 0,
    assists: 0,
    headshotKills: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0,
    damageTaken: 0,
    totalLifeSeconds: 0,
    totalSpawns: 0,
    totalLifeSpawns: 0,
    ...state.accumulatedPlayerTotals,
  };

  totals.kills += playerStats.Kills;
  totals.deaths += playerStats.Deaths;
  totals.assists += playerStats.Assists;
  totals.headshotKills += playerStats.HeadshotKills;
  totals.shotsFired += playerStats.ShotsFired;
  totals.shotsHit += playerStats.ShotsHit;
  totals.damageDealt += playerStats.DamageDealt;
  totals.damageTaken += playerStats.DamageTaken;
  totals.totalSpawns += playerStats.Spawns;
  try {
    totals.totalLifeSeconds += getDurationInSeconds(playerStats.AverageLifeDuration) * playerStats.Spawns;
    totals.totalLifeSpawns += playerStats.Spawns;
  } catch {
    // malformed AverageLifeDuration — skip life-seconds for this match
  }

  state.accumulatedPlayerTotals = totals;
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
