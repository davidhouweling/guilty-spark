import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MapAsset, MatchStats, PlaylistCsrContainer } from "halo-infinite-api";

export const RANKED_ARENA_PLAYLIST_ID = "edfef3ac-9cbe-4fa2-b949-8f29deafd483";

export function getRankLabel(tier: string, subTier: number): string {
  if (tier === "Onyx") {
    return tier;
  }

  return `${tier} ${(subTier + 1).toString()}`;
}

export function getRankAndCsrLabels(csr: PlaylistCsrContainer): { rankLabel: string | null; csrLabel: string | null } {
  const currentCsr = csr.Current;

  const csrLabel = currentCsr.Value >= 0 ? currentCsr.Value.toString() : "-";
  const rankLabel =
    currentCsr.MeasurementMatchesRemaining > 0 ? "Unranked" : getRankLabel(currentCsr.Tier, currentCsr.SubTier);

  return { rankLabel, csrLabel };
}

export function getCsrLabel(value: number): string | null {
  return value >= 0 ? value.toString() : "-";
}

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
