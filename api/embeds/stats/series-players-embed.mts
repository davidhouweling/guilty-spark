import type { MatchStats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import {
  aggregatePlayerCoreStats,
  getPlayerMatches,
  getSeriesTeamPlayersFromMatches,
} from "@guilty-spark/shared/halo/series-player";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseSeriesEmbed } from "./base-series-embed.mjs";

export class SeriesPlayersEmbed extends BaseSeriesEmbed {
  async getSeriesEmbed(matches: MatchStats[], players: Map<string, string>, locale: string): Promise<APIEmbed[]> {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const embeds: APIEmbed[] = [];

    const playerMatches = getPlayerMatches(matches);
    const playersCoreStats = aggregatePlayerCoreStats(matches);
    const playersStats = new Map<string, EmbedPlayerStats>();
    for (const [playerId, stats] of playersCoreStats) {
      playersStats.set(playerId, this.getPlayerSlayerStats({ CoreStats: stats }));
    }

    const seriesBestValues = this.getBestStatValues(playersStats);

    for (const team of firstMatch.Teams) {
      const embed: APIEmbed = {
        title: `Accumulated Series Stats by Players for ${this.haloService.getTeamName(team.TeamId)}`,
        description: "-# Legend: **Best in team** | __**Best overall**__",
        fields: [],
      };

      const teamPlayers = getSeriesTeamPlayersFromMatches(matches, team, playersCoreStats);
      const teamBestValues = this.getBestTeamStatValues(playersStats, teamPlayers);

      let playerFields = [];
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
        const playerStats = Preconditions.checkExists(playersStats.get(teamPlayer.PlayerId));

        const outputStats = this.playerStatsToFields(seriesBestValues, teamBestValues, playerStats);
        const medals = this.guildConfig.Medals === "Y" ? await this.playerMedalsToFields(playerCoreStats) : "";

        let output = `${outputStats.join("\n")}${medals ? `\n${medals}` : ""}`;
        if (output.length > 950) {
          // truncate text back to the last whitespace

          const lastWhitespaceIndex = output.lastIndexOf(" ", 950 - 3); // Reserve 3 characters for "..."
          output = output.substring(0, lastWhitespaceIndex) + "...";
        }

        const personalScore = playerCoreStats.PersonalScore.toLocaleString(locale);
        const playedGames = playerMatches.get(teamPlayer.PlayerId)?.length ?? 0;
        const games =
          playedGames < matches.length
            ? `, ${playedGames.toLocaleString(locale)}/${matches.length.toLocaleString(locale)} games`
            : "";

        playerFields.push({
          name: `${playerGamertag} (Acc Score: ${personalScore}${games})`,
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

      embeds.push(embed);
    }

    return embeds;
  }
}
