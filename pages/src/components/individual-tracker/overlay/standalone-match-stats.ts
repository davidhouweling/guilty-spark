import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import type { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";
import { projectStandaloneMatchMedals } from "./standalone-match-medals";
import type { OverlayStandaloneMatchStats } from "./types";

export function projectStandaloneMatchStats(
  detail: MatchDetail,
  controller: StatsDetailController,
  mode: "ticker" | "panel" = "ticker",
): OverlayStandaloneMatchStats {
  const medals = projectStandaloneMatchMedals(detail, mode);
  const medalsByTeamId = new Map(medals.teams.map((team) => [team.teamId, team]));
  const eligibleDetail: MatchDetail = {
    ...detail,
    teams: detail.teams.map((team) => {
      const projection = Preconditions.checkExists(
        medalsByTeamId.get(team.matchTeamId),
        "Missing team medal projection",
      );
      return { ...team, playerIds: projection.players.map((player) => player.playerId) };
    }),
  };
  const teams = controller.mapMatchDetailToStatsWithPlayerIds(eligibleDetail).map((team) => {
    const teamMedals = Preconditions.checkExists(medalsByTeamId.get(team.teamId), "Missing team medal projection");
    const medalsByPlayerId = new Map(teamMedals.players.map((player) => [player.playerId, player]));
    return {
      ...team,
      teamMedals: teamMedals.teamMedals,
      hasUnknownRarity: teamMedals.hasUnknownRarity,
      players: team.players.map((player) => {
        const playerMedals = Preconditions.checkExists(
          medalsByPlayerId.get(player.playerId),
          "Missing player medal projection",
        );
        return { ...player, medals: playerMedals.medals, hasUnknownRarity: playerMedals.hasUnknownRarity };
      }),
    };
  });
  return { teams, hasUnknownRarity: medals.hasUnknownRarity };
}
