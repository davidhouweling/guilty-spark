import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

interface SetupAddNeatQueueEmbedData {
  readonly description: string;
  readonly stepNumber: number;
  readonly stepQuestion: string;
}

export class SetupAddNeatQueueEmbed {
  constructor(private readonly data: SetupAddNeatQueueEmbedData) {}

  get embed(): APIEmbed {
    return {
      title: "Add NeatQueue Integration",
      description: this.data.description,
      fields: [
        {
          name: `Step ${this.data.stepNumber.toLocaleString()}`,
          value: this.data.stepQuestion,
        },
      ],
      color: EmbedColors.INFO,
    };
  }
}
