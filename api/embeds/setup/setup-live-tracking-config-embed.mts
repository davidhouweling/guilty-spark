import type { APIEmbed } from "discord-api-types/v10";
import { EmbedColors } from "../colors.mjs";

interface SetupLiveTrackingConfigEmbedData {
  readonly configDisplay: string;
}

export class SetupLiveTrackingConfigEmbed {
  constructor(private readonly data: SetupLiveTrackingConfigEmbedData) {}

  get embed(): APIEmbed {
    return {
      title: "Live Tracking Configuration",
      description: [
        "Configure live tracking features for NeatQueue series.",
        "",
        "**Live Tracking:** Posts real-time updates as matches are played, showing current map, scores, and series progress",
        "**Channel Name Updates:** Updates the queue channel name to include current series score (e.g., `#queue-343 (🦅 2:1 🐍)`), requires live tracking to be enabled",
        "",
        "*Note: Channel name updates require the 'Manage Channels' permission for Guilty Spark (feature will auto disable without permission), run command:*",
        '- `/tempchannels permissions set role="<role>" permission="Manage Channels" value="Allow"`',
      ].join("\n"),
      fields: [
        {
          name: "Current Configuration",
          value: this.data.configDisplay,
        },
      ],
      color: EmbedColors.INFO,
    };
  }
}
