import type {
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIMessageTopLevelComponent,
} from "discord-api-types/v10";
import { ButtonStyle, ComponentType, InteractionResponseType, TextInputStyle } from "discord-api-types/v10";
import { EndUserError } from "../../base/end-user-error";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import { InteractionButton } from "./stats-interaction-button";
import type { ManualFlowMetadata } from "./stats-flow-types";
import { StatsInteractionFlowCommand } from "./stats-interaction-flow-command";

const MANUAL_QUEUE_SELECT_PAGE_SIZE = 25;

export abstract class StatsManualQueueCommand extends StatsInteractionFlowCommand {
  protected async showManualQueueSelect(
    interactionToken: string,
    metadata: ManualFlowMetadata,
    configuredQueues: readonly NeatQueueConfigRow[],
  ): Promise<void> {
    const sortedQueues = [...configuredQueues].sort((left, right) => left.ChannelId.localeCompare(right.ChannelId));
    const pageCount = Math.ceil(sortedQueues.length / MANUAL_QUEUE_SELECT_PAGE_SIZE);
    const page = Math.min(metadata.queuePage ?? 0, pageCount - 1);
    const pageStart = page * MANUAL_QUEUE_SELECT_PAGE_SIZE;
    const queueChannelNames = await this.getQueueChannelNames(metadata.guildId, sortedQueues);
    const queueNavigationRow: APIMessageTopLevelComponent | null =
      pageCount > 1
        ? {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.ManualQueuePreviousPage,
                label: "Previous page",
                style: ButtonStyle.Secondary,
                disabled: page === 0,
              },
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.ManualQueueNextPage,
                label: "Next page",
                style: ButtonStyle.Secondary,
                disabled: page === pageCount - 1,
              },
            ],
          }
        : null;
    const message = await this.services.discordService.updateDeferredReply(interactionToken, {
      embeds: [
        this.createStatusEmbed(
          `Select which queue channel queue #${metadata.queueNumber.toString()} was from.${
            pageCount > 1 ? ` (page ${(page + 1).toString()} of ${pageCount.toString()})` : ""
          }`,
        ),
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.ManualQueueSelect,
              min_values: 1,
              max_values: 1,
              options: sortedQueues.slice(pageStart, pageStart + MANUAL_QUEUE_SELECT_PAGE_SIZE).map((queue) => ({
                label: this.getQueueOptionLabel(queue.ChannelId, queueChannelNames),
                value: queue.ChannelId,
              })),
            },
          ],
        },
        ...(queueNavigationRow == null ? [] : [queueNavigationRow]),
        this.createFixCancelActionRow(),
      ],
    });

    await this.setManualMetadata(message.id, { ...metadata, queuePage: page });
  }

  protected async handleManualQueuePageJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService } = this.services;

    try {
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      const configuredQueues = await databaseService.findNeatQueueConfig({ GuildId: metadata.guildId });
      if (configuredQueues.length < 2) {
        throw new EndUserError("The configured queues have changed. Please run /stats manual again.");
      }

      const pageCount = Math.ceil(configuredQueues.length / MANUAL_QUEUE_SELECT_PAGE_SIZE);
      const pageDelta = interaction.data.custom_id === InteractionButton.ManualQueueNextPage.toString() ? 1 : -1;
      const queuePage = Math.max(0, Math.min((metadata.queuePage ?? 0) + pageDelta, pageCount - 1));

      await this.showManualQueueSelect(interaction.token, { ...metadata, queuePage }, configuredQueues);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  protected createManualQueueNumberModal(): APIInteractionResponse {
    return {
      type: InteractionResponseType.Modal,
      data: {
        title: "Set queue number",
        custom_id: InteractionButton.ManualQueueNumberModal,
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.TextInput,
                custom_id: "queue_number",
                label: "Queue number",
                style: TextInputStyle.Short,
                min_length: 1,
                max_length: 9,
                placeholder: "e.g. 1234",
                required: true,
              },
            ],
          },
        ],
      },
    };
  }
}
