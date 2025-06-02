import type { APIEmbed } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import type { DiscordService } from "../services/discord/discord.mjs";
import type { HaloService } from "../services/halo/halo.mjs";
import { Preconditions } from "../base/preconditions.mjs";

interface SeriesOverviewEmbedOpts {
  discordService: DiscordService;
  haloService: HaloService;
}

export class SeriesOverviewEmbed {
  private readonly discordService: DiscordService;
  private readonly haloService: HaloService;

  constructor({ discordService, haloService }: SeriesOverviewEmbedOpts) {
    this.discordService = discordService;
    this.haloService = haloService;
  }

  async getEmbed({
    guildId,
    channel,
    messageId,
    locale,
    queue,
    series,
    finalTeams,
    substitutions,
    hideTeamsDescription,
  }: {
    guildId: string;
    channel: string;
    messageId: string;
    locale: string;
    queue: number;
    series: MatchStats[];
    finalTeams: {
      name: string;
      playerIds: string[];
    }[];
    substitutions: {
      date: Date;
      playerOut: string;
      playerIn: string;
      team: string;
    }[];
    hideTeamsDescription: boolean;
  }): Promise<APIEmbed> {
    const titles = ["Game", "Duration", `Score${finalTeams.length === 2 ? " (🦅:🐍)" : ""}`];
    const tableData = [titles];
    const subs = [...substitutions].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const seriesMatch of series) {
      const gameTypeAndMap = await this.haloService.getGameTypeAndMap(seriesMatch.MatchInfo);
      const gameDuration = this.haloService.getReadableDuration(seriesMatch.MatchInfo.Duration, locale);
      const gameScore = this.haloService.getMatchScore(seriesMatch, locale);

      while (subs[0]) {
        const [substitution] = subs;
        const substitutionTime = substitution.date.getTime();
        const matchStartTime = new Date(seriesMatch.MatchInfo.StartTime).getTime();

        if (substitutionTime < matchStartTime) {
          if (tableData.length > 0) {
            tableData.push([
              `*<@${substitution.playerIn}> subbed in for <@${substitution.playerOut}> (${substitution.team})*`,
              "",
              "",
            ]);
          }
          subs.shift();
        } else {
          break;
        }
      }

      tableData.push([
        `[${gameTypeAndMap}](https://halodatahive.com/Infinite/Match/${seriesMatch.MatchId})`,
        gameDuration,
        gameScore,
      ]);
    }

    const teamsDescription = finalTeams
      .map((team) => `**${team.name}:** ${team.playerIds.map((playerId) => `<@${playerId}>`).join(" ")}`)
      .join("\n");
    const startTime = this.discordService.getTimestamp(Preconditions.checkExists(series[0]?.MatchInfo.StartTime));
    const endTime = this.discordService.getTimestamp(
      Preconditions.checkExists(series[series.length - 1]?.MatchInfo.EndTime),
    );
    const embed: APIEmbed = {
      title: `Series stats for queue #${queue.toString()}`,
      description: `${!hideTeamsDescription ? `${teamsDescription}\n\n` : ""}-# Start time: ${startTime} | End time: ${endTime}`,
      url: `https://discord.com/channels/${guildId}/${channel}/${messageId}`,
      color: 3447003,
    };

    this.addEmbedFields(embed, titles, tableData);

    return embed;
  }

  private addEmbedFields(embed: APIEmbed, titles: string[], data: string[][]): void {
    for (let column = 0; column < titles.length; column++) {
      embed.fields ??= [];
      embed.fields.push({
        name: Preconditions.checkExists(titles[column]),
        value: data
          .slice(1)
          .map((row) => row[column])
          .join("\n"),
        inline: true,
      });
    }
  }
}
