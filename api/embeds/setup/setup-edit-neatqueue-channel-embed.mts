import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

interface SetupEditNeatQueueChannelEmbedData {
  readonly channelId: string;
  readonly description: string;
}

export class SetupEditNeatQueueChannelEmbed {
  constructor(private readonly data: SetupEditNeatQueueChannelEmbedData) {}

  get embed(): APIEmbed {
    return {
      title: `Edit NeatQueue Integration for <#${this.data.channelId}>`,
      description: this.data.description,
      color: EmbedColors.INFO,
    };
  }
}
