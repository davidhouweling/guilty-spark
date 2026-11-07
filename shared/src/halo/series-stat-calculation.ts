import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "../base/preconditions";
import { getBestStatValues, getBestTeamStatValues, getTeamPlayersFromMatches } from "./match-stats";
import { getPlayerObjectiveSummary } from "./objective-summary";
import { aggregatePlayerCoreStats, getPlayerMatches, getSeriesTeamPlayersFromMatches } from "./series-player";
import { aggregateTeamCoreStats } from "./series-team";
import { getPlayerSlayerStatValues } from "./slayer-stats";
import { StatsValueSortBy } from "./stat-formatting";
import type { CalculatedSeriesPlayerStats, CalculatedSeriesTeamStats } from "./series-stat-calculation-types";
import type { StatsCollection } from "./types";

export function calculateSeriesTeamStats(matches: MatchStats[]): CalculatedSeriesTeamStats {
  const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
  const teamCoreStats = aggregateTeamCoreStats(matches);
  const playerCoreStats = aggregatePlayerCoreStats(matches);
  const teamValues = new Map(Array.from(teamCoreStats, ([id, core]) => [id, getPlayerSlayerStatValues(core)]));

  return {
    bestValues: getBestStatValues(teamValues),
    teams: firstMatch.Teams.map((team) => ({
      teamId: team.TeamId,
      coreStats: Preconditions.checkExists(teamCoreStats.get(team.TeamId)),
      values: Preconditions.checkExists(teamValues.get(team.TeamId)),
      players: getTeamPlayersFromMatches(matches, team).map((player) => ({
        player,
        coreStats: Preconditions.checkExists(playerCoreStats.get(player.PlayerId)),
      })),
    })),
  };
}

export function calculateSeriesPlayerStats(matches: MatchStats[]): CalculatedSeriesPlayerStats {
  const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
  const playerMatches = getPlayerMatches(matches);
  const playerCoreStats = aggregatePlayerCoreStats(matches);
  const summaries = new Map(
    Array.from(playerCoreStats.keys(), (id) => [id, getPlayerObjectiveSummary(playerMatches.get(id) ?? [], id)]),
  );
  const playerValues = new Map<string, StatsCollection>();
  for (const [id, core] of playerCoreStats) {
    const values = getPlayerSlayerStatValues(core);
    const summary = summaries.get(id);
    if (summary != null) {
      values.set("Objective time", { value: summary.objectiveTimeSeconds, sortBy: StatsValueSortBy.DESC });
      values.set("Team objective contribution", {
        value: summary.objectiveTeamContribution ?? 0,
        sortBy: StatsValueSortBy.DESC,
        isComparable: summary.objectiveTeamContribution != null,
      });
    }
    playerValues.set(id, values);
  }

  return {
    bestValues: getBestStatValues(playerValues),
    teams: firstMatch.Teams.map((team) => {
      const players = getSeriesTeamPlayersFromMatches(matches, team, playerCoreStats);
      return {
        teamId: team.TeamId,
        bestPlayerValues: getBestTeamStatValues(playerValues, players),
        players: players.map((player) => ({
          player,
          coreStats: Preconditions.checkExists(playerCoreStats.get(player.PlayerId)),
          values: Preconditions.checkExists(playerValues.get(player.PlayerId)),
          gamesPlayed: playerMatches.get(player.PlayerId)?.length ?? 0,
          objectiveSummary: summaries.get(player.PlayerId) ?? null,
        })),
      };
    }),
  };
}
