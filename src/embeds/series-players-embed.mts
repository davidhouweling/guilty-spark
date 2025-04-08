import type { GameVariantCategory, MatchStats, Stats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
import { Preconditions } from "../base/preconditions.mjs";
import type { EmbedPlayerStats, PlayerTeamStats } from "./base-match-embed.mjs";
import { BaseSeriesEmbed } from "./base-series-embed.mjs";

export class SeriesPlayersEmbed extends BaseSeriesEmbed {
  async getSeriesEmbed(matches: MatchStats[], players: Map<string, string>, locale: string): Promise<APIEmbed> {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const embed: APIEmbed = {
      title: "Accumulated Series Stats by Players",
      description: "-# Legend: **Best in team** | __**Best overall**__",
      fields: [],
    };

    const playersCoreStats = this.aggregatePlayerCoreStats(matches);
    const playersStats = new Map<string, EmbedPlayerStats>();
    for (const [playerId, stats] of playersCoreStats) {
      playersStats.set(playerId, this.getPlayerSlayerStats({ CoreStats: stats }));
    }

    const seriesBestValues = this.getBestStatValues(playersStats);

    for (const team of firstMatch.Teams) {
      const teamPlayers = this.getTeamPlayers(firstMatch, team).sort(
        (a, b) =>
          Preconditions.checkExists(playersCoreStats.get(b.PlayerId)).PersonalScore -
          Preconditions.checkExists(playersCoreStats.get(a.PlayerId)).PersonalScore,
      );
      const teamBestValues = this.getBestTeamStatValues(playersStats, teamPlayers);

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

        const outputStats = this.playerStatsToFields(seriesBestValues, teamBestValues, playerStats);
        const medals = this.guildConfig.Medals === "Y" ? await this.playerMedalsToFields(playerCoreStats) : "";
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
}
