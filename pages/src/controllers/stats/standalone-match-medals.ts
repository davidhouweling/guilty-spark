import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import { aggregateTeamMedals } from "@guilty-spark/shared/halo/medals";
import type { MatchMedalProjection, PlayerMedalProjection, TeamMedalProjection } from "./types";
import { projectMedals } from "./medal-projection";

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
      players.push({ playerId, ...projectMedals(stats.medals, mode) });
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
