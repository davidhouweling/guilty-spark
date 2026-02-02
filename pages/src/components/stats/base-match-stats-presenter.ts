import type { MatchStats, Stats } from "halo-infinite-api";
import * as tinyduration from "tinyduration";
import { Preconditions } from "../../base/preconditions.mts";
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
          display: `${this.formatStatValue(CoreStats.Accuracy)}%`,
        },
      ],
      ["Damage dealt", { value: CoreStats.DamageDealt, sortBy: StatsValueSortBy.DESC }],
      ["Damage taken", { value: CoreStats.DamageTaken, sortBy: StatsValueSortBy.ASC }],
      [
        "Damage ratio",
        {
          value:
            CoreStats.DamageDealt === 0
              ? 0
              : CoreStats.DamageTaken === 0
                ? Number.POSITIVE_INFINITY
                : CoreStats.DamageDealt / CoreStats.DamageTaken,
          sortBy: StatsValueSortBy.DESC,
          display: this.formatDamageRatio(CoreStats.DamageDealt, CoreStats.DamageTaken),
        },
      ],
      [
        "Avg life time",
        {
          value: this.getDurationInSeconds(CoreStats.AverageLifeDuration),
          sortBy: StatsValueSortBy.DESC,
          display: this.getReadableDuration(CoreStats.AverageLifeDuration),
        },
      ],
      [
        "Avg damage per life",
        {
          value:
            CoreStats.DamageDealt === 0
              ? 0
              : CoreStats.Deaths === 0
                ? Number.POSITIVE_INFINITY
                : CoreStats.DamageDealt / CoreStats.Deaths,
          sortBy: StatsValueSortBy.DESC,
          display: this.formatDamageRatio(CoreStats.DamageDealt, CoreStats.Deaths),
        },
      ],
    ]);
  }

  getData(match: MatchStats, players: Map<string, string>): MatchStatsData[] {
    const results: MatchStatsData[] = [];

    const teamsStats = new Map<number, StatsCollection>(
      match.Teams.map((team) => [
        team.TeamId,
        new Map([...this.getPlayerSlayerStats(team.Stats, team.Rank), ...this.getPlayerObjectiveStats(team.Stats)]),
      ]),
    );

    const playersStats = new Map<string, StatsCollection>(
      match.Players.map((player) => {
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

        const outputStats = this.transformStats(
          matchBestPlayerValues,
          teamBestValues,
          Preconditions.checkExists(playersStats.get(teamPlayer.PlayerId)),
        );
        playerStats.push({
          name: playerGamertag,
          values: outputStats,
        });
      }

      results.push({
        teamId: team.TeamId,
        teamStats: this.transformTeamStats(matchBestTeamValues, teamStats),
        players: playerStats,
      });
    }
    return results;
  }

  protected getDurationInSeconds(duration: string): number {
    const parsedDuration = tinyduration.parse(duration);
    return parseFloat(
      (
        (parsedDuration.days ?? 0) * 86400 +
        (parsedDuration.hours ?? 0) * 3600 +
        (parsedDuration.minutes ?? 0) * 60 +
        (parsedDuration.seconds ?? 0)
      ).toFixed(1),
    );
  }

  protected getReadableDuration(duration: string): string {
    const parsedDuration = tinyduration.parse(duration);
    const { days, hours, minutes, seconds } = parsedDuration;
    const output: string[] = [];
    if (days != null && days > 0) {
      output.push(`${days.toLocaleString()}d`);
    }
    if (hours != null && hours > 0) {
      output.push(`${hours.toLocaleString()}h`);
    }
    if (minutes != null && minutes > 0) {
      output.push(`${minutes.toLocaleString()}m`);
    }
    if (seconds != null && seconds > 0) {
      output.push(`${Math.floor(seconds).toLocaleString()}s`);
    }

    return output.length ? output.join(" ") : "0s";
  }

  private formatStatValue(statValue: number): string {
    return Number.isSafeInteger(statValue) ? statValue.toLocaleString() : Number(statValue.toFixed(2)).toLocaleString();
  }

  private formatDamageRatio(damageDealt: number, damageTaken: number): string {
    if (damageDealt === 0) {
      return "0";
    }

    if (damageTaken === 0) {
      return "♾️";
    }

    return this.formatStatValue(damageDealt / damageTaken);
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
      display: display ?? this.formatStatValue(statValue),
    };
  }
}
