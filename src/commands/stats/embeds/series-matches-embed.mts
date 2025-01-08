import type { GameVariantCategory, MatchStats, Stats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
import { Preconditions } from "../../../base/preconditions.mjs";
import type { EmbedPlayerStats, PlayerTeamStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class SeriesMatchesEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerSlayer> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async getEmbed(_match: MatchStats, _players: Map<string, string>): Promise<APIEmbed> {
    return Promise.reject(new Error("Series matches embed does not support single match, use getSeriesEmbed instead"));
  }

  override getPlayerObjectiveStats(): EmbedPlayerStats {
    return new Map([]);
  }

  async getSeriesEmbed(matches: MatchStats[], players: Map<string, string>, locale: string): Promise<APIEmbed> {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const embed: APIEmbed = {
      title: "Accumulated Series Stats",
      description: "-# Legend: **Best in team** | __**Best overall**__",
      fields: [],
    };

    const teamCoreStats = this.aggregateTeamCoreStats(matches);

    const playersCoreStats = this.aggregatePlayerCoreStats(matches);
    const playersStats = new Map<string, EmbedPlayerStats>();
    for (const [playerId, stats] of playersCoreStats) {
      playersStats.set(playerId, this.getPlayerSlayerStats({ CoreStats: stats }));
    }

    const matchBestValues = this.getBestStatValues(playersStats);

    for (const team of firstMatch.Teams) {
      const teamPlayers = this.getTeamPlayers(firstMatch, team).sort(
        (a, b) =>
          Preconditions.checkExists(playersCoreStats.get(b.PlayerId)).PersonalScore -
          Preconditions.checkExists(playersCoreStats.get(a.PlayerId)).PersonalScore,
      );
      const teamBestValues = this.getBestTeamStatValues(playersStats, teamPlayers);

      const teamStats = Preconditions.checkExists(teamCoreStats.get(team.TeamId));
      const teamScore = teamStats.PersonalScore.toLocaleString(locale);
      const kills = teamStats.Kills.toLocaleString(locale);
      const deaths = teamStats.Deaths.toLocaleString(locale);
      const assists = teamStats.Assists.toLocaleString(locale);
      embed.fields?.push({
        name: this.haloService.getTeamName(team.TeamId),
        value: `Score: ${teamScore} | K:D:A: ${kills}:${deaths}:${assists}`,
        inline: false,
      });

      let playerFields = [];
      for (const teamPlayer of teamPlayers) {
        const playerXuid = this.haloService.getPlayerXuid(teamPlayer);
        const playerGamertag =
          teamPlayer.PlayerType === 1
            ? Preconditions.checkExists(
                players.get(playerXuid),
                `Unable to find player gamertag for XUID ${playerXuid}`,
              )
            : "Bot";
        const playerCoreStats = Preconditions.checkExists(playersCoreStats.get(teamPlayer.PlayerId));
        const playerStats = Preconditions.checkExists(playersStats.get(teamPlayer.PlayerId));

        const outputStats = this.playerStatsToFields(matchBestValues, teamBestValues, playerStats);
        const medals = await this.playerMedalsToFields(playerCoreStats);
        const output = `${outputStats.join("\n")}${medals ? `\n${medals}` : ""}`;
        const personalScore = playerCoreStats.PersonalScore.toLocaleString(locale);

        playerFields.push({
          name: `${playerGamertag} (Acc Score: ${personalScore})`,
          value: output,
          inline: true,
        });

        // If two players are added, or if it's the last player, push to embed and reset
        if (playerFields.length === 2 || teamPlayer === teamPlayers[teamPlayers.length - 1]) {
          embed.fields?.push(...playerFields);
          playerFields = [];

          // Adds a new row
          embed.fields?.push({
            name: "\n",
            value: "\n",
            inline: false,
          });
        }
      }
    }

    return embed;
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
    for (const [playerId, stats] of teamCoreStats.entries()) {
      teamCoreStats.set(playerId, this.adjustAveragesInCoreStats(stats, matches.length));
    }

    return teamCoreStats;
  }

  private aggregatePlayerCoreStats(matches: MatchStats[]): Map<string, Stats["CoreStats"]> {
    const playerCoreStats = new Map<string, Stats["CoreStats"]>();
    for (const match of matches) {
      for (const player of match.Players) {
        const { PlayerId } = player;
        const stats = Preconditions.checkExists(player.PlayerTeamStats[0]) as PlayerTeamStats<GameVariantCategory>;
        const { CoreStats } = stats.Stats;

        if (!playerCoreStats.has(PlayerId)) {
          playerCoreStats.set(PlayerId, CoreStats);
          continue;
        }

        const mergedStats = this.mergeCoreStats(Preconditions.checkExists(playerCoreStats.get(PlayerId)), CoreStats);
        playerCoreStats.set(PlayerId, mergedStats);
      }
    }

    // adjust some of the values which should be averages rather than sums
    for (const [playerId, stats] of playerCoreStats.entries()) {
      playerCoreStats.set(playerId, this.adjustAveragesInCoreStats(stats, matches.length));
    }

    return playerCoreStats;
  }

  private mergeCoreStats(
    existingCoreStats: Stats["CoreStats"],
    incomingCoreStats: Stats["CoreStats"],
  ): Stats["CoreStats"] {
    let mergedCoreStats: Stats["CoreStats"] = { ...existingCoreStats };
    for (const [key, value] of Object.entries(incomingCoreStats)) {
      const castKey = key as keyof Stats["CoreStats"];

      if (castKey === "Medals" || castKey === "PersonalScores") {
        const existingStatMap = new Map(mergedCoreStats[castKey].map((stat) => [stat.NameId, stat]));
        const castValue = value as Stats["CoreStats"]["Medals"];
        for (const statValue of castValue) {
          const existingStat = existingStatMap.get(statValue.NameId);
          if (existingStat) {
            existingStatMap.set(statValue.NameId, {
              ...existingStat,
              Count: existingStat.Count + statValue.Count,
              TotalPersonalScoreAwarded: existingStat.TotalPersonalScoreAwarded + statValue.TotalPersonalScoreAwarded,
            });
          } else {
            existingStatMap.set(statValue.NameId, statValue);
          }
        }

        mergedCoreStats = {
          ...mergedCoreStats,
          [castKey]: Array.from(existingStatMap.values()),
        };
      } else if (castKey === "AverageLifeDuration") {
        mergedCoreStats = {
          ...mergedCoreStats,
          [castKey]: [mergedCoreStats[castKey], value].join(","),
        };
      } else if (typeof value === "number" && typeof mergedCoreStats[castKey] === "number") {
        mergedCoreStats = {
          ...mergedCoreStats,
          [castKey]: mergedCoreStats[castKey] + value,
        };
      } else {
        throw new Error(`Invalid type for key ${key}`);
      }
    }

    return mergedCoreStats;
  }

  private adjustAveragesInCoreStats(coreStats: Stats["CoreStats"], matches: number): Stats["CoreStats"] {
    return {
      ...coreStats,
      Accuracy: coreStats.Accuracy / matches,
    };
  }
}
