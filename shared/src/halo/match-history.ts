import type { MatchStats } from "halo-infinite-api";
import { getPlayerXuid } from "./match-stats";

export function formatMatchResultString(outcome: string, scores: readonly number[] | null): string {
  if (scores == null) {
    return outcome;
  }

  const scoreString = scores.map((score) => score.toLocaleString()).join(":");
  return `${outcome} - ${scoreString}`;
}

export function buildMatchResultString(outcome: string, matchStats: MatchStats | null): string {
  return formatMatchResultString(outcome, matchStats?.Teams.map((team) => team.Stats.CoreStats.Score) ?? null);
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
    } else {
      teamPlayers.push(playerGamertag);
    }
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
