import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import type { Medal } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import { aggregateTeamMedals } from "@guilty-spark/shared/halo/medals";
import type { MedalEntry } from "@guilty-spark/shared/halo/medals";
import type { OverlayMatchMedalProjection, OverlayPlayerMedalProjection, OverlayTeamMedalProjection } from "./types";

function projectPlayerMedals(playerId: string, source: readonly Medal[]): OverlayPlayerMedalProjection {
  const medals: MedalEntry[] = [];
  let hasUnknownRarity = false;
  for (const medal of source) {
    const sortingWeight = medal.sortingWeight ?? medal.totalPersonalScoreAwarded;
    if (sortingWeight == null) {
      hasUnknownRarity = true;
      continue;
    }
    medals.push({ name: medal.name ?? medal.id.toString(), count: medal.count, sortingWeight });
  }
  medals.sort((left, right) => right.sortingWeight - left.sortingWeight);
  return { playerId, medals, hasUnknownRarity };
}

function projectTeamMedals(
  team: MatchDetail["teams"][number],
  playersById: ReadonlyMap<string, MatchDetail["players"][number]>,
): OverlayTeamMedalProjection {
  const players: OverlayPlayerMedalProjection[] = [];
  for (const playerId of team.playerIds) {
    const player = playersById.get(playerId);
    if (player?.participation.presentAtBeginning !== true) {
      continue;
    }
    const stats = player.teamStats.find((entry) => entry.matchTeamId === team.matchTeamId);
    if (stats != null) {
      players.push(projectPlayerMedals(playerId, stats.medals));
    }
  }
  return {
    teamId: team.matchTeamId,
    players,
    teamMedals: aggregateTeamMedals(players),
    hasUnknownRarity: players.some((player) => player.hasUnknownRarity),
  };
}

export function projectStandaloneMatchMedals(detail: MatchDetail): OverlayMatchMedalProjection {
  const playersById = new Map(detail.players.map((player) => [player.playerId, player]));
  const teams = detail.teams.map((team) => projectTeamMedals(team, playersById));
  return { teams, hasUnknownRarity: teams.some((team) => team.hasUnknownRarity) };
}
