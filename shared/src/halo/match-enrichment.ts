import type { MatchStats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";
import { compareAsc } from "date-fns";
import { getPlayerXuid } from "./match-stats";

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
