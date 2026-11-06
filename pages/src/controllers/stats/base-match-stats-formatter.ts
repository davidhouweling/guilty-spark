import type { MatchStats, Stats } from "halo-infinite-api";
import { resolveStatsValue } from "@guilty-spark/shared/halo/stat-formatting";
import { aggregateTeamMedals as aggregateSharedTeamMedals, extractMedals } from "@guilty-spark/shared/halo/medals";
import { withPlayerSlayerStatDisplays } from "@guilty-spark/shared/halo/slayer-stats";
import { calculateMatchStats } from "@guilty-spark/shared/halo/match-stat-calculation";
import type { StatsCollection, StatsValue } from "@guilty-spark/shared/halo/types";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MatchStatsData, MatchStatsPlayerData, MatchStatsValues } from "./types";

export abstract class BaseMatchStatsFormatter {
  protected abstract getPlayerObjectiveStats(stats: Stats): StatsCollection;

  getData(
    match: MatchStats,
    players: Map<string, string>,
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): MatchStatsData[] {
    const results: MatchStatsData[] = [];

    const calculated = calculateMatchStats(match, (stats) => this.getPlayerObjectiveStats(stats));
    for (const team of calculated.teams) {
      const playerStats: MatchStatsPlayerData[] = [];
      for (const { player: teamPlayer, values, coreStats, medalStats } of team.players) {
        const playerXuid = getPlayerXuid(teamPlayer);
        const playerGamertag = teamPlayer.PlayerType === 1 ? (players.get(playerXuid) ?? "*Unknown*") : "Bot";

        const outputStats = this.transformStats(
          calculated.bestPlayerValues,
          team.bestPlayerValues,
          withPlayerSlayerStatDisplays(values, coreStats),
        );
        playerStats.push({
          name: playerGamertag,
          values: outputStats,
          medals: extractMedals(medalStats, medalMetadata),
        });
      }

      results.push({
        teamId: team.teamId,
        teamStats: this.transformTeamStats(
          calculated.bestTeamValues,
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

  private transformStats(
    matchBestValues: Map<string, number>,
    teamBestValues: Map<string, number>,
    playerStats: StatsCollection,
  ): MatchStatsValues[] {
    return Array.from(playerStats.entries()).map(([key, value]) =>
      this.getStatsValue(matchBestValues, teamBestValues, key, value),
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
