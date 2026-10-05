import type { APIApplicationCommandInteraction } from "discord-api-types/v10";
import { ChannelType } from "discord-api-types/v10";
import { subHours } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import type { PreservedMessageContent } from "../../services/discord/discord";
import { StatsSeriesCommand } from "./stats-series-command";

export abstract class StatsNeatQueueThreadCommand extends StatsSeriesCommand {
  protected async neatQueueSubCommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
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
          message.author.id === this.env.DISCORD_APP_ID && (message.content !== "" || message.embeds.length > 0),
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
        await neatQueueService.handleRetry({
          errorEmbed: previousEndUserError,
          guildId,
          interaction,
        });
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

        const seriesEmbed = await this.createSeriesEmbed({
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

        await this.cacheDiscordSeriesStats(guildId, queueData.queue, series, locale);
        await this.postSeriesStatsToThread(threadChannelId, series, guildConfig, locale);
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
