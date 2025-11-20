import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

interface ConnectMainEmbedData {
  readonly fields: APIEmbedField[];
}

export class ConnectMainEmbed {
  constructor(private readonly data: ConnectMainEmbedData) {}

  getEmbed(): APIEmbed {
    return {
      title: "Connect Discord to Halo",
      description: [
        "Connecting your Discord account to Halo account, within Guilty Spark, allows Guilty Spark to find your matches and correctly track and report on series you have played.",
        "",
        "Click the button below to search for your gamertag and recent game history.",
      ].join("\n"),
      fields: this.data.fields,
      color: EmbedColors.INFO,
    };
  }
}
