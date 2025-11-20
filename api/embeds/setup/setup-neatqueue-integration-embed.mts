import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

interface SetupNeatQueueIntegrationEmbedData {
  readonly description: string;
  readonly fields: APIEmbedField[];
}

export class SetupNeatQueueIntegrationEmbed {
  constructor(private readonly data: SetupNeatQueueIntegrationEmbedData) {}

  get embed(): APIEmbed {
    return {
      title: "NeatQueue Integration",
      description: this.data.description,
      fields: this.data.fields,
      color: EmbedColors.INFO,
    };
  }
}
