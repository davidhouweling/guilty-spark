import type { APIMessageComponentSelectMenuInteraction } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import { extractDiscordSeriesMatchIdsFromEmbeds } from "../../services/discord/discord-series-stats";
import type { FixFlowMetadata, FixSeriesOutcome } from "./stats-flow-types";
import { InteractionButton } from "./stats-interaction-button";
import { StatsFixEntryCommand } from "./stats-fix-entry-command";

export abstract class StatsFixGamesCommand extends StatsFixEntryCommand {
  protected async handleFixPlayerSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      const selectedPlayerId = Preconditions.checkExists(interaction.data.values[0], "No player selected");
      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const recentGames = await this.getRecentCustomGames(selectedPlayerId, locale);
      const preselectedMatchIds = await this.getPreselectedFixMatchIds(metadata, interaction);
      const gameOptions = this.toGameSelectOptions(recentGames, preselectedMatchIds);

      const selectedMatchIds = gameOptions.filter((option) => Boolean(option.default)).map((option) => option.value);
      await this.setFixMetadata(interaction.message.id, {
        ...metadata,
        selectedPlayerId,
        selectedMatchIds,
      });

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed("Select the custom games that belong to this series.")],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionButton.FixGamesSelect,
                min_values: 1,
                max_values: Math.min(gameOptions.length, 25),
                options: gameOptions,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.FixCancel,
                label: "Cancel",
                style: 2,
              },
            ],
          },
        ],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async getPreselectedFixMatchIds(
    metadata: FixFlowMetadata,
    interaction: APIMessageComponentSelectMenuInteraction,
  ): Promise<Set<string>> {
    const { discordService, logService } = this.services;
    const preselectedMatchIds = new Set<string>();

    try {
      if (this.isThreadChannel(interaction.channel.type)) {
        const threadMessages = await discordService.findBotMessagesInThread(metadata.guildId, interaction.channel.id);
        for (const threadMessage of threadMessages) {
          const matchIds = extractDiscordSeriesMatchIdsFromEmbeds(threadMessage.embeds);
          for (const matchId of matchIds) {
            preselectedMatchIds.add(matchId);
          }
        }

        if (preselectedMatchIds.size > 0) {
          return preselectedMatchIds;
        }
      }

      const existingLocation = await discordService.findExistingSeriesStatsThreadLocation(
        metadata.guildId,
        metadata.queueData.queue,
      );

      if (existingLocation?.parentOverviewMessage != null) {
        const overviewMessage = await discordService.getMessage(
          existingLocation.parentOverviewMessage.channelId,
          existingLocation.parentOverviewMessage.messageId,
        );
        const matchIds = extractDiscordSeriesMatchIdsFromEmbeds(overviewMessage.embeds);
        for (const matchId of matchIds) {
          preselectedMatchIds.add(matchId);
        }
      }

      if (preselectedMatchIds.size === 0 && existingLocation?.threadId != null) {
        const threadMessages = await discordService.findBotMessagesInThread(
          metadata.guildId,
          existingLocation.threadId,
        );
        for (const threadMessage of threadMessages) {
          const matchIds = extractDiscordSeriesMatchIdsFromEmbeds(threadMessage.embeds);
          for (const matchId of matchIds) {
            preselectedMatchIds.add(matchId);
          }
        }
      }
    } catch (error) {
      logService.warn(
        error,
        new Map([
          ["guildId", metadata.guildId],
          ["queueNumber", metadata.queueData.queue.toString()],
          ["reason", "Failed to discover existing series match IDs for /stats fix preselection"],
        ]),
      );
    }

    return preselectedMatchIds;
  }

  protected async updateFixOutcomePreview(
    interaction: APIMessageComponentSelectMenuInteraction,
    metadata: FixFlowMetadata,
    series: MatchStats[],
    derivedSeriesOutcome: FixSeriesOutcome,
    selectedSeriesOutcome: FixSeriesOutcome,
  ): Promise<void> {
    const { discordService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;
    const seriesEmbed = await this.createSeriesEmbed({
      guildId: metadata.guildId,
      channelId: metadata.channelId,
      locale,
      queueData: metadata.queueData,
      series,
    });
    const derivedResultLabel = this.getFixSeriesOutcomeLabel(derivedSeriesOutcome, metadata.queueData.teams);
    const selectedResultLabel = this.getFixSeriesOutcomeLabel(selectedSeriesOutcome, metadata.queueData.teams);

    await discordService.updateDeferredReply(interaction.token, {
      embeds: [
        this.createStatusEmbed(
          `Preview generated. Confirm to replace the previous series stats.\nDerived result: ${derivedResultLabel}\nFinal result: ${selectedResultLabel}`,
        ),
        ...seriesEmbed.embeds,
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.FixOutcomeSelect,
              min_values: 1,
              max_values: 1,
              options: this.getFixSeriesOutcomeOptions(metadata.queueData.teams, selectedSeriesOutcome),
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.FixConfirm,
              label: "Confirm",
              style: 3,
            },
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.FixCancel,
              label: "Cancel",
              style: 2,
            },
          ],
        },
      ],
    });
  }

  protected async handleFixGamesSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService, haloService } = this.services;

    try {
      const selectedMatchIds = interaction.data.values;
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("Select at least one game.");
      }

      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const series = await haloService.getMatchDetails(selectedMatchIds);
      if (series.length === 0) {
        throw new EndUserError("No match details found for the selected games.");
      }

      const derivedSeriesOutcome = this.deriveFixSeriesOutcome(series);
      const selectedSeriesOutcome = derivedSeriesOutcome;

      await this.setFixMetadata(interaction.message.id, {
        ...metadata,
        selectedMatchIds,
        selectedSeriesOutcome,
      });

      await this.updateFixOutcomePreview(interaction, metadata, series, derivedSeriesOutcome, selectedSeriesOutcome);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }
}
