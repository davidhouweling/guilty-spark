import type { MatchStats, Stats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aggregateTeamCoreStats } from "@guilty-spark/shared/halo/series-team";
import { BaseSeriesEmbed } from "./base-series-embed";
import type { EmbedPlayerStats } from "./base-match-embed";

export class SeriesTeamsEmbed extends BaseSeriesEmbed {
  async getSeriesEmbed(matches: MatchStats[]): Promise<APIEmbed> {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const embed: APIEmbed = {
      title: "Accumulated Series Stats by Team",
      fields: [],
    };

    const teamCoreStats = aggregateTeamCoreStats(matches);
    const bestCoreStats = this.getBestTeamSeriesStatValues(teamCoreStats);

    let teamFields = [];
    for (const team of firstMatch.Teams) {
      const teamStats = Preconditions.checkExists(teamCoreStats.get(team.TeamId));
      const mappedStats = this.getPlayerSlayerStats({ CoreStats: teamStats });
      const teamOutput = this.playerStatsToFields(bestCoreStats, new Map(), mappedStats);

      const medals = this.guildConfig.Medals === "Y" ? await this.playerMedalsToFields(teamStats) : "";
      if (medals) {
        teamOutput.push(medals);
      }

      let output = teamOutput.join("\n");
      if (output.length > 1024) {
        // truncate text back to the last whitespace
        const lastWhitespaceIndex = output.lastIndexOf(" ", 1021); // Reserve 3 characters for "..."
        output = output.substring(0, lastWhitespaceIndex) + "...";
      }

      teamFields.push({
        name: this.haloService.getTeamName(team.TeamId),
        value: output,
        inline: true,
      });

      // If two teams are added, or if it's the last team, push to embed and reset
      if (teamFields.length === 2 || team === firstMatch.Teams[firstMatch.Teams.length - 1]) {
        embed.fields?.push(...teamFields);
        teamFields = [];

        // Adds a new row
        embed.fields?.push({
          name: "\n",
          value: "\n",
          inline: false,
        });
      }
    }

    return embed;
  }

  private getBestTeamSeriesStatValues(teamCoreStats: Map<number, Stats["CoreStats"]>): Map<string, number | number[]> {
    const teamStats = new Map<number, EmbedPlayerStats>();
    for (const [teamId, stats] of teamCoreStats) {
      teamStats.set(teamId, this.getPlayerSlayerStats({ CoreStats: stats }));
    }

    const bestValues = super.getBestStatValues(teamStats);

    return bestValues;
  }
}
