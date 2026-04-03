import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getDurationInSeconds, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { formatDamageRatio, formatStatValue, getSafeRatioValue } from "@guilty-spark/shared/halo/stat-formatting";
import { aggregateTeamMedals as aggregateSharedTeamMedals } from "@guilty-spark/shared/halo/medals";
import {
  getPlayerXuid,
  getTeamPlayersFromMatches,
  getBestStatValues,
  getBestTeamStatValues,
} from "@guilty-spark/shared/halo/match-utils";
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
