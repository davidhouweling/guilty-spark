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
    teams,
  }: {
    guildId: string;
    channel: string;
    messageId: string;
    locale: string;
    queue: number;
    series: MatchStats[];
    teams?: {
      name: string;
      players: {
        id: string;
        replacedBy?: string;
      }[];
    }[];
  }): Promise<APIEmbed> {
    const titles = ["Game", "Duration", `Score${teams?.length === 2 ? " (🦅:🐍)" : ""}`];
    const tableData = [titles];
    for (const seriesMatch of series) {
      const gameTypeAndMap = await this.haloService.getGameTypeAndMap(seriesMatch.MatchInfo);
      const gameDuration = this.haloService.getReadableDuration(seriesMatch.MatchInfo.Duration, locale);
      const gameScore = this.haloService.getMatchScore(seriesMatch, locale);

      tableData.push([
        `[${gameTypeAndMap}](https://halodatahive.com/Infinite/Match/${seriesMatch.MatchId})`,
        gameDuration,
        gameScore,
      ]);
    }

    const teamsDescription = teams
      ?.map(
        (team) =>
          `**${team.name}:** ${team.players.map(({ id, replacedBy }) => `<@${id}>${replacedBy != null ? ` (replaced by ${replacedBy})` : ""}`).join(" ")}`,
      )
      .join("\n");
    const startTime = this.discordService.getTimestamp(Preconditions.checkExists(series[0]?.MatchInfo.StartTime));
    const endTime = this.discordService.getTimestamp(
      Preconditions.checkExists(series[series.length - 1]?.MatchInfo.EndTime),
    );
    const embed: APIEmbed = {
      title: `Series stats for queue #${queue.toString()}`,
      description: `${teamsDescription != null ? `${teamsDescription}\n\n` : ""}-# Start time: ${startTime} | End time: ${endTime}`,
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
