import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import type { Medal } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import { aggregateTeamMedals } from "@guilty-spark/shared/halo/medals";
import type { MedalEntry } from "@guilty-spark/shared/halo/medals";
import type { MatchMedalProjection, PlayerMedalProjection, TeamMedalProjection } from "./types";

function projectPlayerMedals(
  playerId: string,
  source: readonly Medal[],
  mode: "ticker" | "panel",
): PlayerMedalProjection {
  const medals: MedalEntry[] = [];
  let hasUnknownRarity = false;
  for (const medal of source) {
    const sortingWeight = medal.sortingWeight ?? medal.totalPersonalScoreAwarded;
    if (sortingWeight == null) {
      hasUnknownRarity = true;
      if (mode === "ticker") {
        continue;
      }
    }
    // Old responses have no rarity; zero is only a panel sort placeholder.
    medals.push({ name: medal.name ?? medal.id.toString(), count: medal.count, sortingWeight: sortingWeight ?? 0 });
  }
  medals.sort((left, right) => right.sortingWeight - left.sortingWeight);
  return { playerId, medals, hasUnknownRarity };
}

function projectTeamMedals(
  team: MatchDetail["teams"][number],
  playersById: ReadonlyMap<string, MatchDetail["players"][number]>,
  mode: "ticker" | "panel",
): TeamMedalProjection {
  const players: PlayerMedalProjection[] = [];
  for (const playerId of team.playerIds) {
    const player = playersById.get(playerId);
    if (player?.participation.presentAtBeginning !== true) {
      continue;
    }
    const stats = player.teamStats.find((entry) => entry.matchTeamId === team.matchTeamId);
    if (stats != null) {
      players.push(projectPlayerMedals(playerId, stats.medals, mode));
    }
  }
  return {
    teamId: team.matchTeamId,
    players,
    teamMedals: aggregateTeamMedals(players),
    hasUnknownRarity: players.some((player) => player.hasUnknownRarity),
  };
}

export function projectStandaloneMatchMedals(
  detail: MatchDetail,
  mode: "ticker" | "panel" = "ticker",
): MatchMedalProjection {
  const playersById = new Map(detail.players.map((player) => [player.playerId, player]));
  const teams = detail.teams.map((team) => projectTeamMedals(team, playersById, mode));
  return { teams, hasUnknownRarity: teams.some((team) => team.hasUnknownRarity) };
}
