import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIChannel,
  APIMessage,
} from "discord-api-types/v10";
import { ChannelType, InteractionResponseType } from "discord-api-types/v10";
import { subHours } from "date-fns";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import type { PreservedMessageContent, QueueData } from "../../services/discord/discord";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import type { StatsHandlerContext } from "./stats-handler-context";

interface StatsNeatQueueCapabilities {
  createSeriesEmbed(input: {
    guildId: string;
    channelId: string;
    locale: string;
    queueData: Omit<QueueData, "timestamp">;
    series: MatchStats[];
  }): Promise<SeriesOverviewEmbedOutput>;
  cacheDiscordSeriesStats(guildId: string, queueNumber: number, series: MatchStats[], locale: string): Promise<void>;
  resolveSeriesThread(
    message: APIMessage,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
  ): Promise<APIChannel>;
  postSeriesStatsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
  ): Promise<void>;
}

export class StatsNeatQueueHandler {
  constructor(
    private readonly context: StatsHandlerContext,
    private readonly capabilities: StatsNeatQueueCapabilities,
  ) {}

  private get services(): StatsHandlerContext["services"] {
    return this.context.services;
  }

  public handleSubcommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const channelOption = options.get("channel");
    const queueOption = options.get("queue");
    const optionsChannel = typeof channelOption === "string" ? channelOption : undefined;
    const queue = typeof queueOption === "number" ? queueOption : undefined;
    let channel = optionsChannel ?? interaction.channel.id;

    const channelType = interaction.channel.type;
    if (
      optionsChannel == null &&
      (channelType === ChannelType.PublicThread ||
        channelType === ChannelType.PrivateThread ||
        channelType === ChannelType.AnnouncementThread)
    ) {
      if (queue == null) {
        return {
          response: { type: InteractionResponseType.DeferredChannelMessageWithSource },
          jobToComplete: async () => this.neatQueueSubcommandInThreadJob(interaction),
        };
      }

      channel = interaction.channel.parent_id ?? interaction.channel.id;
    }

    return {
      response: { type: InteractionResponseType.DeferredChannelMessageWithSource },
      jobToComplete: async () => this.neatQueueSubcommandJob(interaction, channel, queue),
    };
  }

  private async neatQueueSubcommandJob(
    interaction: APIApplicationCommandInteraction,
    channelId: string,
    queue: number | undefined,
  ): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;
    let computedQueue = queue;
    let endDateTime: Date | undefined;
    let seriesOverviewContent: PreservedMessageContent | undefined;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const [guildConfig, queueData] = await Promise.all([
        databaseService.getGuildConfig(guildId),
        discordService.getTeamsFromQueueResult(guildId, channelId, queue),
      ]);
      computedQueue = queueData.queue;
      const startDateTime = subHours(queueData.timestamp, 6);
      endDateTime = queueData.timestamp;
      const series = await haloService.getSeriesFromDiscordQueue({
        teams: queueData.teams.map((team) =>
          team.players.map((player) => ({
            id: player.user.id,
            username: player.user.username,
            globalName: player.user.global_name,
            guildNickname: player.nick ?? null,
          })),
        ),
        startDateTime,
        endDateTime,
      });
      const seriesEmbed = await this.capabilities.createSeriesEmbed({
        guildId,
        channelId,
        locale,
        queueData,
        series,
      });
      await discordService.updateDeferredReply(interaction.token, {
        embeds: seriesEmbed.embeds,
        components: seriesEmbed.components,
      });
      seriesOverviewContent = seriesEmbed;
      await this.capabilities.cacheDiscordSeriesStats(guildId, queueData.queue, series, locale);

      const seriesOverviewMessage = await discordService.getMessageFromInteractionToken(interaction.token);
      const thread = await this.capabilities.resolveSeriesThread(
        seriesOverviewMessage,
        queueData.queue,
        series,
        locale,
      );
      await this.capabilities.postSeriesStatsToThread(thread.id, series, guildConfig, locale);
      await haloService.updateDiscordAssociations();
    } catch (error) {
      if (error instanceof EndUserError && computedQueue != null && endDateTime != null) {
        error.appendData({
          Channel: `<#${channelId}>`,
          Queue: computedQueue.toString(),
          Completed: discordService.getTimestamp(endDateTime.toISOString()),
        });
      }
      await discordService.updateDeferredReplyWithError(interaction.token, error, {
        preserveMessage: seriesOverviewContent,
      });
    }
  }

  private async neatQueueSubcommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
    const { databaseService, discordService, haloService, logService, neatQueueService } = this.services;
    let previousEndUserError: EndUserError | undefined;
    let seriesOverviewContent: PreservedMessageContent | undefined;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      if (
        interaction.channel.type !== ChannelType.PublicThread &&
        interaction.channel.type !== ChannelType.PrivateThread &&
        interaction.channel.type !== ChannelType.AnnouncementThread
      ) {
        throw new EndUserError("This command must be run in a thread channel.");
      }

      const threadChannelId = interaction.channel.id;
      const [guildConfig, threadMessages] = await Promise.all([
        databaseService.getGuildConfig(guildId),
        discordService.getMessages(threadChannelId),
      ]);
      const firstMessage = threadMessages[threadMessages.length - 1];
      if (
        firstMessage?.referenced_message?.author.bot !== true ||
        firstMessage.referenced_message.author.id !== NEAT_QUEUE_BOT_USER_ID
      ) {
        throw new EndUserError("The first message in this thread is not from NeatQueue.");
      }

      const queueMessage = firstMessage.referenced_message;
      const guiltySparkMessages = threadMessages.filter(
        (message) =>
          message.author.id === this.context.env.DISCORD_APP_ID &&
          (message.content !== "" || message.embeds.length > 0),
      );
      const errorMessages = guiltySparkMessages
        .map((message) => (message.embeds[0] ? EndUserError.fromDiscordEmbed(message.embeds[0]) : null))
        .filter((errorMessage) => errorMessage != null);

      try {
        await discordService.bulkDeleteMessages(
          threadChannelId,
          guiltySparkMessages.map((message) => message.id),
          "Cleaning up previous Guilty Spark messages before computing data",
        );
      } catch (error) {
        logService.error(error, new Map([["threadChannelId", threadChannelId]]));
      }

      [previousEndUserError] = errorMessages;
      if (
        previousEndUserError?.data["Channel"] != null &&
        previousEndUserError.data["Queue"] != null &&
        previousEndUserError.data["Completed"] != null
      ) {
        await neatQueueService.handleRetry({ errorEmbed: previousEndUserError, guildId, interaction });
      } else {
        const queueData = await discordService.getTeamsFromMessage(guildId, queueMessage);
        const locale = interaction.guild_locale ?? interaction.locale;
        const startDateTime = subHours(queueData.timestamp, 6);
        const endDateTime = queueData.timestamp;
        const series = await haloService.getSeriesFromDiscordQueue({
          teams: queueData.teams.map((team) =>
            team.players.map((player) => ({
              id: player.user.id,
              username: player.user.username,
              globalName: player.user.global_name,
              guildNickname: player.nick ?? null,
            })),
          ),
          startDateTime,
          endDateTime,
        });
        const seriesEmbed = await this.capabilities.createSeriesEmbed({
          guildId,
          channelId: queueMessage.channel_id,
          locale,
          queueData,
          series,
        });
        await discordService.updateDeferredReply(interaction.token, {
          embeds: seriesEmbed.embeds,
          components: seriesEmbed.components,
        });
        seriesOverviewContent = seriesEmbed;
        await this.capabilities.cacheDiscordSeriesStats(guildId, queueData.queue, series, locale);
        await this.capabilities.postSeriesStatsToThread(threadChannelId, series, guildConfig, locale);
        await haloService.updateDiscordAssociations();
      }
    } catch (error) {
      if (error instanceof EndUserError) {
        error.appendData(previousEndUserError?.data ?? {});
      }
      await discordService.updateDeferredReplyWithError(interaction.token, error, {
        preserveMessage: seriesOverviewContent,
      });
    }
  }
}
