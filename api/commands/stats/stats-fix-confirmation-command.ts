import type { APIMessageComponentButtonInteraction } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import { MANUAL_QUEUE_NUMBER_MIN } from "./manual-series";
import { StatsFixMaintenanceCommand } from "./stats-fix-maintenance-command";

export abstract class StatsFixConfirmationCommand extends StatsFixMaintenanceCommand {
  protected async handleFixConfirmationJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const selectedMatchIds = metadata.selectedMatchIds ?? [];
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("No games were selected. Please run /stats fix again.");
      }
      if (metadata.selectedSeriesOutcome == null) {
        throw new EndUserError("No final series result was selected. Please run /stats fix again.");
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const [guildConfig, series] = await Promise.all([
        databaseService.getGuildConfig(metadata.guildId),
        haloService.getMatchDetails(selectedMatchIds),
      ]);
      if (series.length === 0) {
        throw new EndUserError("No match details found for selected games.");
      }

      const amendedSeriesEmbed = await this.createSeriesEmbed({
        guildId: metadata.guildId,
        channelId: metadata.channelId,
        locale,
        queueData: metadata.queueData,
        series,
      });
      const amendedByUserId = discordService.getDiscordUserId(interaction);
      const amendedField = {
        name: "Amended by",
        value: `<@${amendedByUserId}> on ${discordService.getTimestamp(new Date().toISOString())}`,
        inline: false,
      };
      const amendedOverviewEmbed = Preconditions.checkExists(amendedSeriesEmbed.embeds[0]);
      amendedOverviewEmbed.fields ??= [];
      const createdManuallyByField = metadata.queueData.message.embeds
        .flatMap((embed) => embed.fields ?? [])
        .find((field) => field.name === "Created manually by");
      if (metadata.isManualSeries === true) {
        amendedOverviewEmbed.fields.push({
          name: "Final series result",
          value: this.getFixSeriesOutcomeLabel(metadata.selectedSeriesOutcome, metadata.queueData.teams),
          inline: false,
        });
      }
      if (metadata.isManualSeries === true && createdManuallyByField != null) {
        amendedOverviewEmbed.fields.push(createdManuallyByField);
      }
      amendedOverviewEmbed.fields.push(amendedField);

      const isManualSeries = metadata.isManualSeries ?? metadata.queueData.queue >= MANUAL_QUEUE_NUMBER_MIN;
      const linkedQueueSource =
        metadata.sourceKind === "series-overview"
          ? this.getLinkedQueueSourceFromOverview(metadata.queueData.message, metadata.guildId)
          : undefined;
      const hasKnownManualQueueChannel = linkedQueueSource != null && linkedQueueSource.messageId == null;
      const neatQueueConfig =
        isManualSeries && metadata.queueData.queue >= MANUAL_QUEUE_NUMBER_MIN && !hasKnownManualQueueChannel
          ? undefined
          : await this.tryResolveNeatQueueConfigForResultsChannel(
              metadata.guildId,
              metadata.channelId,
              metadata.sourceKind ?? "neatqueue-result",
              metadata.queueData.message,
            );
      const existingLocation =
        (await discordService.findExistingSeriesStatsThreadLocation(metadata.guildId, metadata.queueData.queue)) ??
        this.getNeatQueueResultThreadLocation(metadata.queueData.message);
      await this.deletePreviousSeriesErrorMessages(metadata, neatQueueConfig);

      let destinationThreadId: string;
      let shouldPostOverviewInThread = false;
      if (existingLocation != null) {
        const existingThreadMessages = await discordService.findBotMessagesInThread(
          metadata.guildId,
          existingLocation.threadId,
        );
        const existingGuiltySparkMessageIds = existingThreadMessages
          .filter((message) => message.content !== "" || message.embeds.length > 0)
          .map((message) => message.id);
        await this.deleteMessagesInChunks(
          existingLocation.threadId,
          existingGuiltySparkMessageIds,
          "Replacing amended series stats",
        );

        if (existingLocation.parentOverviewMessage != null) {
          await discordService.editMessage(
            existingLocation.parentOverviewMessage.channelId,
            existingLocation.parentOverviewMessage.messageId,
            {
              embeds: amendedSeriesEmbed.embeds,
              components: amendedSeriesEmbed.components,
            },
          );
          destinationThreadId = existingLocation.threadId;
        } else {
          destinationThreadId = existingLocation.threadId;
          shouldPostOverviewInThread = true;
        }
      } else {
        const destination = await this.createFixSeriesStatsThread({
          metadata,
          neatQueueConfig,
          seriesEmbed: amendedSeriesEmbed,
          threadName: `Queue #${metadata.queueData.queue.toString()} series stats (${haloService.getSeriesScore(series, locale, true)})`,
        });
        ({ threadId: destinationThreadId, shouldPostOverviewInThread } = destination);
      }

      if (shouldPostOverviewInThread) {
        await discordService.createMessage(destinationThreadId, {
          embeds: amendedSeriesEmbed.embeds,
          components: amendedSeriesEmbed.components,
        });
      }
      await this.postSeriesEmbedsToThread(destinationThreadId, series, guildConfig, locale);
      await this.postGameStatsOrButton(destinationThreadId, series, guildConfig, locale);
      if (isManualSeries) {
        await discordService.cacheDiscordSeriesMatchIds(
          metadata.guildId,
          metadata.queueData.queue,
          series.map((match) => match.MatchId),
        );
      }
      await this.cacheDiscordSeriesStats(metadata.guildId, metadata.queueData.queue, series, locale, isManualSeries);
      if (neatQueueConfig != null && metadata.queueData.queue < MANUAL_QUEUE_NUMBER_MIN) {
        await this.persistFixedSeriesToLeaderboard(metadata, neatQueueConfig, series, locale);
      }

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed("Series stats were amended successfully.")],
        components: [],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }
}
