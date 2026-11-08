import type { MatchStats } from "halo-infinite-api";
import { getDurationInIsoString, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import type { PlayerObjectiveSummary } from "@guilty-spark/shared/halo/objective-summary";
import { calculateSeriesPlayerStats } from "@guilty-spark/shared/halo/series-stat-calculation";
import { resolveStatsValue } from "@guilty-spark/shared/halo/stat-formatting";
import type { StatsCollection, StatsValue } from "@guilty-spark/shared/halo/types";
import { aggregateTeamMedals as aggregateSharedTeamMedals, extractMedals } from "@guilty-spark/shared/halo/medals";
import { withPlayerSlayerStatDisplays } from "@guilty-spark/shared/halo/slayer-stats";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { MatchStatsData, MatchStatsPlayerData } from "./types";

export class SeriesPlayerStatsFormatter {
  getSeriesData(
    matches: MatchStats[],
    players: Map<string, string>,
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): MatchStatsData[] {
    const results: MatchStatsData[] = [];
    const calculated = calculateSeriesPlayerStats(matches);
    for (const team of calculated.teams) {
      const playerStats: MatchStatsPlayerData[] = [];
      for (const { player: teamPlayer, values, coreStats, gamesPlayed, objectiveSummary } of team.players) {
        const playerXuid = getPlayerXuid(teamPlayer);
        const playerGamertag = teamPlayer.PlayerType === 1 ? (players.get(playerXuid) ?? "*Unknown*") : "Bot";

        const stats = withPlayerSlayerStatDisplays(values, coreStats);
        this.addObjectiveDisplays(stats, objectiveSummary);
        const outputStats = this.transformStats(calculated.bestValues, team.bestPlayerValues, stats);
        const gamesInfo =
          gamesPlayed < matches.length ? ` (${gamesPlayed.toString()}/${matches.length.toString()} games)` : "";

        playerStats.push({
          name: `${playerGamertag}${gamesInfo}`,
          values: outputStats,
          medals: extractMedals(coreStats, medalMetadata),
        });
      }

      results.push({
        teamId: team.teamId,
        teamStats: [],
        players: playerStats,
        teamMedals: aggregateSharedTeamMedals(playerStats),
      });
    }

    return results;
  }

  private addObjectiveDisplays(stats: StatsCollection, summary: PlayerObjectiveSummary | null): void {
    if (summary == null) {
      return;
    }
    const time = stats.get("Objective time");
    const contribution = stats.get("Team objective contribution");
    if (time) {
      stats.set("Objective time", {
        ...time,
        display: getReadableDuration(getDurationInIsoString(summary.objectiveTimeSeconds)),
      });
    }
    if (contribution) {
      stats.set("Team objective contribution", {
        ...contribution,
        display:
          summary.objectiveTeamContribution == null
            ? "n/a"
            : `${(summary.objectiveTeamContribution * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`,
      });
    }
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
