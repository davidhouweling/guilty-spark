import type { MatchStats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";
import { getPlayerXuid } from "./match-stats";

export function sanitizeMapName(mapName: string): string {
  return mapName.replace("- Ranked", "").trim();
}

export function normalizeModeName(modeName: string): string {
  const trimmedName = modeName.replace("Ranked:", "").replace("Squad Ranked", "").replace("Squad ", "").trim();

  switch (trimmedName) {
    case "CTF 3 Captures":
    case "CTF 5 Captures":
    case "Squad Multi-Flag CTF": {
      return "Capture the Flag";
    }
    case "Assault:Neutral Bomb Ranked":
    case "Assault:Neutral Bomb Squad Ranked": {
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

export function buildMatchResultString(outcome: string, matchStats: MatchStats | null, locale?: string): string {
  if (matchStats == null) {
    return outcome;
  }

  const scoreString = matchStats.Teams.map((team) => team.Stats.CoreStats.Score.toLocaleString(locale)).join(":");

  if (matchStats.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball) {
    const roundsString = matchStats.Teams.map((team) => team.Stats.CoreStats.RoundsWon.toLocaleString(locale)).join(
      ":",
    );
    return `${outcome} - ${roundsString} (${scoreString})`;
  }

  return `${outcome} - ${scoreString}`;
}

export function buildTeams(
  matchStats: MatchStats | null,
  xuidToGamertag: ReadonlyMap<string, string>,
): readonly (readonly string[])[] {
  if (matchStats == null) {
    return [];
  }

  const playersByTeam = new Map<number, string[]>();

  for (const player of matchStats.Players) {
    if (player.PlayerType !== 1) {
      continue;
    }

    const xuid = getPlayerXuid(player);
    const playerGamertag = xuidToGamertag.get(xuid) ?? "*Unknown*";
    const teamId = player.LastTeamId;
    const teamPlayers = playersByTeam.get(teamId);

    if (teamPlayers == null) {
      playersByTeam.set(teamId, [playerGamertag]);
      continue;
    }

    teamPlayers.push(playerGamertag);
  }

  const teams: string[][] = [];
  const sortedTeamIds = Array.from(playersByTeam.keys()).sort((left, right) => left - right);
  for (const teamId of sortedTeamIds) {
    const teamPlayers = playersByTeam.get(teamId);
    if (teamPlayers != null) {
      teams.push([...teamPlayers].sort((left, right) => left.localeCompare(right)));
    }
  }

  return teams;
}

export function haveSameTeamRosters(firstMatch: MatchStats, secondMatch: MatchStats): boolean {
  const toTeamRosters = (match: MatchStats): Map<number, Set<string>> => {
    const rosters = new Map<number, Set<string>>();

    for (const player of match.Players) {
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

    return rosters;
  };

  const firstRosters = toTeamRosters(firstMatch);
  const secondRosters = toTeamRosters(secondMatch);

  if (firstRosters.size !== secondRosters.size) {
    return false;
  }

  for (const [teamId, firstPlayers] of firstRosters.entries()) {
    const secondPlayers = secondRosters.get(teamId);
    if (firstPlayers.size !== secondPlayers?.size) {
      return false;
    }

    for (const playerXuid of firstPlayers) {
      if (!secondPlayers.has(playerXuid)) {
        return false;
      }
    }
  }

  return true;
}

interface MatchGroupingEntry {
  readonly matchId: string;
  readonly isMatchmaking: boolean;
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
  const sortedEntries = [...entries].sort(
    (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime(),
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

export function countSequentialSeriesGames(entries: readonly SequentialSeriesEntry[]): number {
  return collapseSequentialSeriesEntries(entries).length;
}

export function analyzeMatchGroupings(
  matches: readonly MatchGroupingEntry[],
  matchDetailsById: ReadonlyMap<string, MatchStats>,
): readonly (readonly string[])[] {
  const groupings: string[][] = [];
  let currentGroup: string[] = [];

  for (let index = 0; index < matches.length; index++) {
    const currentMatch = matches[index];
    if (currentMatch == null) {
      continue;
    }

    if (currentMatch.isMatchmaking) {
      if (currentGroup.length > 1) {
        groupings.push([...currentGroup]);
      }
      currentGroup = [];
      continue;
    }

    const currentMatchDetail = matchDetailsById.get(currentMatch.matchId);
    if (currentMatchDetail == null) {
      if (currentGroup.length > 1) {
        groupings.push([...currentGroup]);
      }
      currentGroup = [];
      continue;
    }

    currentGroup.push(currentMatch.matchId);

    const nextMatch = matches[index + 1];
    if (nextMatch == null) {
      continue;
    }

    if (nextMatch.isMatchmaking) {
      if (currentGroup.length > 1) {
        groupings.push([...currentGroup]);
      }
      currentGroup = [];
      continue;
    }

    const nextMatchDetail = matchDetailsById.get(nextMatch.matchId);
    if (nextMatchDetail == null || !haveSameTeamRosters(currentMatchDetail, nextMatchDetail)) {
      if (currentGroup.length > 1) {
        groupings.push([...currentGroup]);
      }
      currentGroup = [];
    }
  }

  if (currentGroup.length > 1) {
    groupings.push([...currentGroup]);
  }

  return groupings;
}
