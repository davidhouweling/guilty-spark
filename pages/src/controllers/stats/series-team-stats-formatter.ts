import type { MatchStats } from "halo-infinite-api";
import { calculateSeriesTeamStats } from "@guilty-spark/shared/halo/series-stat-calculation";
import { resolveStatsValue } from "@guilty-spark/shared/halo/stat-formatting";
import type { StatsCollection, StatsValue } from "@guilty-spark/shared/halo/types";
import { aggregateTeamMedals as aggregateSharedTeamMedals, extractMedals } from "@guilty-spark/shared/halo/medals";
import { withPlayerSlayerStatDisplays } from "@guilty-spark/shared/halo/slayer-stats";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MatchStatsData, MatchStatsPlayerData, MatchStatsValues } from "./types";

export class SeriesTeamStatsFormatter {
  getSeriesData(
    matches: MatchStats[],
    players: Map<string, string>,
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): MatchStatsData[] {
    const results: MatchStatsData[] = [];
    const calculated = calculateSeriesTeamStats(matches);
    for (const team of calculated.teams) {
      const playerStats: MatchStatsPlayerData[] = [];
      for (const { player: teamPlayer, coreStats } of team.players) {
        const playerXuid = getPlayerXuid(teamPlayer);
        const playerGamertag = teamPlayer.PlayerType === 1 ? (players.get(playerXuid) ?? "*Unknown*") : "Bot";

        playerStats.push({
          name: playerGamertag,
          values: [],
          medals: extractMedals(coreStats, medalMetadata),
        });
      }

      results.push({
        teamId: team.teamId,
        teamStats: this.transformTeamStats(
          calculated.bestValues,
          withPlayerSlayerStatDisplays(team.values, team.coreStats),
        ),
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
