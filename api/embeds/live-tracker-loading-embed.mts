import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "./colors.mjs";

export class LiveTrackerLoadingEmbed {
  private readonly description: string;

  constructor(description = "Setting up live tracking...") {
    this.description = description;
  }

  get embed(): APIEmbed {
    return {
      title: "🔄 Starting Live Tracker",
      description: this.description,
      color: EmbedColors.INFO,
    };
  }
}
