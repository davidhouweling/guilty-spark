import type { APIMessageComponentButtonInteraction } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import {
  mapManualSeriesToStableTeams,
  resolveManualSeriesTeamMappings,
} from "../../services/halo/manual-series-team-mapping";
import { StatsManualPublicationCommand } from "./stats-manual-publication-command";

export abstract class StatsManualConfirmCommand extends StatsManualPublicationCommand {
  protected async handleManualConfirmJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      if (metadata.selectedSeriesOutcome == null) {
        throw new EndUserError("No final series result was selected. Please run /stats manual again.");
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const [guildConfig, series, queueConfig] = await Promise.all([
        databaseService.getGuildConfig(metadata.guildId),
        this.getManualSeriesMatches(metadata.selectedMatchIds ?? []),
        this.findManualQueueConfig(metadata),
      ]);
      const teamMappings = resolveManualSeriesTeamMappings(series);
      const displaySeries = teamMappings == null ? series : mapManualSeriesToStableTeams(series, teamMappings);

      await discordService.cacheDiscordSeriesMatchIds(
        metadata.guildId,
        metadata.queueNumber,
        series.map((match) => match.MatchId),
      );

      const seriesEmbed = await this.createManualSeriesEmbed(metadata, displaySeries, locale, queueConfig?.ChannelId);
      const overviewEmbed = Preconditions.checkExists(seriesEmbed.embeds[0]);
      overviewEmbed.fields ??= [];
      overviewEmbed.fields.push({
        name: "Final series result",
        value: this.getFixSeriesOutcomeLabel(metadata.selectedSeriesOutcome, Preconditions.checkExists(metadata.teams)),
        inline: false,
      });
      overviewEmbed.fields.push({
        name: "Created manually by",
        value: `<@${discordService.getDiscordUserId(interaction)}> on ${discordService.getTimestamp(new Date().toISOString())}`,
        inline: false,
      });

      const publication = await this.postManualSeriesOverview({
        postChannelId: this.isThreadChannel((await discordService.getChannel(metadata.channelId)).type)
          ? metadata.channelId
          : (queueConfig?.PostSeriesChannelId ?? queueConfig?.ResultsChannelId ?? metadata.channelId),
        seriesEmbed,
        threadName: `Queue #${metadata.queueNumber.toString()} series stats (${this.getManualSeriesScoreOverride(metadata, locale, true) ?? haloService.getSeriesScore(displaySeries, locale, true)})`,
      });
      try {
        await this.postSeriesStatsToThread(
          publication.threadId,
          series,
          guildConfig,
          locale,
          publication.allowLoadGamesButton,
          publication.messageIds,
          teamMappings ?? undefined,
        );
      } catch (error) {
        await this.rollbackManualSeriesPublication(publication, error);
      }

      await this.cacheDiscordSeriesStats(
        metadata.guildId,
        metadata.queueNumber,
        series,
        locale,
        true,
        this.getManualSeriesScoreOverride(metadata, locale, false),
      );
      if (queueConfig != null) {
        await this.persistManualSeriesToLeaderboard(metadata, queueConfig, series, locale);
      }

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed(`Series stats were posted in <#${publication.threadId}>.`)],
        components: [],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }
}
