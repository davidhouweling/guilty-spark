import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

export class ConnectLoadingEmbed {
  getEmbed(): APIEmbed {
    return {
      title: "Gamertag search...",
      description: "Searching for your gamertag and recent game history...",
      color: EmbedColors.NEUTRAL,
    };
  }
}
