import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIEmbed,
  APIInteractionResponseDeferredChannelMessageWithSource,
} from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";
import type { ApplicationCommandData, ExecuteResponse } from "../base/base.mjs";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import type { QueueData } from "../../services/discord/discord.mjs";
import type { BaseMatchEmbed } from "./embeds/base-match-embed.mjs";
import { AttritionMatchEmbed } from "./embeds/attrition-match-embed.mjs";
import { CtfMatchEmbed } from "./embeds/ctf-match-embed.mjs";
import { EliminationMatchEmbed } from "./embeds/elimination-match-embed.mjs";
import { EscalationMatchEmbed } from "./embeds/escalation-match-embed.mjs";
import { ExtractionMatchEmbed } from "./embeds/extraction-match-embed.mjs";
import { FiestaMatchEmbed } from "./embeds/fiesta-match-embed.mjs";
import { FirefightMatchEmbed } from "./embeds/firefight-match-embed.mjs";
import { GrifballMatchEmbed } from "./embeds/grifball-match-embed.mjs";
import { InfectionMatchEmbed } from "./embeds/infection-match-embed.mjs";
import { KOTHMatchEmbed } from "./embeds/koth-match-embed.mjs";
import { LandGrabMatchEmbed } from "./embeds/land-grab-match-embed.mjs";
import { MinigameMatchEmbed } from "./embeds/minigame-match-embed.mjs";
import { OddballMatchEmbed } from "./embeds/oddball-match-embed.mjs";
import { SlayerMatchEmbed } from "./embeds/slayer-match-embed.mjs";
import { StockpileMatchEmbed } from "./embeds/stockpile-match-embed.mjs";
import { StrongholdsMatchEmbed } from "./embeds/strongholds-match-embed.mjs";
import { TotalControlMatchEmbed } from "./embeds/total-control-match-embed.mjs";
import { UnknownMatchEmbed } from "./embeds/unknown-match-embed.mjs";
import { VIPMatchEmbed } from "./embeds/vip-match-embed.mjs";
import { SeriesMatchesEmbed } from "./embeds/series-matches-embed.mjs";

export class StatsCommand extends BaseCommand {
  data: ApplicationCommandData = {
    type: ApplicationCommandType.ChatInput,
    name: "stats",
    description: "Pulls stats from Halo waypoint",
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "neatqueue",
        description: "Pulls stats for a NeatQueue series result",
        options: [
          {
            name: "channel",
            description: "The channel which has the NeatQueue result message",
            required: true,
            type: ApplicationCommandOptionType.Channel,
          },
          {
            type: ApplicationCommandOptionType.Integer,
            name: "queue",
            description: "The Queue number for the series",
            required: true,
          },
          {
            name: "private",
            description: "Only provide the response to you instead of the channel",
            required: false,
            type: ApplicationCommandOptionType.Boolean,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "match",
        description: "Pulls stats for a specific match",
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: "id",
            description: "The match ID (example: d9d77058-f140-4838-8f41-1a3406b28566)",
            required: true,
            max_length: 36,
            min_length: 36,
          },
          {
            name: "private",
            description: "Only provide the response to you instead of the channel",
            required: false,
            type: ApplicationCommandOptionType.Boolean,
          },
        ],
      },
    ],
  };

  execute(interaction: APIApplicationCommandInteraction): ExecuteResponse {
    try {
      const subcommand = this.services.discordService.extractSubcommand(interaction, "stats");

      if (subcommand.mappedOptions == null || subcommand.mappedOptions.size === 0) {
        throw new Error("Missing subcommand options");
      }
      switch (subcommand.name) {
        case "neatqueue": {
          return this.handleNeatQueueSubCommand(interaction, subcommand.mappedOptions);
        }
        case "match":
          return this.handleMatchSubCommand(interaction, subcommand.mappedOptions);
        default:
          throw new Error("Unknown subcommand");
      }
    } catch (error) {
      console.error(error);
      console.trace();

      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `Error: ${error instanceof Error ? error.message : "unknown"}`,
            flags: MessageFlags.Ephemeral,
          },
        },
      };
    }
  }

  private handleNeatQueueSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const channel = Preconditions.checkExists(options.get("channel") as string, "Missing channel");
    const queue = Preconditions.checkExists(options.get("queue") as number, "Missing queue");
    const ephemeral = (options.get("private") as boolean | undefined) ?? false;
    const data: APIInteractionResponseDeferredChannelMessageWithSource["data"] = {};
    if (ephemeral) {
      data.flags = MessageFlags.Ephemeral;
    }

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data,
      },
      jobToComplete: async () => this.neatQueueSubCommandJob(interaction, channel, queue),
    };
  }

  private async neatQueueSubCommandJob(
    interaction: APIApplicationCommandInteraction,
    channel: string,
    queue: number,
  ): Promise<void> {
    const { discordService, haloService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;

    try {
      const queueData = await discordService.getTeamsFromQueue(channel, queue);
      if (!queueData) {
        throw new Error(
          `No queue found within the last 100 messages of <#${channel}>, with queue number ${queue.toLocaleString(locale)}`,
        );
      }

      const series = await haloService.getSeriesFromDiscordQueue(queueData);
      const seriesEmbed = await this.createSeriesEmbed({
        guildId: Preconditions.checkExists(interaction.guild_id, "No guild id"),
        channel,
        locale,
        queue,
        queueData,
        series,
      });

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [seriesEmbed],
      });

      const message = await discordService.getMessageFromInteractionToken(interaction.token);
      const thread = await discordService.startThreadFromMessage(
        message.channel_id,
        message.id,
        `Queue #${queue.toLocaleString(locale)} series stats`,
      );

      const seriesMatchesEmbed = new SeriesMatchesEmbed({ discordService, haloService, locale });
      const seriesPlayers = await haloService.getPlayerXuidsToGametags(Preconditions.checkExists(series[0]));
      const seriesAccumulationEmbed = await seriesMatchesEmbed.getSeriesEmbed(series, seriesPlayers, locale);
      await discordService.createMessage(thread.id, { embeds: [seriesAccumulationEmbed] });

      for (const match of series) {
        const players = await haloService.getPlayerXuidsToGametags(match);
        const matchEmbed = this.getMatchEmbed(match, locale);
        const embed = await matchEmbed.getEmbed(match, players);

        await discordService.createMessage(thread.id, { embeds: [embed] });
      }

      await haloService.updateDiscordAssociations();
    } catch (error) {
      console.error(error);
      console.trace();

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to fetch (Channel: <#${channel}>, queue: ${queue.toLocaleString(locale)}): ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  private handleMatchSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const matchId = Preconditions.checkExists(options.get("id") as string, "Missing match id");
    const ephemeral = (options.get("private") as boolean | undefined) ?? false;
    const data: APIInteractionResponseDeferredChannelMessageWithSource["data"] = {};
    if (ephemeral) {
      data.flags = MessageFlags.Ephemeral;
    }

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data,
      },
      jobToComplete: async () => this.matchSubCommandJob(interaction, matchId),
    };
  }

  private async matchSubCommandJob(interaction: APIApplicationCommandInteraction, matchId: string): Promise<void> {
    const { discordService, haloService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;

    try {
      const matches = await haloService.getMatchDetails([matchId]);
      if (!matches.length) {
        await discordService.updateDeferredReply(interaction.token, { content: "Match not found" });

        return;
      }

      const match = Preconditions.checkExists(matches[0]);
      const players = await haloService.getPlayerXuidsToGametags(match);

      const matchEmbed = this.getMatchEmbed(match, locale);
      const embed = await matchEmbed.getEmbed(match, players);

      await discordService.updateDeferredReply(interaction.token, { embeds: [embed] });
    } catch (error) {
      console.error(error);
      console.trace();

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to fetch (match id: ${matchId}}): ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
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

  private async createSeriesEmbed({
    guildId,
    channel,
    locale,
    queue,
    queueData,
    series,
  }: {
    guildId: string;
    channel: string;
    locale: string;
    queue: number;
    queueData: QueueData;
    series: MatchStats[];
  }): Promise<APIEmbed> {
    const { discordService, haloService } = this.services;
    const titles = ["Game", "Duration", `Score${queueData.teams.length === 2 ? " (🦅:🐍)" : ""}`];
    const tableData = [titles];
    for (const seriesMatch of series) {
      const gameTypeAndMap = await haloService.getGameTypeAndMap(seriesMatch);
      const gameDuration = haloService.getReadableDuration(seriesMatch.MatchInfo.Duration, locale);
      const gameScore = haloService.getMatchScore(seriesMatch, locale);

      tableData.push([gameTypeAndMap, gameDuration, gameScore]);
    }

    const messageId = Preconditions.checkExists(queueData.message.id);
    const teams = queueData.teams
      .map((team) => `**${team.name}:** ${team.players.map((player) => `<@${player.id}>`).join(" ")}`)
      .join("\n");
    const startTime = discordService.getTimestamp(Preconditions.checkExists(series[0]?.MatchInfo.StartTime));
    const endTime = discordService.getTimestamp(
      Preconditions.checkExists(series[series.length - 1]?.MatchInfo.EndTime),
    );
    const embed: APIEmbed = {
      title: `Series stats for queue #${queue.toLocaleString(locale)}`,
      description: `${teams}\n\n-# Start time: ${startTime} | End time: ${endTime}`,
      url: `https://discord.com/channels/${guildId}/${channel}/${messageId}`,
      color: 3447003,
    };

    this.addEmbedFields(embed, titles, tableData);

    return embed;
  }

  private getMatchEmbed(match: MatchStats, locale: string): BaseMatchEmbed<GameVariantCategory> {
    const opts = {
      discordService: this.services.discordService,
      haloService: this.services.haloService,
      locale,
    };

    switch (match.MatchInfo.GameVariantCategory) {
      case GameVariantCategory.MultiplayerAttrition:
        return new AttritionMatchEmbed(opts);
      case GameVariantCategory.MultiplayerCtf:
        return new CtfMatchEmbed(opts);
      case GameVariantCategory.MultiplayerElimination:
        return new EliminationMatchEmbed(opts);
      case GameVariantCategory.MultiplayerEscalation:
        return new EscalationMatchEmbed(opts);
      case GameVariantCategory.MultiplayerExtraction:
        return new ExtractionMatchEmbed(opts);
      case GameVariantCategory.MultiplayerFiesta:
        return new FiestaMatchEmbed(opts);
      case GameVariantCategory.MultiplayerFirefight:
        return new FirefightMatchEmbed(opts);
      case GameVariantCategory.MultiplayerGrifball:
        return new GrifballMatchEmbed(opts);
      case GameVariantCategory.MultiplayerInfection:
        return new InfectionMatchEmbed(opts);
      case GameVariantCategory.MultiplayerKingOfTheHill:
        return new KOTHMatchEmbed(opts);
      case GameVariantCategory.MultiplayerLandGrab:
        return new LandGrabMatchEmbed(opts);
      case GameVariantCategory.MultiplayerMinigame:
        return new MinigameMatchEmbed(opts);
      case GameVariantCategory.MultiplayerOddball:
        return new OddballMatchEmbed(opts);
      case GameVariantCategory.MultiplayerSlayer:
        return new SlayerMatchEmbed(opts);
      case GameVariantCategory.MultiplayerStockpile:
        return new StockpileMatchEmbed(opts);
      case GameVariantCategory.MultiplayerStrongholds:
        return new StrongholdsMatchEmbed(opts);
      case GameVariantCategory.MultiplayerTotalControl:
        return new TotalControlMatchEmbed(opts);
      case GameVariantCategory.MultiplayerVIP:
        return new VIPMatchEmbed(opts);
      default:
        return new UnknownMatchEmbed(opts);
    }
  }
}
