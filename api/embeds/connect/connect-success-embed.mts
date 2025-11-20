import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

export class ConnectSuccessEmbed {
  getEmbed(fields?: APIEmbedField[]): APIEmbed {
    return {
      title: "Discord account connected to Halo",
      description: "Your Discord account has been successfully connected to your Halo account.",
      color: EmbedColors.SUCCESS,
      ...(fields && fields.length > 0 ? { fields } : {}),
    };
  }
}
