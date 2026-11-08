import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "../base/preconditions";
import { getBestStatValues, getBestTeamStatValues, getTeamPlayersFromMatches } from "./match-stats";
import { getPlayerSlayerStatValues } from "./slayer-stats";
import type { CalculatedMatchStats } from "./match-stat-calculation-types";
import type { StatsCollection } from "./types";

export function calculateMatchStats(
  match: MatchStats,
  getObjectiveStats: (stats: Stats) => StatsCollection = () => new Map(),
): CalculatedMatchStats {
  function getValues(stats: Stats, rank: number): StatsCollection {
    return new Map([
      ...getPlayerSlayerStatValues(stats.CoreStats, { includeRank: true, rank }),
      ...getObjectiveStats(stats),
    ]);
  }

  const teamsStats = new Map(match.Teams.map((team) => [team.TeamId, getValues(team.Stats, team.Rank)]));
  const playersStats = new Map(
    match.Players.filter((player) => player.ParticipationInfo.PresentAtBeginning).map((player) => [
      player.PlayerId,
      getValues(Preconditions.checkExists(player.PlayerTeamStats[0]).Stats, player.Rank),
    ]),
  );

  return {
    bestTeamValues: getBestStatValues(teamsStats),
    bestPlayerValues: getBestStatValues(playersStats),
    teams: match.Teams.map((team) => {
      const teamPlayers = getTeamPlayersFromMatches([match], team);
      return {
        teamId: team.TeamId,
        values: Preconditions.checkExists(teamsStats.get(team.TeamId)),
        coreStats: team.Stats.CoreStats,
        bestPlayerValues: getBestTeamStatValues(playersStats, teamPlayers),
        players: teamPlayers.map((player) => ({
          player,
          values: Preconditions.checkExists(playersStats.get(player.PlayerId)),
          // Existing tables use the first stat entry, but medals belong to the selected team.
          coreStats: Preconditions.checkExists(player.PlayerTeamStats[0]).Stats.CoreStats,
          medalStats: Preconditions.checkExists(player.PlayerTeamStats.find((stats) => stats.TeamId === team.TeamId))
            .Stats.CoreStats,
        })),
      };
    }),
  };
}
