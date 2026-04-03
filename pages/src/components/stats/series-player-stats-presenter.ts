import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { formatStatValue } from "@guilty-spark/shared/halo/stat-formatting";
import type { StatsCollection, StatsValue } from "@guilty-spark/shared/halo/types";
import { aggregateTeamMedals as aggregateSharedTeamMedals } from "@guilty-spark/shared/halo/medals";
import {
  getPlayerMatches as getSharedPlayerMatches,
  getSeriesTeamPlayersFromMatches,
} from "@guilty-spark/shared/halo/series-player";
import { getPlayerSlayerStats as getSharedPlayerSlayerStats } from "@guilty-spark/shared/halo/slayer-stats";
import { getBestStatValues, getBestTeamStatValues, getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { BaseSeriesStatsPresenter } from "./base-series-stats-presenter";
import type { MatchStatsData, MatchStatsPlayerData } from "./types";

export class SeriesPlayerStatsPresenter extends BaseSeriesStatsPresenter {
  getSeriesData(
    matches: MatchStats[],
    players: Map<string, string>,
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): MatchStatsData[] {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const results: MatchStatsData[] = [];

    const playerMatches = getSharedPlayerMatches(matches);
    const playersCoreStats = this.aggregatePlayerCoreStats(matches);
    const playersStats = new Map<string, StatsCollection>();
    for (const [playerId, stats] of playersCoreStats) {
      playersStats.set(playerId, this.getPlayerSlayerStats({ CoreStats: stats }));
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
          medals: this.extractMedals(playerCoreStats, medalMetadata),
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

  private getPlayerSlayerStats(stats: Stats): StatsCollection {
    return getSharedPlayerSlayerStats(stats.CoreStats);
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
