import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { formatStatValue } from "@guilty-spark/shared/halo/stat-formatting";
import { aggregateTeamMedals as aggregateSharedTeamMedals } from "@guilty-spark/shared/halo/medals";
import { getPlayerSlayerStats as getSharedPlayerSlayerStats } from "@guilty-spark/shared/halo/slayer-stats";
import type { StatsCollection, StatsValue } from "@guilty-spark/shared/halo/types";
import {
  getPlayerXuid,
  getTeamPlayersFromMatches,
  getBestStatValues,
  getBestTeamStatValues,
} from "@guilty-spark/shared/halo/match-stats";
import type { MatchStatsData, MatchStatsPlayerData, MatchStatsValues } from "./types";

export abstract class BaseMatchStatsPresenter {
  protected abstract getPlayerObjectiveStats(stats: Stats): StatsCollection;

  protected getPlayerSlayerStats(stats: Stats, rank: number): StatsCollection {
    return getSharedPlayerSlayerStats(stats.CoreStats, { includeRank: true, rank });
  }

  getData(
    match: MatchStats,
    players: Map<string, string>,
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): MatchStatsData[] {
    const results: MatchStatsData[] = [];

    const teamsStats = new Map<number, StatsCollection>(
      match.Teams.map((team) => [
        team.TeamId,
        new Map([...this.getPlayerSlayerStats(team.Stats, team.Rank), ...this.getPlayerObjectiveStats(team.Stats)]),
      ]),
    );

    const playersStats = new Map<string, StatsCollection>(
      match.Players.filter((player) => player.ParticipationInfo.PresentAtBeginning).map((player) => {
        const stats = Preconditions.checkExists(player.PlayerTeamStats[0]);

        return [
          player.PlayerId,
          new Map([
            ...this.getPlayerSlayerStats(stats.Stats, player.Rank),
            ...this.getPlayerObjectiveStats(stats.Stats),
          ]),
        ];
      }),
    );

    const matchBestTeamValues = getBestStatValues(teamsStats);
    const matchBestPlayerValues = getBestStatValues(playersStats);

    for (const team of match.Teams) {
      const teamPlayers = getTeamPlayersFromMatches([match], team);
      const teamBestValues = getBestTeamStatValues(playersStats, teamPlayers);
      const teamStats = new Map([
        ...this.getPlayerSlayerStats(team.Stats, team.Rank),
        ...this.getPlayerObjectiveStats(team.Stats),
      ]);

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

        const playerTeamStats = Preconditions.checkExists(
          teamPlayer.PlayerTeamStats.find((pts) => pts.TeamId === team.TeamId),
        );

        const outputStats = this.transformStats(
          matchBestPlayerValues,
          teamBestValues,
          Preconditions.checkExists(playersStats.get(teamPlayer.PlayerId)),
        );
        playerStats.push({
          name: playerGamertag,
          values: outputStats,
          medals: this.extractMedals(playerTeamStats.Stats.CoreStats, medalMetadata),
        });
      }

      results.push({
        teamId: team.TeamId,
        teamStats: this.transformTeamStats(matchBestTeamValues, teamStats),
        players: playerStats,
        teamMedals: aggregateSharedTeamMedals(playerStats),
      });
    }
    return results;
  }

  private extractMedals(
    coreStats: MatchStats["Teams"][0]["Stats"]["CoreStats"],
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
    const { value: statValue, display } = value;

    return {
      name: key,
      value: statValue,
      bestInTeam: teamBestValues.get(key) === statValue,
      bestInMatch: matchBestValues.get(key) === statValue,
      display: display ?? formatStatValue(statValue),
    };
  }
}
