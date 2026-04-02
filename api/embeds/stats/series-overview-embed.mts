import type { APIEmbed } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import type { TeamMapping } from "@guilty-spark/contracts/live-tracker/series-types";
import { isBefore } from "date-fns";
import type { DiscordService } from "../../services/discord/discord.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { EmbedColors } from "../colors.mjs";

interface SeriesOverviewEmbedOpts {
  discordService: DiscordService;
  haloService: HaloService;
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
    finalTeams: readonly TeamMapping[];
    substitutions: SeriesOverviewEmbedSubstitution[];
    hideTeamsDescription: boolean;
  }): Promise<APIEmbed[]> {
    const titles = ["Game", "Duration", `Score${finalTeams.length === 2 ? " (🦅:🐍)" : ""}`];
    const tableData = [titles];
    const seriesMatches = [...series].sort((a, b) => (isBefore(a.MatchInfo.StartTime, b.MatchInfo.StartTime) ? -1 : 1));
    const subs = [...substitutions].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const seriesMatch of seriesMatches) {
      const gameTypeAndMap = await this.haloService.getGameTypeAndMap(seriesMatch.MatchInfo);
      const gameDuration = this.haloService.getReadableDuration(seriesMatch.MatchInfo.Duration, locale);
      const { gameScore, gameSubScore } = this.haloService.getMatchScore(seriesMatch, locale);

      while (subs[0]) {
        const [substitution] = subs;

        if (isBefore(substitution.date, seriesMatch.MatchInfo.StartTime)) {
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
    const startTime = this.discordService.getTimestamp(
      Preconditions.checkExists(seriesMatches[0]?.MatchInfo.StartTime),
    );
    const endTime = this.discordService.getTimestamp(
      Preconditions.checkExists(seriesMatches[seriesMatches.length - 1]?.MatchInfo.EndTime),
    );

    const embeds: APIEmbed[] = [];
    const dataRows = tableData.slice(1); // All rows except titles

    let currentRowIndex = 0;
    while (currentRowIndex < dataRows.length) {
      const isFirstEmbed = embeds.length === 0;

      // Initialize field values for each column
      const fieldValues: string[] = Array.from({ length: titles.length }).fill("") as string[];

      // Determine how many rows can fit in this embed
      while (currentRowIndex < dataRows.length) {
        const row = Preconditions.checkExists(dataRows[currentRowIndex]);

        // Check if adding this row would exceed the 1024 character limit for any column
        let canAddRow = true;
        for (let col = 0; col < titles.length; col++) {
          const currentValue = Preconditions.checkExists(fieldValues[col]);
          const rowValue = Preconditions.checkExists(row[col]);
          const newValue = currentValue + (currentValue.length > 0 ? "\n" : "") + rowValue;
          if (newValue.length > 1024) {
            canAddRow = false;
            break;
          }
        }

        if (!canAddRow) {
          break;
        }

        // Add the row to all columns
        for (let col = 0; col < titles.length; col++) {
          const rowValue = Preconditions.checkExists(row[col]);
          const currentFieldValue = Preconditions.checkExists(fieldValues[col]);
          fieldValues[col] = currentFieldValue + (currentFieldValue.length > 0 ? "\n" : "") + rowValue;
        }
        currentRowIndex++;
      }

      // Create the embed
      const embed: APIEmbed = {
        color: EmbedColors.INFO,
      };

      if (isFirstEmbed) {
        embed.title = `Series stats for queue #${queue.toString()} (${this.haloService.getSeriesScore(series, locale)})`;
        embed.description = `${!hideTeamsDescription ? `${teamsDescription}\n\n` : ""}-# Start time: ${startTime} | End time: ${endTime}`;
        embed.url = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
      }

      // Add fields
      embed.fields = [];
      for (let col = 0; col < titles.length; col++) {
        const fieldValue = Preconditions.checkExists(fieldValues[col]);
        embed.fields.push({
          name: Preconditions.checkExists(titles[col]),
          value: fieldValue.length > 0 ? fieldValue : "-",
          inline: true,
        });
      }

      embeds.push(embed);
    }

    return embeds;
  }
}
