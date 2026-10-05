import type { APIButtonComponentWithCustomId, APIEmbed, APIMessageTopLevelComponent } from "discord-api-types/v10";
import { ButtonStyle, ChannelType, ComponentType } from "discord-api-types/v10";
import { EndUserError } from "../../base/end-user-error";
import { EmbedColors } from "../../embeds/colors";
import { MANUAL_QUEUE_NUMBER_MIN } from "./manual-series";
import { InteractionButton } from "./stats-interaction-button";
import type { FixFlowMetadata, ManualFlowMetadata } from "./stats-flow-types";
import { StatsGameSelectionCommand } from "./stats-game-selection-command";

const FIX_METADATA_RETRY_BASE_DELAY_MS = 150;
const FIX_METADATA_MAX_RETRIES = 3;

export abstract class StatsInteractionFlowCommand extends StatsGameSelectionCommand {
  protected createStatusEmbed(description: string): APIEmbed {
    return {
      color: EmbedColors.NEUTRAL,
      description,
    };
  }

  protected isThreadChannel(channelType: ChannelType): boolean {
    return (
      channelType === ChannelType.PublicThread ||
      channelType === ChannelType.PrivateThread ||
      channelType === ChannelType.AnnouncementThread
    );
  }

  protected createFixCancelActionRow(): APIMessageTopLevelComponent {
    return {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          custom_id: InteractionButton.FixCancel,
          label: "Cancel",
          style: ButtonStyle.Secondary,
        },
      ],
    };
  }

  protected createManualActionRow(
    metadata: ManualFlowMetadata,
    leadingButtons: APIButtonComponentWithCustomId[],
  ): APIMessageTopLevelComponent {
    const setQueueNumberButton: APIButtonComponentWithCustomId = {
      type: ComponentType.Button,
      custom_id: InteractionButton.ManualSetQueueNumber,
      label: "Set queue number",
      style: ButtonStyle.Primary,
    };

    return {
      type: ComponentType.ActionRow,
      components: [
        ...leadingButtons,
        ...(metadata.queueNumber >= MANUAL_QUEUE_NUMBER_MIN ? [setQueueNumberButton] : []),
        {
          type: ComponentType.Button,
          custom_id: InteractionButton.FixCancel,
          label: "Cancel",
          style: ButtonStyle.Secondary,
        },
      ],
    };
  }

  protected async setFixMetadata(messageId: string, metadata: FixFlowMetadata): Promise<void> {
    await this.services.discordService.setInteractionMetadata(this.fixMetadataKey(messageId), metadata);
  }

  protected async getFixMetadataWithRetry(messageId: string): Promise<FixFlowMetadata | null> {
    return this.getInteractionMetadataWithRetry<FixFlowMetadata>(this.fixMetadataKey(messageId));
  }

  protected async setManualMetadata(messageId: string, metadata: ManualFlowMetadata): Promise<void> {
    await this.services.discordService.setInteractionMetadata(this.manualMetadataKey(messageId), metadata);
  }

  protected async getManualMetadataWithRetry(messageId: string): Promise<ManualFlowMetadata> {
    const metadata = await this.getInteractionMetadataWithRetry<ManualFlowMetadata>(this.manualMetadataKey(messageId));
    if (metadata == null) {
      throw new EndUserError("Could not find manual stats state. Please run /stats manual again.");
    }

    return metadata;
  }

  private async getInteractionMetadataWithRetry<T extends Record<string, unknown>>(key: string): Promise<T | null> {
    for (let attempt = 0; attempt <= FIX_METADATA_MAX_RETRIES; attempt += 1) {
      const metadata = await this.services.discordService.getInteractionMetadata<T>(key);
      if (metadata != null) {
        return metadata;
      }

      if (attempt === FIX_METADATA_MAX_RETRIES) {
        break;
      }

      const delayMilliseconds = FIX_METADATA_RETRY_BASE_DELAY_MS * (attempt + 1);
      await this.wait(delayMilliseconds);
    }

    return null;
  }

  private async wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  private fixMetadataKey(messageId: string): string {
    return `statsFix:${messageId}`;
  }

  private manualMetadataKey(messageId: string): string {
    return `statsManual:${messageId}`;
  }
}
