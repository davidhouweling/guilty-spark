import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { SeriesAggregation } from "@guilty-spark/shared/contracts/stats/detail";
import type { IdentifiedMatchStatsData, SeriesTickerProjection, SeriesTickerTeam } from "./types";
import type { StatsDetailController } from "./stats-detail-controller";
import { projectMedals } from "./medal-projection";

type ResolvedAggregation = Extract<SeriesAggregation, { status: "resolved" }>;

function projectTeam(
  team: IdentifiedMatchStatsData,
  teamsById: ReadonlyMap<number, ResolvedAggregation["teams"][number]>,
  playersById: ReadonlyMap<string, ResolvedAggregation["players"][number]>,
): SeriesTickerTeam {
  const sourceTeam = Preconditions.checkExists(teamsById.get(team.teamId), "Missing series team");
  const teamMedals = projectMedals(sourceTeam.medals, "ticker");
  return {
    ...team,
    teamMedals: teamMedals.medals,
    hasUnknownRarity: teamMedals.hasUnknownRarity,
    players: team.players.map((player) => {
      const source = Preconditions.checkExists(playersById.get(player.playerId), "Missing series player");
      const stats = Preconditions.checkExists(
        source.teamStats.find((entry) => entry.seriesTeamId === team.teamId),
        "Missing player series team stats",
      );
      const medals = projectMedals(stats.medals, "ticker");
      return {
        ...player,
        gamertag: source.playerType === 1 ? source.gamertag : null,
        medals: medals.medals,
        hasUnknownRarity: medals.hasUnknownRarity,
      };
    }),
  };
}

export function projectSeriesTicker(
  aggregation: SeriesAggregation,
  controller: StatsDetailController,
): SeriesTickerProjection {
  if (aggregation.status === "unavailable") {
    return aggregation;
  }
  const teamsById = new Map(aggregation.teams.map((team) => [team.seriesTeamId, team]));
  const playersById = new Map(aggregation.players.map((player) => [player.playerId, player]));
  const data = controller.mapSeriesAggregationToStatsWithPlayerIds(aggregation);
  const teamData = data.teamData.map((team) => projectTeam(team, teamsById, playersById));
  const playerData = data.playerData.map((team) => projectTeam(team, teamsById, playersById));
  return {
    status: "resolved",
    teamData,
    playerData,
    hasUnknownRarity: playerData.some(
      (team) => team.hasUnknownRarity || team.players.some((player) => player.hasUnknownRarity),
    ),
  };
}
