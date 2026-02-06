import type { MatchStats, Stats } from "halo-infinite-api";
import * as tinyduration from "tinyduration";
import { Preconditions } from "../../base/preconditions.mts";
import { BaseSeriesStatsPresenter } from "./base-series-stats-presenter";
import type { MatchStatsData, MatchStatsPlayerData, MatchStatsValues, StatsCollection, StatsValue } from "./types";
import { StatsValueSortBy } from "./types";

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

    const bestTeamValues = this.getBestStatValues(teamStats);
    const playersCoreStats = this.aggregatePlayerCoreStats(matches);

    for (const team of firstMatch.Teams) {
      const stats = Preconditions.checkExists(teamStats.get(team.TeamId));
      const teamPlayers = this.getTeamPlayersFromMatches(matches, team);

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
        teamMedals: this.aggregateTeamMedals(playerStats),
      });
    }

    return results;
  }

  private getTeamSlayerStats(stats: Stats): StatsCollection {
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

        const mergedStats = this.mergeCoreStats(Preconditions.checkExists(teamCoreStats.get(TeamId)), CoreStats);
        teamCoreStats.set(TeamId, mergedStats);
      }
    }

    // adjust some of the values which should be averages rather than sums
    for (const [teamId, stats] of teamCoreStats.entries()) {
      teamCoreStats.set(teamId, this.adjustAveragesInCoreStats(stats, matches.length));
    }

    return teamCoreStats;
  }

  private getBestStatValues(teamStats: Map<number, StatsCollection>): Map<string, number> {
    const bestValues = new Map<string, number>();
    for (const statsCollection of teamStats.values()) {
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
