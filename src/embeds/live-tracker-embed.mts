import type {
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageTopLevelComponent,
  APIButtonComponentWithCustomId,
} from "discord-api-types/v10";
import { ComponentType, ButtonStyle } from "discord-api-types/v10";
import type { DiscordService } from "../services/discord/discord.mjs";
import { Preconditions } from "../base/preconditions.mjs";
import { BaseTableEmbed } from "./base-table-embed.mjs";

// Production: 3 minutes for live tracking (user-facing display)
const DISPLAY_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes shown to users

export enum InteractionComponent {
  Refresh = "btn_track_refresh",
  Pause = "btn_track_pause",
  Resume = "btn_track_resume",
  Repost = "btn_track_repost",
}

export type TrackingStatus = "active" | "paused" | "stopped";

export interface EnrichedMatchData {
  matchId: string;
  gameTypeAndMap: string;
  duration: string;
  gameScore: string;
  endTime: Date;
}

export interface LiveTrackerEmbedData {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  status: TrackingStatus;
  isPaused: boolean;
  lastUpdated: Date | undefined;
  nextCheck: Date | undefined;
  enrichedMatches: EnrichedMatchData[] | undefined;
  seriesScore: string | undefined;
  // Track substitutions for display
  substitutions?:
    | {
        playerOutId: string;
        playerInId: string;
        teamIndex: number;
        teamName: string; // NeatQueue team name for display
        timestamp: string;
      }[]
    | undefined;
  // Enhanced error handling for exponential backoff display
  errorState:
    | {
        consecutiveErrors: number;
        backoffMinutes: number;
        lastSuccessTime: string;
        lastErrorMessage?: string | undefined;
      }
    | undefined;
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
    const { status, queueNumber, userId, lastUpdated, nextCheck, isPaused, enrichedMatches, seriesScore } = this.data;
    const { discordService } = this.services;

    const hasMatches = enrichedMatches != null && enrichedMatches.length > 0;
    const userDisplay = `<@${userId}>`;
    const statusEmoji = this.getStatusEmoji(status, isPaused);
    const statusText = this.getStatusText(status, isPaused);

    const embed: APIEmbed = {
      title: `${statusEmoji} Live Tracker - Queue #${queueNumber.toString()}`,
      color: this.getEmbedColor(status, isPaused),
      description: `**${statusText}**`,
    };

    // Create series data table if we have enriched match data
    if (hasMatches) {
      const titles = ["Game", "Duration", `Score${seriesScore?.includes("🦅") === true ? " (🦅:🐍)" : ""}`];
      const tableData = [titles]; // Header row

      // Sort substitutions by timestamp for chronological display
      const sortedSubstitutions = [...(this.data.substitutions ?? [])].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      let substitutionIndex = 0;

      for (const { matchId, gameTypeAndMap, duration: gameDuration, gameScore } of enrichedMatches) {
        // For live tracker, we'll add substitutions between each match
        // This simulates them happening chronologically based on when they were recorded
        while (substitutionIndex < sortedSubstitutions.length) {
          const substitution = sortedSubstitutions[substitutionIndex];
          if (!substitution) {
            break;
          }

          // Add substitution before current match
          tableData.push(this.createSubstitutionRow(substitution));
          substitutionIndex++;
          // Only add one substitution per match for now, can be enhanced later
          break;
        }

        tableData.push([
          `[${gameTypeAndMap}](https://halodatahive.com/Infinite/Match/${matchId})`,
          gameDuration,
          gameScore,
        ]);
      }

      // Add any remaining substitutions after the last match
      while (substitutionIndex < sortedSubstitutions.length) {
        const substitution = sortedSubstitutions[substitutionIndex];
        if (substitution) {
          tableData.push(this.createSubstitutionRow(substitution));
        }
        substitutionIndex++;
      }

      this.addEmbedFields(embed, titles, tableData);
    } else {
      // Show waiting for matches message, but include any substitutions that have occurred
      const titles = ["Status"];
      const tableData = [titles];

      // If we have substitutions but no matches yet, show them
      if (this.data.substitutions && this.data.substitutions.length > 0) {
        for (const substitution of this.data.substitutions) {
          tableData.push(this.createSubstitutionRow(substitution, 1));
        }
        tableData.push(["⏳ *Waiting for first match to complete...*"]);
      } else {
        tableData.push(["⏳ *Waiting for first match to complete...*"]);
      }

      this.addEmbedFields(embed, titles, tableData);
    }

    embed.fields ??= [];
    embed.fields.push({
      name: "\n",
      value: "\n",
      inline: false,
    });

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
      const nextAlarmTime = new Date(currentTime.getTime() + DISPLAY_INTERVAL_MS);
      return discordService.getTimestamp(nextAlarmTime.toISOString(), "R");
    })();

    embed.fields.push({
      name: "Series score",
      value: seriesScore ?? "🦅 0:0 🐍",
      inline: true,
    });
    embed.fields.push({
      name: "Last game completed at",
      value: hasMatches
        ? discordService.getTimestamp(
            Preconditions.checkExists(enrichedMatches[enrichedMatches.length - 1]).endTime.toISOString(),
            "R",
          )
        : "-",
      inline: true,
    });

    embed.fields.push({
      name: "\n",
      value: "\n",
      inline: false,
    });

    embed.fields.push({
      name: "Last updated",
      value: lastUpdateText,
      inline: true,
    });
    embed.fields.push({
      name: "Next check",
      value: nextCheckText,
      inline: true,
    });

    // Add error state information if there are errors
    if (this.data.errorState && this.data.errorState.consecutiveErrors > 0) {
      const errorMessage = this.getErrorMessage(this.data.errorState);
      embed.fields.push({
        name: "⚠️ Status Alert",
        value: errorMessage,
        inline: false,
      });
    }

    embed.fields.push({
      name: "",
      value: `-# Live tracking started by ${userDisplay}`,
    });

    return embed;
  }

  get actions(): APIMessageTopLevelComponent[] {
    const { status, isPaused } = this.data;
    const components: APIButtonComponentWithCustomId[] = [];

    if (status !== "stopped") {
      components.push({
        type: ComponentType.Button,
        custom_id: InteractionComponent.Refresh,
        label: "Refresh Now",
        style: ButtonStyle.Primary,
        emoji: { name: "🔄" },
      });
    }

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
        style: ButtonStyle.Primary,
        emoji: { name: "▶️" },
      });
    }

    const actions: APIMessageTopLevelComponent[] =
      components.length > 0
        ? [
            {
              type: ComponentType.ActionRow,
              components,
            },
          ]
        : [];

    if (actions.length > 0) {
      actions.push({
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            custom_id: InteractionComponent.Repost,
            label: "Move to bottom of chat",
            style: ButtonStyle.Secondary,
            emoji: {
              name: "⏬",
            },
          },
        ],
      });
    }

    return actions;
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

  private getErrorMessage(errorState: NonNullable<LiveTrackerEmbedData["errorState"]>): string {
    const { consecutiveErrors, backoffMinutes, lastErrorMessage } = errorState;

    if (consecutiveErrors === 1) {
      // First error: show warning but continue normal interval
      return `Having trouble fetching data, will retry in ${backoffMinutes.toString()} minutes`;
    } else {
      // Multiple consecutive errors: show backoff
      return (
        `**${consecutiveErrors.toString()} consecutive errors** - retrying in ${backoffMinutes.toString()} minutes\n` +
        `Last error: ${lastErrorMessage ?? "unknown"}`
      );
    }
  }

  private createSubstitutionRow(
    substitution: NonNullable<LiveTrackerEmbedData["substitutions"]>[0],
    columns = 3,
  ): string[] {
    const substitutionText = `*<@${substitution.playerInId}> subbed in for <@${substitution.playerOutId}> (${substitution.teamName})*`;

    if (columns === 1) {
      return [substitutionText];
    }

    // Default case: 3 columns for match table
    return [substitutionText, "", ""];
  }
}
