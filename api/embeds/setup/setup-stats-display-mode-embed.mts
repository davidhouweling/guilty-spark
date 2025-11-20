import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

export class SetupStatsDisplayModeEmbed {
  get embed(): APIEmbed {
    return {
      title: "Stats Display Mode",
      description:
        "How stats are displayed when either the `/stats` command is used, or when automatically posting stats for NeatQueue.",
      color: EmbedColors.INFO,
    };
  }
}
