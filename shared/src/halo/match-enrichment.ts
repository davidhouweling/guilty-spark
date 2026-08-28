import type { MatchStats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";
import { compareAsc } from "date-fns";
import { UnreachableError } from "../base/unreachable-error";
import { getPlayerXuid } from "./match-stats";
import { formatDamageRatio, formatStatValue } from "./stat-formatting";

export const UNKNOWN_KDA_DISPLAY = "-:-:- (-)";
export const UNKNOWN_DAMAGE_RATIO_DISPLAY = "-:- (-)";
export const UNKNOWN_SERIES_SUMMARY_DISPLAY = "N/A";
export const STATS_DISPLAY_LOCALE = "en-US";

export interface TrackedPlayerSummaryStats {
  readonly killsDeathsAssistsKda: string;
  readonly damageDealtTakenRatio: string;
  readonly kills?: number;
  readonly deaths?: number;
  readonly assists?: number;
  readonly damageDealt?: number;
  readonly damageTaken?: number;
}

export interface SeriesSummaryStatsSource {
  readonly kills?: number | null;
  readonly deaths?: number | null;
  readonly assists?: number | null;
  readonly damageDealt?: number | null;
  readonly damageTaken?: number | null;
}

export type NormalizedMatchOutcome = "Win" | "Loss" | "Tie" | "DNF" | "Unknown";

export function getMatchOutcomeLabel(outcomeCode: number | null): "Win" | "Loss" | "Tie" | "DNF" | "Unknown" {
  if (outcomeCode == null) {
    return "Unknown";
  }

  switch (outcomeCode) {
    case 1: {
      return "Tie";
    }
    case 2: {
      return "Win";
    }
    case 3: {
      return "Loss";
    }
    case 4: {
      return "DNF";
    }
    default: {
      return "Unknown";
    }
  }
}

export function normalizeOutcomeString(outcome: string): NormalizedMatchOutcome {
  if (outcome === "Win") {
    return "Win";
  }
  if (outcome === "Loss") {
    return "Loss";
  }
  if (outcome === "Tie") {
    return "Tie";
  }
  if (outcome === "DNF") {
    return "DNF";
  }
  return "Unknown";
}

export function getOutcomeColor(
  outcome: NormalizedMatchOutcome,
  teamColor: string,
  enemyColor: string,
): string | undefined {
  if (outcome === "Win") {
    return teamColor;
  }
  if (outcome === "Loss") {
    return enemyColor;
  }
  return undefined;
}

export function summarizeSeriesOutcome(outcomes: readonly NormalizedMatchOutcome[]): NormalizedMatchOutcome {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let dnf = 0;

  for (const outcome of outcomes) {
    switch (outcome) {
      case "Win": {
        wins += 1;
        break;
      }
      case "Loss": {
        losses += 1;
        break;
      }
      case "Tie": {
        ties += 1;
        break;
      }
      case "DNF": {
        dnf += 1;
        break;
      }
      case "Unknown": {
        break;
      }
      default: {
        throw new UnreachableError(outcome);
      }
    }
  }

  if (wins > losses) {
    return "Win";
  }

  if (losses > wins) {
    return "Loss";
  }

  if (wins === 0 && losses === 0 && dnf > 0) {
    return "DNF";
  }

  if (ties > 0) {
    return "Tie";
  }

  return "Unknown";
}

export function buildMatchScore(matchStats: MatchStats, locale?: string): string {
  const scoreString = matchStats.Teams.map((team) => team.Stats.CoreStats.Score.toLocaleString(locale)).join(":");

  if (matchStats.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball) {
    const roundsString = matchStats.Teams.map((team) => team.Stats.CoreStats.RoundsWon.toLocaleString(locale)).join(
      ":",
    );
    return `${roundsString} (${scoreString})`;
  }

  return scoreString;
}

export function computeTrackedPlayerSummaryStats(
  matchStats: MatchStats,
  trackedXuid: string,
): TrackedPlayerSummaryStats {
  const player = matchStats.Players.find((candidate) => getPlayerXuid(candidate) === trackedXuid);
  const playerTeamStats =
    player?.PlayerTeamStats.find((teamStats) => teamStats.TeamId === player.LastTeamId) ?? player?.PlayerTeamStats[0];
  const playerStats = playerTeamStats?.Stats.CoreStats;
  if (playerStats == null) {
    return {
      killsDeathsAssistsKda: UNKNOWN_KDA_DISPLAY,
      damageDealtTakenRatio: UNKNOWN_DAMAGE_RATIO_DISPLAY,
    };
  }

  const kdaValue =
    playerStats.Deaths === 0
      ? playerStats.Kills + playerStats.Assists / 3
      : (playerStats.Kills + playerStats.Assists / 3) / playerStats.Deaths;

  return {
    killsDeathsAssistsKda: `${formatStatValue(playerStats.Kills, STATS_DISPLAY_LOCALE)}:${formatStatValue(playerStats.Deaths, STATS_DISPLAY_LOCALE)}:${formatStatValue(playerStats.Assists, STATS_DISPLAY_LOCALE)} (${formatStatValue(kdaValue, STATS_DISPLAY_LOCALE)})`,
    damageDealtTakenRatio: `${formatStatValue(playerStats.DamageDealt, STATS_DISPLAY_LOCALE)}:${formatStatValue(playerStats.DamageTaken, STATS_DISPLAY_LOCALE)} (${formatDamageRatio(playerStats.DamageDealt, playerStats.DamageTaken, STATS_DISPLAY_LOCALE)})`,
    kills: playerStats.Kills,
    deaths: playerStats.Deaths,
    assists: playerStats.Assists,
    damageDealt: playerStats.DamageDealt,
    damageTaken: playerStats.DamageTaken,
  };
}

export function computeSeriesSummaryStats(summaries: readonly SeriesSummaryStatsSource[]): {
  killsDeathsAssistsKda: string;
  damageDealtTakenRatio: string;
} {
  if (summaries.length === 0) {
    return {
      killsDeathsAssistsKda: UNKNOWN_SERIES_SUMMARY_DISPLAY,
      damageDealtTakenRatio: UNKNOWN_SERIES_SUMMARY_DISPLAY,
    };
  }

  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let damageDealt = 0;
  let damageTaken = 0;

  for (const summary of summaries) {
    if (
      summary.kills == null ||
      summary.deaths == null ||
      summary.assists == null ||
      summary.damageDealt == null ||
      summary.damageTaken == null
    ) {
      return {
        killsDeathsAssistsKda: UNKNOWN_SERIES_SUMMARY_DISPLAY,
        damageDealtTakenRatio: UNKNOWN_SERIES_SUMMARY_DISPLAY,
      };
    }

    kills += summary.kills;
    deaths += summary.deaths;
    assists += summary.assists;
    damageDealt += summary.damageDealt;
    damageTaken += summary.damageTaken;
  }

  const kdaValue = deaths === 0 ? kills + assists / 3 : (kills + assists / 3) / deaths;

  return {
    killsDeathsAssistsKda: `${formatStatValue(kills, STATS_DISPLAY_LOCALE)}:${formatStatValue(deaths, STATS_DISPLAY_LOCALE)}:${formatStatValue(assists, STATS_DISPLAY_LOCALE)} (${formatStatValue(kdaValue, STATS_DISPLAY_LOCALE)})`,
    damageDealtTakenRatio: `${formatStatValue(damageDealt, STATS_DISPLAY_LOCALE)}:${formatStatValue(damageTaken, STATS_DISPLAY_LOCALE)} (${formatDamageRatio(damageDealt, damageTaken, STATS_DISPLAY_LOCALE)})`,
  };
}

export function buildTeamRosterSignature(matchStats: MatchStats): string | null {
  const rosters = new Map<number, Set<string>>();

  for (const player of matchStats.Players) {
    if (player.PlayerType !== 1 || !player.ParticipationInfo.PresentAtBeginning) {
      continue;
    }

    const teamId = player.LastTeamId;
    const teamPlayers = rosters.get(teamId);
    if (teamPlayers == null) {
      rosters.set(teamId, new Set([getPlayerXuid(player)]));
      continue;
    }

    teamPlayers.add(getPlayerXuid(player));
  }

  if (rosters.size === 0) {
    return null;
  }

  const sortedTeamIds = Array.from(rosters.keys()).sort((left, right) => left - right);
  return sortedTeamIds
    .map((teamId) => {
      const xuids = Array.from(rosters.get(teamId) ?? []).sort((left, right) => left.localeCompare(right));
      return `${teamId.toString()}:${xuids.join(",")}`;
    })
    .join("|");
}

export interface AutoGroupingEntry {
  readonly matchId: string;
  readonly isMatchmaking: boolean;
  readonly teamRosterSignature: string | null;
}

export function analyzeMatchGroupings(entries: readonly AutoGroupingEntry[]): string[][] {
  const groupings: string[][] = [];
  let currentGroup: string[] = [];

  const flush = (): void => {
    if (currentGroup.length >= 2) {
      groupings.push([...currentGroup]);
    }
    currentGroup = [];
  };

  for (let index = 0; index < entries.length; index++) {
    const current = entries[index];
    if (current == null) {
      continue;
    }

    if (current.isMatchmaking || current.teamRosterSignature == null) {
      flush();
      continue;
    }

    currentGroup.push(current.matchId);

    const next = entries[index + 1];
    if (next == null) {
      continue;
    }

    if (
      next.isMatchmaking ||
      next.teamRosterSignature == null ||
      next.teamRosterSignature !== current.teamRosterSignature
    ) {
      flush();
    }
  }

  flush();

  return groupings;
}

export interface SequentialSeriesEntry {
  readonly startTime: string;
  readonly mapAssetId: string;
  readonly mapVersionId: string;
  readonly gameVariantCategory: number;
}

function haveSameSequentialSeriesSignature(
  firstEntry: SequentialSeriesEntry,
  secondEntry: SequentialSeriesEntry,
): boolean {
  return (
    firstEntry.mapAssetId === secondEntry.mapAssetId &&
    firstEntry.mapVersionId === secondEntry.mapVersionId &&
    firstEntry.gameVariantCategory === secondEntry.gameVariantCategory
  );
}

export function collapseSequentialSeriesEntries<T extends SequentialSeriesEntry>(entries: readonly T[]): T[] {
  const sortedEntries = [...entries].sort((left, right) =>
    compareAsc(new Date(left.startTime), new Date(right.startTime)),
  );
  const collapsedEntries: T[] = [];

  for (const [index, entry] of sortedEntries.entries()) {
    const nextEntry = sortedEntries[index + 1];
    if (nextEntry != null && haveSameSequentialSeriesSignature(entry, nextEntry)) {
      continue;
    }

    collapsedEntries.push(entry);
  }

  return collapsedEntries;
}

export function sanitizeMapName(mapName: string): string {
  return mapName.replace("- Ranked", "").trim();
}

export function normalizeModeName(modeName: string): string {
  const trimmedName = modeName.replace("Ranked:", "").replace("Squad Ranked", "").replace("Squad ", "").trim();

  switch (trimmedName) {
    case "CTF 3 Captures":
    case "CTF 5 Captures":
    case "Multi-Flag CTF": {
      return "Capture the Flag";
    }
    case "Assault:Neutral Bomb Ranked":
    case "Assault:Neutral Bomb": {
      return "Neutral Bomb";
    }
    case "Team Snipers":
    case "Tactical Slayer":
    case "Doubles Slayer":
    case "FFA Slayer":
    case "Squad Slayer": {
      return "Slayer";
    }
    default: {
      return trimmedName;
    }
  }
}
