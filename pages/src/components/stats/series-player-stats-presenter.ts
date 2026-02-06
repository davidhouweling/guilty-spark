import type { MatchStats, Stats } from "halo-infinite-api";
import * as tinyduration from "tinyduration";
import { Preconditions } from "../../base/preconditions.mts";
import { BaseSeriesStatsPresenter } from "./base-series-stats-presenter";
import type { MatchStatsData, MatchStatsPlayerData, StatsCollection, StatsValue } from "./types";
import { StatsValueSortBy } from "./types";

export class SeriesPlayerStatsPresenter extends BaseSeriesStatsPresenter {
  getSeriesData(
    matches: MatchStats[],
    players: Map<string, string>,
    medalMetadata?: Record<number, { name: string; sortingWeight: number }>,
  ): MatchStatsData[] {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const results: MatchStatsData[] = [];

    const playerMatches = this.getPlayerMatches(matches);
    const playersCoreStats = this.aggregatePlayerCoreStats(matches);
    const playersStats = new Map<string, StatsCollection>();
    for (const [playerId, stats] of playersCoreStats) {
      playersStats.set(playerId, this.getPlayerSlayerStats({ CoreStats: stats }));
    }

    const seriesBestValues = this.getBestStatValues(playersStats);

    for (const team of firstMatch.Teams) {
      const teamPlayers = this.getTeamPlayersFromMatches(matches, team).sort(
        (a, b) =>
          Preconditions.checkExists(playersCoreStats.get(b.PlayerId)).PersonalScore -
          Preconditions.checkExists(playersCoreStats.get(a.PlayerId)).PersonalScore,
      );
      const teamBestValues = this.getBestTeamStatValues(playersStats, teamPlayers);

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
        teamMedals: this.aggregateTeamMedals(playerStats),
      });
    }

    return results;
  }

  private getPlayerMatches(matches: MatchStats[]): Map<string, MatchStats[]> {
    const playerMatches = new Map<string, MatchStats[]>();
    for (const match of matches) {
      for (const player of match.Players) {
        if (!player.ParticipationInfo.PresentAtBeginning) {
          continue;
        }

        const pm = playerMatches.get(player.PlayerId) ?? [];
        pm.push(match);
        playerMatches.set(player.PlayerId, pm);
      }
    }

    return playerMatches;
  }

  private getPlayerSlayerStats(stats: Stats): StatsCollection {
    const { CoreStats } = stats;

    return new Map([
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

  private getReadableDuration(duration: string): string {
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

  private getBestStatValues(playersStats: Map<string, StatsCollection>): Map<string, number> {
    const bestValues = new Map<string, number>();
    for (const statsCollection of playersStats.values()) {
      for (const [key, playerStats] of statsCollection.entries()) {
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
      display: display ?? this.formatStatValue(statValue),
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
