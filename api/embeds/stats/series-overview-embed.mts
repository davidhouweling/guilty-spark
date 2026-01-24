import type { APIEmbed } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import type { DiscordService } from "../../services/discord/discord.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { EmbedColors } from "../colors.mjs";

interface SeriesOverviewEmbedOpts {
  discordService: DiscordService;
  haloService: HaloService;
}

export interface SeriesOverviewEmbedFinalTeams {
  name: string;
  playerIds: string[];
}

export interface SeriesOverviewEmbedSubstitution {
  date: Date;
  playerOut: string;
  playerIn: string;
  team: string;
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
    channelId,
    messageId,
    locale,
    queue,
    series,
    finalTeams,
    substitutions,
    hideTeamsDescription,
  }: {
    guildId: string;
    channelId: string;
    messageId: string;
    locale: string;
    queue: number;
    series: MatchStats[];
    finalTeams: SeriesOverviewEmbedFinalTeams[];
    substitutions: SeriesOverviewEmbedSubstitution[];
    hideTeamsDescription: boolean;
  }): Promise<APIEmbed> {
    const titles = ["Game", "Duration", `Score${finalTeams.length === 2 ? " (🦅:🐍)" : ""}`];
    const tableData = [titles];
    const subs = [...substitutions].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const seriesMatch of series) {
      const gameTypeAndMap = await this.haloService.getGameTypeAndMap(seriesMatch.MatchInfo);
      const gameDuration = this.haloService.getReadableDuration(seriesMatch.MatchInfo.Duration, locale);
      const { gameScore, gameSubScore } = this.haloService.getMatchScore(seriesMatch, locale);

      while (subs[0]) {
        const [substitution] = subs;
        const substitutionTime = substitution.date.getTime();
        const matchStartTime = new Date(seriesMatch.MatchInfo.StartTime).getTime();

        if (substitutionTime < matchStartTime) {
          if (tableData.length > 1) {
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

      const gameResult = gameSubScore != null ? `${gameScore} (${gameSubScore})` : gameScore;
      tableData.push([
        `[${gameTypeAndMap}](https://halodatahive.com/Infinite/Match/${seriesMatch.MatchId})`,
        gameDuration,
        gameResult,
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
      title: `Series stats for queue #${queue.toString()} (${this.haloService.getSeriesScore(series, locale)})`,
      description: `${!hideTeamsDescription ? `${teamsDescription}\n\n` : ""}-# Start time: ${startTime} | End time: ${endTime}`,
      url: `https://discord.com/channels/${guildId}/${channelId}/${messageId}`,
      color: EmbedColors.INFO,
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
