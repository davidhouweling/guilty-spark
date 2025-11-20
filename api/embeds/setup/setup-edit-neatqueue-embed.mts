import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

interface SetupEditNeatQueueEmbedData {
  readonly description: string;
  readonly fields: APIEmbedField[];
}

export class SetupEditNeatQueueEmbed {
  constructor(private readonly data: SetupEditNeatQueueEmbedData) {}

  get embed(): APIEmbed {
    return {
      title: "Edit NeatQueue Integration",
      description: this.data.description,
      fields: this.data.fields,
      color: EmbedColors.INFO,
    };
  }
}
