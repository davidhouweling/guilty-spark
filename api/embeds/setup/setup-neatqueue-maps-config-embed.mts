import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

interface SetupNeatQueueMapsConfigEmbedData {
  readonly configDisplay: string;
}

export class SetupNeatQueueMapsConfigEmbed {
  constructor(private readonly data: SetupNeatQueueMapsConfigEmbedData) {}

  get embed(): APIEmbed {
    return {
      title: "NeatQueue Informer Maps Configuration",
      description: "",
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
