import type {
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageTopLevelComponent,
  APIButtonComponentWithCustomId,
  APIGuildMember,
} from "discord-api-types/v10";
import { ComponentType, ButtonStyle } from "discord-api-types/v10";
import type { DiscordService } from "../services/discord/discord.mjs";
import { BaseTableEmbed } from "./base-table-embed.mjs";

// Production: 3 minutes for live tracking (user-facing display)
const DISPLAY_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes shown to users

export enum InteractionComponent {
  Pause = "btn_track_pause",
  Resume = "btn_track_resume",
  Stop = "btn_track_stop",
  Refresh = "btn_track_refresh",
}

export type TrackingStatus = "active" | "paused" | "stopped";

export interface EnrichedMatchData {
  matchId: string;
  gameTypeAndMap: string;
  gameDuration: string;
  teamScores: number[];
}

interface LiveTrackerEmbedData {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  status: TrackingStatus;
  isPaused: boolean;
  lastUpdated?: Date;
  nextCheck?: Date;
  enrichedMatches?: EnrichedMatchData[];
  teams?: {
    name: string;
    players: APIGuildMember[];
  }[];
  // Enhanced error handling for exponential backoff display
  errorState?: {
    consecutiveErrors: number;
    backoffMinutes: number;
    lastSuccessTime: string;
    lastErrorMessage?: string | undefined;
  };
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
    const { status, queueNumber, userId, lastUpdated, nextCheck, isPaused, enrichedMatches, teams } = this.data;
    const { discordService } = this.services;

    const userDisplay = `<@${userId}>`;
    const statusEmoji = this.getStatusEmoji(status, isPaused);
    const statusText = this.getStatusText(status, isPaused);

    const embed: APIEmbed = {
      title: `${statusEmoji} Live Tracker - Queue #${queueNumber.toString()}`,
      color: this.getEmbedColor(status, isPaused),
      description: `**${statusText}**`,
    };

    // Create series data table if we have enriched match data
    if (enrichedMatches && enrichedMatches.length > 0) {
      const titles = ["Game", "Duration", "Score"];
      const tableData = [titles]; // Header row

      for (const match of enrichedMatches) {
        const gameScore = this.formatGameScore(match.teamScores);
        tableData.push([match.gameTypeAndMap, match.gameDuration, gameScore]);
      }

      this.addEmbedFields(embed, titles, tableData);
    } else {
      // Show waiting for matches message
      const titles = ["Status"];
      const tableData = [titles, ["⏳ Waiting for matches..."]];
      this.addEmbedFields(embed, titles, tableData);
    }

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
      const nextAlarmTime = new Date(currentTime.getTime() + DISPLAY_INTERVAL_MS);
      return discordService.getTimestamp(nextAlarmTime.toISOString(), "R");
    })();

    // Calculate current series score if we have data
    let seriesScoreText = "⏳ No matches yet";
    if (enrichedMatches && enrichedMatches.length > 0 && teams && teams.length >= 2) {
      // Group matches by game type and map, keeping only the last (final) result for each
      const gameResults = new Map<string, EnrichedMatchData>();

      for (const match of enrichedMatches) {
        const gameKey = match.gameTypeAndMap; // Use the combined game type and map as key
        gameResults.set(gameKey, match); // This will overwrite previous attempts with the final result
      }

      // Count wins per team using a map to handle any number of teams
      const teamWins = new Map<number, number>();

      // Initialize win counts for all teams
      for (let i = 0; i < teams.length; i++) {
        teamWins.set(i, 0);
      }

      // Count wins from final game results only
      for (const finalMatch of gameResults.values()) {
        let winningTeam: number | null = null;
        let maxScore = -1;

        // Find the team with the highest score
        for (let i = 0; i < finalMatch.teamScores.length; i++) {
          const score = finalMatch.teamScores[i] ?? 0;
          if (score > maxScore) {
            maxScore = score;
            winningTeam = i;
          } else if (score === maxScore) {
            // Tie - no clear winner
            winningTeam = null;
          }
        }

        if (winningTeam !== null) {
          const currentWins = teamWins.get(winningTeam) ?? 0;
          teamWins.set(winningTeam, currentWins + 1);
        }
      }

      // Format the series score for display
      if (teams.length === 2 && teams[0] && teams[1]) {
        // Standard 2-team format
        const team1Wins = teamWins.get(0) ?? 0;
        const team2Wins = teamWins.get(1) ?? 0;
        seriesScoreText = `**${teams[0].name}** ${team1Wins.toString()} : ${team2Wins.toString()} **${teams[1].name}**`;
      } else {
        // Multi-team format
        const teamScores = teams.map((team, index) => {
          const wins = teamWins.get(index) ?? 0;
          return `**${team.name}** ${wins.toString()}`;
        });
        seriesScoreText = teamScores.join(" : ");
      }
    }

    embed.fields.push({
      name: "Current Series",
      value: seriesScoreText,
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

  private formatGameScore(teamScores: number[]): string {
    return teamScores.join(" - ");
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
}
