import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "./colors.mjs";

export class LiveTrackerLoadingEmbed {
  get embed(): APIEmbed {
    return {
      title: "🔄 Starting Live Tracker",
      description: "Setting up live tracking for your NeatQueue series...",
      color: EmbedColors.INFO,
    };
  }
}
