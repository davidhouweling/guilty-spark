import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MapAsset, MatchStats } from "halo-infinite-api";

export function formatDisplayDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  }).format(date);
}

export function getMapThumbnailUrl(asset: MapAsset): string {
  const thumbnailFile = asset.Files.FileRelativePaths.find((file) => file.includes("thumbnail"));
  if (thumbnailFile != null) {
    return `${asset.Files.Prefix}${thumbnailFile}`;
  }

  const heroFile = asset.Files.FileRelativePaths.find((file) => file.includes("hero"));
  if (heroFile != null) {
    return `${asset.Files.Prefix}${heroFile}`;
  }

  return "data:,";
}

export function buildMatchResultString(outcome: string, matchStats: MatchStats | null): string {
  if (matchStats == null) {
    return outcome;
  }

  const scoreString = matchStats.Teams.map((team) => team.Stats.CoreStats.Score.toLocaleString()).join(":");
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
