import type {
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageTopLevelComponent,
  APIButtonComponentWithCustomId,
} from "discord-api-types/v10";
import { ComponentType, ButtonStyle } from "discord-api-types/v10";
import type { DiscordService } from "../services/discord/discord.mjs";
import { BaseTableEmbed } from "./base-table-embed.mjs";

// For POC: 10 seconds for testing, production should be 3 minutes
const ALARM_INTERVAL_MS = 10 * 1000; // 10 seconds
// const ALARM_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes (production)

export enum InteractionComponent {
  Pause = "btn_track_pause",
  Resume = "btn_track_resume",
  Stop = "btn_track_stop",
  Refresh = "btn_track_refresh",
}

export type TrackingStatus = "active" | "paused" | "stopped";

interface LiveTrackerEmbedData {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  status: TrackingStatus;
  isPaused: boolean;
  lastUpdated?: Date;
  nextCheck?: Date;
}

interface LiveTrackerEmbedServices {
  discordService: DiscordService;
}

export class LiveTrackerEmbed extends BaseTableEmbed {
  private readonly services: LiveTrackerEmbedServices;
  private readonly data: LiveTrackerEmbedData;

  constructor(services: LiveTrackerEmbedServices, data: LiveTrackerEmbedData) {
    super();
    this.services = services;
    this.data = data;
  }

  get embed(): APIEmbed {
    const { status, queueNumber, userId, lastUpdated, nextCheck, isPaused } = this.data;
    const { discordService } = this.services;

    const userDisplay = `<@${userId}>`;
    const statusEmoji = this.getStatusEmoji(status, isPaused);
    const statusText = this.getStatusText(status, isPaused);

    const embed: APIEmbed = {
      title: `${statusEmoji} Live Tracker - Queue #${queueNumber.toString()}`,
      color: this.getEmbedColor(status, isPaused),
      description: `**${statusText}**`,
    };

    // Mock series data following series-overview-embed pattern
    const titles = ["Map", "Mode", "Score"];
    const mockData = [
      titles, // Header row
      ["Recharge", "Slayer", "Team Alpha 50 - 42 Team Beta"],
      ["Live Fire", "CTF", "Team Alpha 3 - 1 Team Beta"],
      ["Bazaar", "Strongholds", "Team Beta 250 - 213 Team Alpha"],
    ];

    this.addEmbedFields(embed, titles, mockData);
    embed.fields ??= [];

    const currentTime = new Date();
    const lastUpdateText = lastUpdated
      ? discordService.getTimestamp(lastUpdated.toISOString(), "f")
      : discordService.getTimestamp(currentTime.toISOString(), "f");
    const nextCheckText = ((): string => {
      if (status === "stopped") {
        return "*Stopped*";
      }
      if (isPaused) {
        return "*Paused*";
      }
      if (nextCheck) {
        return discordService.getTimestamp(nextCheck.toISOString(), "R");
      }
      const nextAlarmTime = new Date(currentTime.getTime() + ALARM_INTERVAL_MS);
      return discordService.getTimestamp(nextAlarmTime.toISOString(), "R");
    })();

    embed.fields.push({
      name: "Current Series",
      value: "**Team Alpha** 2 - 1 **Team Beta**",
      inline: true,
    });
    embed.fields.push({
      name: "Last Updated",
      value: lastUpdateText,
      inline: true,
    });
    embed.fields.push({
      name: "Next Check",
      value: nextCheckText,
      inline: true,
    });
    embed.fields.push({
      name: "",
      value: `-# Live tracking started by ${userDisplay}`,
    });

    return embed;
  }

  get actions(): APIMessageTopLevelComponent[] {
    const { status, isPaused } = this.data;
    const components: APIButtonComponentWithCustomId[] = [];

    if (status === "active" && !isPaused) {
      components.push({
        type: ComponentType.Button,
        custom_id: InteractionComponent.Pause,
        label: "Pause",
        style: ButtonStyle.Secondary,
        emoji: { name: "⏸️" },
      });
    }

    if (status === "paused" || isPaused) {
      components.push({
        type: ComponentType.Button,
        custom_id: InteractionComponent.Resume,
        label: "Resume",
        style: ButtonStyle.Success,
        emoji: { name: "▶️" },
      });
    }

    if (status !== "stopped") {
      components.push({
        type: ComponentType.Button,
        custom_id: InteractionComponent.Refresh,
        label: "Refresh Now",
        style: ButtonStyle.Primary,
        emoji: { name: "🔄" },
      });
    }

    if (status !== "stopped") {
      components.push({
        type: ComponentType.Button,
        custom_id: InteractionComponent.Stop,
        label: "Stop",
        style: ButtonStyle.Danger,
        emoji: { name: "⏹️" },
      });
    }

    return components.length > 0
      ? [
          {
            type: ComponentType.ActionRow,
            components,
          },
        ]
      : [];
  }

  toMessageData(): APIInteractionResponseCallbackData {
    return {
      embeds: [this.embed],
      components: this.actions,
    };
  }

  private getStatusEmoji(status: TrackingStatus, isPaused: boolean): string {
    if (isPaused || status === "paused") {
      return "⏸️";
    }
    if (status === "stopped") {
      return "⏹️";
    }
    return "🟢";
  }

  private getStatusText(status: TrackingStatus, isPaused: boolean): string {
    if (isPaused || status === "paused") {
      return "Live Tracking Paused";
    }
    if (status === "stopped") {
      return "Live Tracking Stopped";
    }
    return "Live Tracking Active";
  }

  private getEmbedColor(status: TrackingStatus, isPaused: boolean): number {
    if (isPaused || status === "paused") {
      return 0xffa500; // Orange
    }
    if (status === "stopped") {
      return 0x808080; // Gray
    }
    return 0x28a745; // Green for live/active (positive state)
  }
}
