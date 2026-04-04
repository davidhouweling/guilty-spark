import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aggregateTeamCoreStats as aggregateSharedTeamCoreStats } from "@guilty-spark/shared/halo/series-team";
import { resolveStatsValue } from "@guilty-spark/shared/halo/stat-formatting";
import type { StatsCollection, StatsValue } from "@guilty-spark/shared/halo/types";
import { aggregateTeamMedals as aggregateSharedTeamMedals, extractMedals } from "@guilty-spark/shared/halo/medals";
import { getPlayerSlayerStats as getSharedPlayerSlayerStats } from "@guilty-spark/shared/halo/slayer-stats";
import { getBestStatValues, getPlayerXuid, getTeamPlayersFromMatches } from "@guilty-spark/shared/halo/match-stats";
import { aggregatePlayerCoreStats } from "@guilty-spark/shared/halo/series-player";
import type { MatchStatsData, MatchStatsPlayerData, MatchStatsValues } from "./types";

export class SeriesTeamStatsPresenter {
  getSeriesData(
    matches: MatchStats[],
    players: Map<string, string>,
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): MatchStatsData[] {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const results: MatchStatsData[] = [];

    const teamCoreStats = aggregateSharedTeamCoreStats(matches);
    const teamStats = new Map<number, StatsCollection>();
    for (const [teamId, stats] of teamCoreStats) {
      teamStats.set(teamId, getSharedPlayerSlayerStats(stats));
    }

    const bestTeamValues = getBestStatValues(teamStats);
    const playersCoreStats = aggregatePlayerCoreStats(matches);

    for (const team of firstMatch.Teams) {
      const stats = Preconditions.checkExists(teamStats.get(team.TeamId));
      const teamPlayers = getTeamPlayersFromMatches(matches, team);

      const playerStats: MatchStatsPlayerData[] = [];
      for (const teamPlayer of teamPlayers) {
        const playerXuid = getPlayerXuid(teamPlayer);
        const playerGamertag =
          teamPlayer.PlayerType === 1
            ? Preconditions.checkExists(
                players.get(playerXuid),
                `Unable to find player gamertag for XUID ${playerXuid}`,
              )
            : "Bot";

        const playerCoreStats = Preconditions.checkExists(playersCoreStats.get(teamPlayer.PlayerId));

        playerStats.push({
          name: playerGamertag,
          values: [],
          medals: extractMedals(playerCoreStats, medalMetadata),
        });
      }

      results.push({
        teamId: team.TeamId,
        teamStats: this.transformTeamStats(bestTeamValues, stats),
        players: playerStats,
        teamMedals: aggregateSharedTeamMedals(playerStats),
      });
    }

    return results;
  }

  private transformTeamStats(matchBestValues: Map<string, number>, teamStats: StatsCollection): MatchStatsValues[] {
    return Array.from(teamStats.entries()).map(([key, value]) =>
      this.getStatsValue(matchBestValues, new Map(), key, value),
    );
  }

  private getStatsValue(
    matchBestValues: Map<string, number>,
    teamBestValues: Map<string, number>,
    key: string,
    value: StatsValue,
  ): MatchStatsValues {
    return resolveStatsValue(matchBestValues, teamBestValues, key, value);
  }
}
