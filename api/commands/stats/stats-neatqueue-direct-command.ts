import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIChannel,
  APIMessage,
} from "discord-api-types/v10";
import { ChannelType, InteractionResponseType, PermissionFlagsBits } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { subHours } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import { toMissingPermissionsError } from "../../base/missing-permissions-error";
import type { PreservedMessageContent } from "../../services/discord/discord";
import type { ExecuteResponse } from "../base/base-command";
import { StatsNeatQueueThreadCommand } from "./stats-neatqueue-thread-command";

export abstract class StatsNeatQueueDirectCommand extends StatsNeatQueueThreadCommand {
  protected handleNeatQueueSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const optionsChannel = options.get("channel") as string | undefined;
    let channel = optionsChannel ?? interaction.channel.id;
    const queue = options.get("queue") as number | undefined;

    const channelType = interaction.channel.type;
    if (
      optionsChannel == null &&
      (channelType === ChannelType.PublicThread ||
        channelType === ChannelType.PrivateThread ||
        channelType === ChannelType.AnnouncementThread)
    ) {
      if (queue == null) {
        return {
          response: {
            type: InteractionResponseType.DeferredChannelMessageWithSource,
          },
          jobToComplete: async () => this.neatQueueSubCommandInThreadJob(interaction),
        };
      }

      channel = interaction.channel.parent_id ?? interaction.channel.id;
    }

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      },
      jobToComplete: async () => this.neatQueueSubCommandJob(interaction, channel, queue),
    };
  }

  private async neatQueueSubCommandJob(
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
        startDateTime: subHours(queueData.timestamp, 6),
        endDateTime: queueData.timestamp,
      });
      const seriesEmbed = await this.createSeriesEmbed({ guildId, channelId, locale, queueData, series });
      await this.cacheDiscordSeriesStats(guildId, queueData.queue, series, locale);

      await discordService.updateDeferredReply(interaction.token, {
        embeds: seriesEmbed.embeds,
        components: seriesEmbed.components,
      });
      seriesOverviewContent = seriesEmbed;

      const seriesOverviewMessage = await discordService.getMessageFromInteractionToken(interaction.token);
      const thread = await this.resolveSeriesThread(seriesOverviewMessage, queueData.queue, series, locale);

      await this.postSeriesStatsToThread(thread.id, series, guildConfig, locale);
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

  private async resolveSeriesThread(
    message: APIMessage,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
  ): Promise<APIChannel> {
    const { discordService, haloService } = this.services;
    const messageChannel = await discordService.getChannel(message.channel_id);

    if (
      [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(
        messageChannel.type,
      )
    ) {
      return messageChannel;
    }

    try {
      return await discordService.startThreadFromMessage(
        message.channel_id,
        message.id,
        `Queue #${queueNumber.toString()} series stats (${haloService.getSeriesScore(series, locale, true)})`,
      );
    } catch (error) {
      throw (
        toMissingPermissionsError(error, {
          action: "create a thread for the series stats",
          permissions: [discordService.permissionToString(PermissionFlagsBits.CreatePublicThreads)],
        }) ?? error
      );
    }
  }
}
