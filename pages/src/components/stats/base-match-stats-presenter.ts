import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getDurationInSeconds, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { formatDamageRatio, formatStatValue, getSafeRatioValue } from "@guilty-spark/shared/halo/stat-formatting";
import { aggregateTeamMedals as aggregateSharedTeamMedals } from "@guilty-spark/shared/halo/medals";
import type { MatchStatsData, MatchStatsPlayerData, MatchStatsValues, StatsCollection, StatsValue } from "./types";
import { StatsValueSortBy } from "./types";

export abstract class BaseMatchStatsPresenter {
  protected abstract getPlayerObjectiveStats(stats: Stats): StatsCollection;

  protected getPlayerSlayerStats(stats: Stats, rank: number): StatsCollection {
    const { CoreStats } = stats;

    return new Map([
      ["Rank", { value: rank, sortBy: StatsValueSortBy.ASC }],
      ["Score", { value: CoreStats.PersonalScore, sortBy: StatsValueSortBy.DESC }],
      ["Kills", { value: CoreStats.Kills, sortBy: StatsValueSortBy.DESC }],
      ["Deaths", { value: CoreStats.Deaths, sortBy: StatsValueSortBy.ASC }],
      ["Assists", { value: CoreStats.Assists, sortBy: StatsValueSortBy.DESC }],
      ["KDA", { value: CoreStats.KDA, sortBy: StatsValueSortBy.DESC }],
      ["Headshot kills", { value: CoreStats.HeadshotKills, sortBy: StatsValueSortBy.DESC }],
      ["Shots hit", { value: CoreStats.ShotsHit, sortBy: StatsValueSortBy.DESC }],
      ["Shots fired", { value: CoreStats.ShotsFired, sortBy: StatsValueSortBy.DESC }],
      [
        "Accuracy",
        {
          value: CoreStats.Accuracy,
          sortBy: StatsValueSortBy.DESC,
          display: `${formatStatValue(CoreStats.Accuracy)}%`,
        },
      ],
      ["Damage dealt", { value: CoreStats.DamageDealt, sortBy: StatsValueSortBy.DESC }],
      ["Damage taken", { value: CoreStats.DamageTaken, sortBy: StatsValueSortBy.ASC }],
      [
        "Damage ratio",
        {
          value: getSafeRatioValue(CoreStats.DamageDealt, CoreStats.DamageTaken),
          sortBy: StatsValueSortBy.DESC,
          display: formatDamageRatio(CoreStats.DamageDealt, CoreStats.DamageTaken),
        },
      ],
      [
        "Avg life time",
        {
          value: getDurationInSeconds(CoreStats.AverageLifeDuration),
          sortBy: StatsValueSortBy.DESC,
          display: getReadableDuration(CoreStats.AverageLifeDuration),
        },
      ],
      [
        "Avg damage per life",
        {
          value: getSafeRatioValue(CoreStats.DamageDealt, CoreStats.Deaths),
          sortBy: StatsValueSortBy.DESC,
          display: formatDamageRatio(CoreStats.DamageDealt, CoreStats.Deaths),
        },
      ],
    ]);
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

    const matchBestTeamValues = this.getBestStatValues(teamsStats);
    const matchBestPlayerValues = this.getBestStatValues(playersStats);

    for (const team of match.Teams) {
      const teamPlayers = this.getTeamPlayers([match], team);
      const teamBestValues = this.getBestTeamStatValues(playersStats, teamPlayers);
      const teamStats = new Map([
        ...this.getPlayerSlayerStats(team.Stats, team.Rank),
        ...this.getPlayerObjectiveStats(team.Stats),
      ]);

      const playerStats: MatchStatsPlayerData[] = [];
      for (const teamPlayer of teamPlayers) {
        const playerXuid = this.getPlayerXuid(teamPlayer);
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

  private getBestStatValues(playersStats: Map<string | number, StatsCollection>): Map<string, number> {
    const bestValues = new Map<string, number>();
    for (const embedPlayerStats of playersStats.values()) {
      for (const [key, playerStats] of embedPlayerStats.entries()) {
        const previousBestValue = bestValues.get(key);

        if (previousBestValue == null) {
          bestValues.set(key, playerStats.value);
          continue;
        }

        bestValues.set(
          key,
          playerStats.sortBy === StatsValueSortBy.ASC
            ? Math.min(previousBestValue, playerStats.value)
            : Math.max(previousBestValue, playerStats.value),
        );
      }
    }

    return bestValues;
  }

  private getBestTeamStatValues(
    playersStats: Map<string, StatsCollection>,
    teamPlayers: MatchStats["Players"],
  ): Map<string, number> {
    const teamPlayersStats = new Map<string, StatsCollection>();
    for (const teamPlayer of teamPlayers) {
      const playerStats = Preconditions.checkExists(playersStats.get(teamPlayer.PlayerId));
      teamPlayersStats.set(teamPlayer.PlayerId, playerStats);
    }

    return this.getBestStatValues(teamPlayersStats);
  }

  private getTeamPlayers(matches: MatchStats[], team: MatchStats["Teams"][0]): MatchStats["Players"] {
    const uniquePlayersMap = new Map<string, MatchStats["Players"][0]>();
    for (const match of matches) {
      for (const player of match.Players) {
        if (!player.ParticipationInfo.PresentAtBeginning) {
          continue;
        }

        if (!uniquePlayersMap.has(player.PlayerId)) {
          uniquePlayersMap.set(player.PlayerId, player);
        }
      }
    }

    return Array.from(uniquePlayersMap.values())
      .filter((player): boolean => player.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId) != null)
      .sort((a, b) => {
        const rankCalc = a.Rank - b.Rank;
        if (rankCalc !== 0) {
          return rankCalc;
        }

        const aStats = Preconditions.checkExists(
          a.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
        );
        const bStats = Preconditions.checkExists(
          b.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
        );

        const scoreCalc = bStats.Stats.CoreStats.Score - aStats.Stats.CoreStats.Score;
        if (scoreCalc !== 0) {
          return scoreCalc;
        }

        return bStats.Stats.CoreStats.PersonalScore - aStats.Stats.CoreStats.PersonalScore;
      });
  }

  private getPlayerXuid(player: Pick<MatchStats["Players"][0], "PlayerId">): string {
    return player.PlayerId.replace(/^xuid\((\d+)\)$/, "$1");
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
