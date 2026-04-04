import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { resolveStatsValue } from "@guilty-spark/shared/halo/stat-formatting";
import type { StatsCollection, StatsValue } from "@guilty-spark/shared/halo/types";
import { aggregateTeamMedals as aggregateSharedTeamMedals, extractMedals } from "@guilty-spark/shared/halo/medals";
import {
  aggregatePlayerCoreStats,
  getPlayerMatches as getSharedPlayerMatches,
  getSeriesTeamPlayersFromMatches,
} from "@guilty-spark/shared/halo/series-player";
import { getPlayerSlayerStats as getSharedPlayerSlayerStats } from "@guilty-spark/shared/halo/slayer-stats";
import { getBestStatValues, getBestTeamStatValues, getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MatchStatsData, MatchStatsPlayerData } from "./types";

export class SeriesPlayerStatsPresenter {
  getSeriesData(
    matches: MatchStats[],
    players: Map<string, string>,
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): MatchStatsData[] {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const results: MatchStatsData[] = [];

    const playerMatches = getSharedPlayerMatches(matches);
    const playersCoreStats = aggregatePlayerCoreStats(matches);
    const playersStats = new Map<string, StatsCollection>();
    for (const [playerId, stats] of playersCoreStats) {
      playersStats.set(playerId, getSharedPlayerSlayerStats(stats));
    }

    const seriesBestValues = getBestStatValues(playersStats);

    for (const team of firstMatch.Teams) {
      const teamPlayers = getSeriesTeamPlayersFromMatches(matches, team, playersCoreStats);
      const teamBestValues = getBestTeamStatValues(playersStats, teamPlayers);

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

        const stats = Preconditions.checkExists(playersStats.get(teamPlayer.PlayerId));
        const outputStats = this.transformStats(seriesBestValues, teamBestValues, stats);
        const playerCoreStats = Preconditions.checkExists(playersCoreStats.get(teamPlayer.PlayerId));

        const playedGames = playerMatches.get(teamPlayer.PlayerId)?.length ?? 0;
        const gamesInfo =
          playedGames < matches.length ? ` (${playedGames.toString()}/${matches.length.toString()} games)` : "";

        playerStats.push({
          name: `${playerGamertag}${gamesInfo}`,
          values: outputStats,
          medals: extractMedals(playerCoreStats, medalMetadata),
        });
      }

      results.push({
        teamId: team.TeamId,
        teamStats: [],
        players: playerStats,
        teamMedals: aggregateSharedTeamMedals(playerStats),
      });
    }

    return results;
  }

  private transformStats(
    matchBestValues: Map<string, number>,
    teamBestValues: Map<string, number>,
    playerStats: StatsCollection,
  ): MatchStatsPlayerData["values"] {
    return Array.from(playerStats.entries()).map(([key, value]) =>
      this.getStatsValue(matchBestValues, teamBestValues, key, value),
    );
  }

  private getStatsValue(
    matchBestValues: Map<string, number>,
    teamBestValues: Map<string, number>,
    key: string,
    value: StatsValue,
  ): MatchStatsPlayerData["values"][0] {
    return resolveStatsValue(matchBestValues, teamBestValues, key, value);
  }
}
