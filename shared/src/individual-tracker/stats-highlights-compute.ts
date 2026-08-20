import { compareAsc } from "date-fns";
import type { MatchStats, PlaylistCsrContainer } from "halo-infinite-api";
import { getDurationInIsoString, getDurationInSeconds, getReadableDuration } from "../halo/duration";
import { analyzeMatchGroupings } from "../halo/match-enrichment";
import type { NormalizedMatchOutcome } from "../halo/match-enrichment";
import { getPlayerXuid } from "../halo/match-stats";
import { getRankTierFromCsr } from "../halo/rank";
import { formatDamageRatio, formatStatValue } from "../halo/stat-formatting";
import { UnreachableError } from "../base/unreachable-error";
import { INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS } from "./streamer-view-settings";
import type { IndividualStatsHighlightOption } from "./streamer-view-settings";

export interface StatsHighlightRankIcon {
  readonly rankTier: string | null;
  readonly subTier: number | null;
  readonly measurementMatchesRemaining: number | null;
  readonly initialMeasurementMatches: number | null;
}

export interface StatsHighlightItem {
  readonly label: string;
  readonly value: string;
  readonly rankIcon?: StatsHighlightRankIcon;
}

export interface StatsHighlightAccumulatedTotals {
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly headshotKills: number;
  readonly shotsFired: number;
  readonly shotsHit: number;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly totalLifeSeconds: number;
  readonly totalSpawns: number;
  readonly totalLifeSpawns?: number;
}

export interface StatsHighlightMatchSummary {
  readonly matchId: string;
  readonly isMatchmaking: boolean;
  readonly teamRosterSignature: string | null;
  readonly outcome: NormalizedMatchOutcome;
  readonly startTime: string;
}

export interface StatsHighlightEsraLike {
  readonly esra?: number | null;
}

// Accumulates one match's core stats for the given player onto a running totals object.
// Returns undefined when the player didn't take part in this match (nothing to accumulate).
export function accumulateMatchStatsForPlayer(
  totals: StatsHighlightAccumulatedTotals | undefined,
  matchStats: MatchStats,
  xuid: string,
): StatsHighlightAccumulatedTotals | undefined {
  const player = matchStats.Players.find((p) => getPlayerXuid(p) === xuid);
  if (player == null) {
    return undefined;
  }

  const playerTeamStats =
    player.PlayerTeamStats.find((teamStats) => teamStats.TeamId === player.LastTeamId) ?? player.PlayerTeamStats[0];
  const playerStats = playerTeamStats?.Stats.CoreStats;
  if (playerStats == null) {
    return undefined;
  }

  const next = {
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
    ...totals,
  };

  next.kills += playerStats.Kills;
  next.deaths += playerStats.Deaths;
  next.assists += playerStats.Assists;
  next.headshotKills += playerStats.HeadshotKills;
  next.shotsFired += playerStats.ShotsFired;
  next.shotsHit += playerStats.ShotsHit;
  next.damageDealt += playerStats.DamageDealt;
  next.damageTaken += playerStats.DamageTaken;
  next.totalSpawns += playerStats.Spawns;
  try {
    next.totalLifeSeconds += getDurationInSeconds(playerStats.AverageLifeDuration) * playerStats.Spawns;
    next.totalLifeSpawns += playerStats.Spawns;
  } catch {
    // malformed AverageLifeDuration — skip life-seconds for this match
  }

  return next;
}

const optionLabelByValue = new Map<IndividualStatsHighlightOption, string>(
  INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS.map((d) => [d.value, d.label]),
);

function getStatsHighlightLabel(option: IndividualStatsHighlightOption): string {
  if (option === "matches-win-loss") {
    return "Won:Loss";
  }
  if (option === "series-win-loss") {
    return "Series Won:Loss";
  }
  return optionLabelByValue.get(option) ?? option;
}

function computeSeriesWonLoss(matches: readonly StatsHighlightMatchSummary[]): { won: number; lost: number } {
  const sorted = [...matches].sort((a, b) => compareAsc(new Date(a.startTime), new Date(b.startTime)));
  const matchesById = new Map(sorted.map((m) => [m.matchId, m]));

  const groupings = analyzeMatchGroupings(
    sorted.map((s) => ({
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
      const s = matchesById.get(matchId);
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

function computeKdaValue(totals: StatsHighlightAccumulatedTotals): number {
  return totals.deaths === 0 ? totals.kills + totals.assists / 3 : (totals.kills + totals.assists / 3) / totals.deaths;
}

function normalizeRankTier(rankTier: string | null | undefined): string | null {
  if (rankTier == null || rankTier === "") {
    return null;
  }
  return rankTier;
}

interface StatsHighlightContext {
  totals: StatsHighlightAccumulatedTotals | undefined;
  total: number;
  wins: number;
  losses: number;
  matchmaking: number;
  customOrLocal: number;
  matches: readonly StatsHighlightMatchSummary[];
  csrContainer: PlaylistCsrContainer | null | undefined;
  esraData: StatsHighlightEsraLike | null | undefined;
}

function getStatsHighlightRankIcon(
  option: IndividualStatsHighlightOption,
  ctx: StatsHighlightContext,
): StatsHighlightItem["rankIcon"] | undefined {
  const { csrContainer, esraData } = ctx;

  switch (option) {
    case "current-rank": {
      const current = csrContainer?.Current;
      if (current == null) {
        return undefined;
      }
      return {
        rankTier: normalizeRankTier(current.Tier),
        subTier: current.SubTier,
        measurementMatchesRemaining: current.MeasurementMatchesRemaining,
        initialMeasurementMatches: current.InitialMeasurementMatches,
      };
    }
    case "season-peak": {
      const seasonPeak = csrContainer?.SeasonMax;
      if (seasonPeak == null || seasonPeak.Value <= 0) {
        return undefined;
      }
      return {
        rankTier: normalizeRankTier(seasonPeak.Tier),
        subTier: seasonPeak.SubTier,
        measurementMatchesRemaining: null,
        initialMeasurementMatches: null,
      };
    }
    case "all-time-peak": {
      const allTimePeak = csrContainer?.AllTimeMax;
      if (allTimePeak == null || allTimePeak.Value <= 0) {
        return undefined;
      }
      return {
        rankTier: normalizeRankTier(allTimePeak.Tier),
        subTier: allTimePeak.SubTier,
        measurementMatchesRemaining: null,
        initialMeasurementMatches: null,
      };
    }
    case "esra": {
      const esra = esraData?.esra;
      if (esra == null || esra < 0) {
        return undefined;
      }

      const roundedEsra = Math.round(esra);
      const { rankTier, subTier } = getRankTierFromCsr(roundedEsra);
      return {
        rankTier,
        subTier,
        measurementMatchesRemaining: null,
        initialMeasurementMatches: null,
      };
    }
    case "matches-win-loss":
    case "series-win-loss":
    case "total-games":
    case "matchmaking-games":
    case "custom-local-games":
    case "kills":
    case "deaths":
    case "assists":
    case "kda":
    case "headshot-kills":
    case "shots-hit":
    case "shots-fired":
    case "accuracy":
    case "damage-dealt":
    case "damage-taken":
    case "damage-ratio":
    case "avg-life-time":
    case "avg-damage-per-life":
    case "kills-deaths-kd":
    case "kills-deaths-assists-kda":
    case "shots-hit-fired-accuracy":
    case "damage-dealt-taken-ratio":
    case "avg-life-damage-per-life": {
      return undefined;
    }
    default: {
      throw new UnreachableError(option);
    }
  }
}

function formatStatsHighlightOption(option: IndividualStatsHighlightOption, ctx: StatsHighlightContext): string | null {
  const { totals, total, wins, losses, matchmaking, customOrLocal, matches, csrContainer, esraData } = ctx;

  switch (option) {
    case "matches-win-loss": {
      return `${wins.toString()}:${losses.toString()}`;
    }
    case "series-win-loss": {
      const series = computeSeriesWonLoss(matches);
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
    case "current-rank": {
      const value = csrContainer?.Current.Value;
      return value != null && value > 0 ? formatStatValue(value) : "-";
    }
    case "season-peak": {
      const value = csrContainer?.SeasonMax.Value;
      return value != null && value > 0 ? formatStatValue(value) : "-";
    }
    case "all-time-peak": {
      const value = csrContainer?.AllTimeMax.Value;
      return value != null && value > 0 ? formatStatValue(value) : "-";
    }
    case "esra": {
      const esra = esraData?.esra;
      return esra != null && esra >= 0 ? formatStatValue(Math.round(esra)) : "-";
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
      const lifeSpawns = totals?.totalLifeSpawns ?? 0;
      if (totals == null || lifeSpawns === 0) {
        return null;
      }
      const avgSeconds = totals.totalLifeSeconds / lifeSpawns;
      return getReadableDuration(getDurationInIsoString(avgSeconds));
    }
    case "avg-damage-per-life": {
      const lifeSpawns = totals?.totalLifeSpawns ?? 0;
      if (totals == null || lifeSpawns === 0) {
        return null;
      }
      return formatDamageRatio(totals.damageDealt, lifeSpawns);
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
      const lifeSpawns = totals?.totalLifeSpawns ?? 0;
      if (totals == null || lifeSpawns === 0) {
        return null;
      }
      const avgSeconds = totals.totalLifeSeconds / lifeSpawns;
      const lifeDisplay = getReadableDuration(getDurationInIsoString(avgSeconds));
      const dmgPerLife = formatDamageRatio(totals.damageDealt, lifeSpawns);
      return `${lifeDisplay} (${dmgPerLife})`;
    }
    default: {
      throw new UnreachableError(option);
    }
  }
}

export interface ComputeStatsHighlightsInput {
  readonly matches: readonly StatsHighlightMatchSummary[];
  readonly totals: StatsHighlightAccumulatedTotals | undefined;
}

export function computeStatsHighlightItems(
  input: ComputeStatsHighlightsInput,
  statsHighlightSlots: readonly IndividualStatsHighlightOption[],
  csrContainer?: PlaylistCsrContainer | null,
  esraData?: StatsHighlightEsraLike | null,
): readonly StatsHighlightItem[] {
  const { matches, totals } = input;
  const total = matches.length;
  const wins = matches.filter((m) => m.outcome === "Win").length;
  const losses = matches.filter((m) => m.outcome === "Loss").length;
  const matchmaking = matches.filter((m) => m.isMatchmaking).length;
  const customOrLocal = total - matchmaking;

  return statsHighlightSlots.map((option): StatsHighlightItem => {
    const label = getStatsHighlightLabel(option);
    const ctx: StatsHighlightContext = {
      totals,
      total,
      wins,
      losses,
      matchmaking,
      customOrLocal,
      matches,
      csrContainer,
      esraData,
    };
    const value = formatStatsHighlightOption(option, ctx);
    const rankIcon = getStatsHighlightRankIcon(option, ctx);

    return {
      label,
      value: value ?? "N/A",
      ...(rankIcon != null ? { rankIcon } : {}),
    };
  });
}
