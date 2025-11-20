import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

interface SetupConfigEmbedData {
  readonly configDisplay: string;
}

export class SetupConfigEmbed {
  constructor(private readonly data: SetupConfigEmbedData) {}

  getEmbed(): APIEmbed {
    return {
      title: "Server Configuration",
      description: "Current configuration for your server:",
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
