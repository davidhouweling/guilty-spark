import type { MatchStats, Stats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
import { Preconditions } from "../../base/preconditions.mjs";
import { BaseSeriesEmbed } from "./base-series-embed.mjs";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";

export class SeriesTeamsEmbed extends BaseSeriesEmbed {
  async getSeriesEmbed(matches: MatchStats[]): Promise<APIEmbed> {
    const firstMatch = Preconditions.checkExists(matches[0], "No matches found");
    const embed: APIEmbed = {
      title: "Accumulated Series Stats by Team",
      fields: [],
    };

    const teamCoreStats = this.aggregateTeamCoreStats(matches);
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

  private getBestTeamSeriesStatValues(teamCoreStats: Map<number, Stats["CoreStats"]>): Map<string, number | number[]> {
    const teamStats = new Map<number, EmbedPlayerStats>();
    for (const [teamId, stats] of teamCoreStats) {
      teamStats.set(teamId, this.getPlayerSlayerStats({ CoreStats: stats }));
    }

    const bestValues = super.getBestStatValues(teamStats);

    return bestValues;
  }
}
