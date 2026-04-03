import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getDurationInSeconds, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import {
  mergeCoreStats as mergeSharedCoreStats,
  adjustAveragesInCoreStats as adjustSharedCoreStatsAverages,
} from "@guilty-spark/shared/halo/series-core-stats";
import { formatDamageRatio, formatStatValue, getSafeRatioValue } from "@guilty-spark/shared/halo/stat-formatting";
import { aggregateTeamMedals as aggregateSharedTeamMedals } from "@guilty-spark/shared/halo/medals";
import { getBestStatValues, getPlayerXuid, getTeamPlayersFromMatches } from "@guilty-spark/shared/halo/match-utils";
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
