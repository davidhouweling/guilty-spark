import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIMessageComponentSelectMenuInteraction,
  APIMessageTopLevelComponent,
  APISelectMenuOption,
} from "discord-api-types/v10";
import {
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  SelectMenuDefaultValueType,
} from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import { allocateManualQueueNumber } from "./manual-series";
import { InteractionButton } from "./stats-interaction-button";
import type { ManualFlowMetadata } from "./stats-flow-types";
import { StatsManualQueueCommand } from "./stats-manual-queue-command";

export abstract class StatsManualEntryCommand extends StatsManualQueueCommand {
  protected handleManualSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const queueNumber = options.get("queue_number");

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral },
      },
      jobToComplete: async () =>
        this.manualSubCommandJob(interaction, typeof queueNumber === "number" ? queueNumber : undefined),
    };
  }

  private async manualSubCommandJob(
    interaction: APIApplicationCommandInteraction,
    queueNumber: number | undefined,
  ): Promise<void> {
    const { databaseService, discordService } = this.services;

    try {
      const guildId = interaction.guild_id;
      if (guildId == null) {
        throw new EndUserError("This command can only be used inside a server.");
      }

      const metadata: ManualFlowMetadata = {
        guildId,
        channelId: interaction.channel.id,
        queueNumber: queueNumber ?? allocateManualQueueNumber(),
        queueChannelId: null,
        queuePage: 0,
      };

      if (queueNumber != null) {
        const configuredQueues = await databaseService.findNeatQueueConfig({ GuildId: guildId });
        if (configuredQueues.length > 1) {
          await this.showManualQueueSelect(interaction.token, metadata, configuredQueues);
          return;
        }

        metadata.queueChannelId = configuredQueues[0]?.ChannelId ?? null;
      }

      await this.showManualGamesForPlayer(
        interaction.token,
        interaction.guild_locale ?? interaction.locale,
        metadata,
        discordService.getDiscordUserId(interaction),
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  protected async handleManualPlayerSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      const playerId = Preconditions.checkExists(interaction.data.values[0], "No player selected");
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);

      await this.showManualGamesForPlayer(
        interaction.token,
        interaction.guild_locale ?? interaction.locale,
        metadata,
        playerId,
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  protected async showManualGamesForPlayer(
    interactionToken: string,
    locale: string,
    metadata: ManualFlowMetadata,
    playerId: string,
  ): Promise<void> {
    let gameOptions: APISelectMenuOption[] = [];
    let status = `Select the custom games for this series from <@${playerId}>'s recent games, or pick a different player.`;
    try {
      gameOptions = this.toGameSelectOptions(await this.getRecentCustomGames(playerId, locale), new Set());
    } catch (error) {
      if (!(error instanceof EndUserError)) {
        throw error;
      }

      status = `${error.endUserMessage} Pick a different player.`;
    }

    const gamesSelectRow: APIMessageTopLevelComponent = {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: InteractionButton.ManualGamesSelect,
          min_values: 1,
          max_values: Math.min(gameOptions.length, 25),
          options: gameOptions,
        },
      ],
    };
    const message = await this.services.discordService.updateDeferredReply(interactionToken, {
      embeds: [this.createStatusEmbed(status)],
      components: [
        ...(gameOptions.length > 0 ? [gamesSelectRow] : []),
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.UserSelect,
              custom_id: InteractionButton.ManualPlayerSelect,
              placeholder: "Load games from a different player",
              min_values: 1,
              max_values: 1,
              default_values: [{ id: playerId, type: SelectMenuDefaultValueType.User }],
            },
          ],
        },
        this.createManualActionRow(metadata, []),
      ],
    });

    await this.setManualMetadata(message.id, { ...metadata, selectedPlayerId: playerId });
  }
}
