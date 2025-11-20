import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

interface SetupNeatQueueInformerEmbedData {
  readonly description: string;
  readonly configDisplay: string;
}

export class SetupNeatQueueInformerEmbed {
  constructor(private readonly data: SetupNeatQueueInformerEmbedData) {}

  get embed(): APIEmbed {
    return {
      title: "NeatQueue Informer",
      description: this.data.description,
      fields: [
        {
          name: "",
          value: this.data.configDisplay,
        },
      ],
      color: EmbedColors.INFO,
    };
  }
}
