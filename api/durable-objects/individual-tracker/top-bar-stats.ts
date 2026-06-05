import { compareAsc } from "date-fns";
import { type MatchStats } from "halo-infinite-api";
import { getDurationInIsoString, getDurationInSeconds, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { analyzeMatchGroupings } from "@guilty-spark/shared/halo/match-enrichment";
import { formatDamageRatio, formatStatValue } from "@guilty-spark/shared/halo/stat-formatting";
import {
  INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS,
  type IndividualTopBarStatOption,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type {
  AccumulatedPlayerTotals,
  IndividualTrackerInternalState,
  IndividualTrackerMatchSummary,
  TopBarStatItem,
} from "./types";

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

  const totals = state.accumulatedPlayerTotals ?? {
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
  } catch {
    // malformed AverageLifeDuration — skip life-seconds for this match
  }

  state.accumulatedPlayerTotals = totals;
  return true;
}

const optionLabelByValue = new Map<IndividualTopBarStatOption, string>(
  INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS.map((d) => [d.value, d.label]),
);

function getTopBarStatLabel(option: IndividualTopBarStatOption): string {
  if (option === "matches-win-loss") {
    return "Won:Loss";
  }
  if (option === "series-win-loss") {
    return "Series Won:Loss";
  }
  return optionLabelByValue.get(option) ?? option;
}

function computeSeriesWonLoss(state: IndividualTrackerInternalState): { won: number; lost: number } {
  const summaries = state.matchIds
    .map((id) => state.discoveredMatches[id])
    .filter((s): s is IndividualTrackerMatchSummary => s != null)
    .sort((a, b) => compareAsc(new Date(a.startTime), new Date(b.startTime)));

  const groupings = analyzeMatchGroupings(
    summaries.map((s) => ({
      matchId: s.matchId,
      isMatchmaking: s.isMatchmaking,
      teamRosterSignature: s.teamRosterSignature,
    })),
  );

  let won = 0;
  let lost = 0;
  for (const matchIds of groupings) {
    let wins = 0;
    let losses = 0;
    for (const matchId of matchIds) {
      const s = state.discoveredMatches[matchId];
      if (s?.outcome === "Win") {
        wins++;
      }
      if (s?.outcome === "Loss") {
        losses++;
      }
    }
    if (wins > losses) {
      won++;
    }
    if (losses > wins) {
      lost++;
    }
  }
  return { won, lost };
}

function computeKdaValue(totals: AccumulatedPlayerTotals): number {
  return totals.deaths === 0 ? totals.kills + totals.assists / 3 : (totals.kills + totals.assists / 3) / totals.deaths;
}

interface TopBarStatContext {
  totals: AccumulatedPlayerTotals | undefined;
  total: number;
  wins: number;
  losses: number;
  matchmaking: number;
  customOrLocal: number;
  state: IndividualTrackerInternalState;
}

function formatTopBarStatOption(option: IndividualTopBarStatOption, ctx: TopBarStatContext): string | null {
  const { totals, total, wins, losses, matchmaking, customOrLocal, state } = ctx;

  switch (option) {
    case "matches-win-loss": {
      return `${wins.toString()}:${losses.toString()}`;
    }
    case "series-win-loss": {
      const series = computeSeriesWonLoss(state);
      return `${series.won.toString()}:${series.lost.toString()}`;
    }
    case "total-games": {
      return total.toString();
    }
    case "matchmaking-games": {
      return matchmaking.toString();
    }
    case "custom-local-games": {
      return customOrLocal.toString();
    }
    case "current-rank":
    case "season-peak":
    case "all-time-peak":
    case "esra": {
      return null;
    }
    case "kills": {
      return totals != null ? formatStatValue(totals.kills) : null;
    }
    case "deaths": {
      return totals != null ? formatStatValue(totals.deaths) : null;
    }
    case "assists": {
      return totals != null ? formatStatValue(totals.assists) : null;
    }
    case "kda": {
      if (totals == null) {
        return null;
      }
      return formatStatValue(computeKdaValue(totals));
    }
    case "headshot-kills": {
      return totals != null ? formatStatValue(totals.headshotKills) : null;
    }
    case "shots-hit": {
      return totals != null ? formatStatValue(totals.shotsHit) : null;
    }
    case "shots-fired": {
      return totals != null ? formatStatValue(totals.shotsFired) : null;
    }
    case "accuracy": {
      if (totals == null || totals.shotsFired === 0) {
        return null;
      }
      return `${formatStatValue((totals.shotsHit / totals.shotsFired) * 100)}%`;
    }
    case "damage-dealt": {
      return totals != null ? formatStatValue(totals.damageDealt) : null;
    }
    case "damage-taken": {
      return totals != null ? formatStatValue(totals.damageTaken) : null;
    }
    case "damage-ratio": {
      return totals != null ? formatDamageRatio(totals.damageDealt, totals.damageTaken) : null;
    }
    case "avg-life-time": {
      if (totals == null || totals.totalSpawns === 0) {
        return null;
      }
      const avgSeconds = totals.totalLifeSeconds / totals.totalSpawns;
      return getReadableDuration(getDurationInIsoString(avgSeconds));
    }
    case "avg-damage-per-life": {
      if (totals == null || totals.totalSpawns === 0) {
        return null;
      }
      return formatDamageRatio(totals.damageDealt, totals.totalSpawns);
    }
    case "kills-deaths-kd": {
      if (totals == null) {
        return null;
      }
      const kdRatio = totals.deaths === 0 ? totals.kills : totals.kills / totals.deaths;
      return `${formatStatValue(totals.kills)}:${formatStatValue(totals.deaths)} (${formatStatValue(kdRatio)})`;
    }
    case "kills-deaths-assists-kda": {
      if (totals == null) {
        return null;
      }
      return `${formatStatValue(totals.kills)}:${formatStatValue(totals.deaths)}:${formatStatValue(totals.assists)} (${formatStatValue(computeKdaValue(totals))})`;
    }
    case "shots-hit-fired-accuracy": {
      if (totals == null || totals.shotsFired === 0) {
        return null;
      }
      const acc = (totals.shotsHit / totals.shotsFired) * 100;
      return `${formatStatValue(totals.shotsHit)}:${formatStatValue(totals.shotsFired)} (${formatStatValue(acc)}%)`;
    }
    case "damage-dealt-taken-ratio": {
      if (totals == null) {
        return null;
      }
      return `${formatStatValue(totals.damageDealt)}:${formatStatValue(totals.damageTaken)} (${formatDamageRatio(totals.damageDealt, totals.damageTaken)})`;
    }
    case "avg-life-damage-per-life": {
      if (totals == null || totals.totalSpawns === 0) {
        return null;
      }
      const avgSeconds = totals.totalLifeSeconds / totals.totalSpawns;
      const lifeDisplay = getReadableDuration(getDurationInIsoString(avgSeconds));
      const dmgPerLife = formatDamageRatio(totals.damageDealt, totals.totalSpawns);
      return `${lifeDisplay} (${dmgPerLife})`;
    }
    default: {
      return null;
    }
  }
}

export function computeTopBarStats(
  state: IndividualTrackerInternalState,
  topBarStatSlots: readonly IndividualTopBarStatOption[],
): readonly TopBarStatItem[] {
  const totals = state.accumulatedPlayerTotals;
  const matches = state.matchIds
    .map((id) => state.discoveredMatches[id])
    .filter((s): s is IndividualTrackerMatchSummary => s != null);
  const total = matches.length;
  const wins = matches.filter((m) => m.outcome === "Win").length;
  const losses = matches.filter((m) => m.outcome === "Loss").length;
  const matchmaking = matches.filter((m) => m.isMatchmaking).length;
  const customOrLocal = total - matchmaking;

  return topBarStatSlots.map((option): TopBarStatItem => {
    const label = getTopBarStatLabel(option);
    const value = formatTopBarStatOption(option, { totals, total, wins, losses, matchmaking, customOrLocal, state });
    return { label, value: value ?? "N/A" };
  });
}
