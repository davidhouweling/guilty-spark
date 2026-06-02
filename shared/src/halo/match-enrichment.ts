import type { MatchStats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";
import { getPlayerXuid } from "./match-stats";

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
