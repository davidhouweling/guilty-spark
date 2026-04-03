import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  mergeCoreStats as mergeSharedCoreStats,
  adjustAveragesInCoreStats as adjustSharedCoreStatsAverages,
} from "@guilty-spark/shared/halo/series-core-stats";
import { formatStatValue } from "@guilty-spark/shared/halo/stat-formatting";
import type { StatsCollection, StatsValue } from "@guilty-spark/shared/halo/types";
import { aggregateTeamMedals as aggregateSharedTeamMedals } from "@guilty-spark/shared/halo/medals";
import { getPlayerSlayerStats as getSharedPlayerSlayerStats } from "@guilty-spark/shared/halo/slayer-stats";
import { getBestStatValues, getPlayerXuid, getTeamPlayersFromMatches } from "@guilty-spark/shared/halo/match-utils";
import { BaseSeriesStatsPresenter } from "./base-series-stats-presenter";
import type { MatchStatsData, MatchStatsPlayerData, MatchStatsValues } from "./types";

export class SeriesTeamStatsPresenter extends BaseSeriesStatsPresenter {
  getSeriesData(
    matches: MatchStats[],
    players: Map<string, string>,
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): MatchStatsData[] {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const results: MatchStatsData[] = [];

    const teamCoreStats = this.aggregateTeamCoreStats(matches);
    const teamStats = new Map<number, StatsCollection>();
    for (const [teamId, stats] of teamCoreStats) {
      teamStats.set(teamId, this.getTeamSlayerStats({ CoreStats: stats }));
    }

    const bestTeamValues = getBestStatValues(teamStats);
    const playersCoreStats = this.aggregatePlayerCoreStats(matches);

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
          medals: this.extractMedals(playerCoreStats, medalMetadata),
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

  private getTeamSlayerStats(stats: Stats): StatsCollection {
    return getSharedPlayerSlayerStats(stats.CoreStats);
  }

  private aggregateTeamCoreStats(matches: MatchStats[]): Map<number, Stats["CoreStats"]> {
    const teamCoreStats = new Map<number, Stats["CoreStats"]>();
    for (const match of matches) {
      for (const team of match.Teams) {
        const { TeamId } = team;
        const { CoreStats } = team.Stats;
        if (!teamCoreStats.has(TeamId)) {
          teamCoreStats.set(TeamId, CoreStats);
          continue;
        }

        const mergedStats = mergeSharedCoreStats(Preconditions.checkExists(teamCoreStats.get(TeamId)), CoreStats);
        teamCoreStats.set(TeamId, mergedStats);
      }
    }

    // adjust some of the values which should be averages rather than sums
    for (const [teamId, stats] of teamCoreStats.entries()) {
      teamCoreStats.set(teamId, adjustSharedCoreStatsAverages(stats, matches.length));
    }

    return teamCoreStats;
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
    const { value: statValue, display } = value;

    return {
      name: key,
      value: statValue,
      bestInTeam: teamBestValues.get(key) === statValue,
      bestInMatch: matchBestValues.get(key) === statValue,
      display: display ?? formatStatValue(statValue),
    };
  }

  private extractMedals(
    coreStats: Stats["CoreStats"],
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): {
    name: string;
    count: number;
    sortingWeight: number;
  }[] {
    return coreStats.Medals.map((medal) => {
      const metadata = medalMetadata?.[medal.NameId];
      return {
        name: metadata?.name ?? medal.NameId.toString(),
        count: medal.Count,
        sortingWeight: metadata?.sortingWeight ?? medal.TotalPersonalScoreAwarded,
      };
    }).sort((a, b) => b.sortingWeight - a.sortingWeight);
  }
}
