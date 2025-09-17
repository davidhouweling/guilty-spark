import type {
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageTopLevelComponent,
  APIButtonComponentWithCustomId,
} from "discord-api-types/v10";
import { ComponentType, ButtonStyle } from "discord-api-types/v10";
import { differenceInMilliseconds, addMinutes, compareAsc } from "date-fns";
import type { DiscordService } from "../services/discord/discord.mjs";
import { Preconditions } from "../base/preconditions.mjs";
import { BaseTableEmbed } from "./base-table-embed.mjs";

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
  endTime: Date | string;
}

export interface LiveTrackerEmbedData {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  status: TrackingStatus;
  isPaused: boolean;
  lastUpdated: Date | string | undefined;
  nextCheck: Date | string | undefined;
  enrichedMatches: EnrichedMatchData[] | undefined;
  seriesScore: string | undefined;
  substitutions?:
    | {
        playerOutId: string;
        playerInId: string;
        teamIndex: number;
        teamName: string;
        timestamp: string;
      }[]
    | undefined;
  errorState:
    | {
        consecutiveErrors: number;
        backoffMinutes: number;
        lastSuccessTime: string;
        lastErrorMessage?: string | undefined;
      }
    | undefined;
  lastRefreshAttempt?: string | undefined;
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
    const statusText = this.getStatusText(status, isPaused);

    const embed: APIEmbed = {
      title: `Live Tracker - Queue #${queueNumber.toString()}`,
      color: this.getEmbedColor(status, isPaused),
      description: `**${statusText}**`,
    };

    if (hasMatches) {
      const titles = ["Game", "Duration", `Score${seriesScore?.includes("🦅") === true ? " (🦅:🐍)" : ""}`];
      const tableData = [titles];
      const sortedSubstitutions = [...(this.data.substitutions ?? [])].sort(
        (a, b) => compareAsc(new Date(a.timestamp), new Date(b.timestamp)),
      );

      let substitutionIndex = 0;

      for (const { matchId, gameTypeAndMap, duration: gameDuration, gameScore } of enrichedMatches) {
        while (substitutionIndex < sortedSubstitutions.length) {
          const substitution = sortedSubstitutions[substitutionIndex];
          if (!substitution) {
            break;
          }

          tableData.push(this.createSubstitutionRow(substitution));
          substitutionIndex++;
          break;
        }

        tableData.push([
          `[${gameTypeAndMap}](https://halodatahive.com/Infinite/Match/${matchId})`,
          gameDuration,
          gameScore,
        ]);
      }

      while (substitutionIndex < sortedSubstitutions.length) {
        const substitution = sortedSubstitutions[substitutionIndex];
        if (substitution) {
          tableData.push(this.createSubstitutionRow(substitution));
        }
        substitutionIndex++;
      }

      this.addEmbedFields(embed, titles, tableData);
    } else {
      const titles = ["Status"];
      const tableData = [titles];

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
    const lastUpdateText =
      lastUpdated != null
        ? discordService.getTimestamp(new Date(lastUpdated).toISOString(), "f")
        : discordService.getTimestamp(currentTime.toISOString(), "f");
    const nextCheckText = ((): string => {
      if (status === "stopped") {
        return "*Stopped*";
      }
      if (isPaused) {
        return "*Paused*";
      }
      if (nextCheck != null) {
        return discordService.getTimestamp(new Date(nextCheck).toISOString(), "R");
      }
      const nextAlarmTime = addMinutes(currentTime, 3);
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
            new Date(Preconditions.checkExists(enrichedMatches[enrichedMatches.length - 1]).endTime).toISOString(),
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

    if (this.data.errorState && this.data.errorState.consecutiveErrors > 0) {
      const errorMessage = this.getErrorMessage(this.data.errorState);
      embed.fields.push({
        name: "⚠️ Status Alert",
        value: errorMessage,
        inline: false,
      });
    }

    const cooldownInfo = this.getCooldownInfo();
    if (cooldownInfo.inCooldown) {
      embed.fields.push({
        name: "🔄 Refresh Cooldown",
        value: cooldownInfo.message,
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
      return `Having trouble fetching data, will retry in ${backoffMinutes.toString()} minutes`;
    } else {
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

    return [substitutionText, "", ""];
  }

  private getCooldownInfo(): { inCooldown: boolean; message: string } {
    const REFRESH_COOLDOWN_MS = 30 * 1000; // 30 seconds

    if (this.data.lastRefreshAttempt == null || this.data.lastRefreshAttempt === "") {
      return { inCooldown: false, message: "" };
    }

    const lastAttemptTime = new Date(this.data.lastRefreshAttempt);
    const currentTime = new Date();
    const timeSinceLastAttempt = differenceInMilliseconds(currentTime, lastAttemptTime);
    const remainingMs = REFRESH_COOLDOWN_MS - timeSinceLastAttempt;

    if (remainingMs <= 0) {
      return { inCooldown: false, message: "" };
    }

    const remainingSeconds = Math.ceil(remainingMs / 1000);
    return {
      inCooldown: true,
      message: `Please wait ${remainingSeconds.toString()} seconds before refreshing again`,
    };
  }
}
