import type {
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageTopLevelComponent,
  APIButtonComponentWithCustomId,
} from "discord-api-types/v10";
import { ComponentType, ButtonStyle } from "discord-api-types/v10";
import { addMinutes, compareAsc, isBefore } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { DiscordService } from "../services/discord/discord";
import type { LiveTrackerEmbedData } from "../live-tracker/types";
import { BaseTableEmbed } from "./base-table-embed";
import { EmbedColors } from "./colors";

export enum InteractionComponent {
  Refresh = "btn_track_refresh",
  Pause = "btn_track_pause",
  Resume = "btn_track_resume",
  Repost = "btn_track_repost",
  IndividualMatchSelect = "select_track_individual_matches",
  IndividualStartWithoutGames = "btn_track_start_without_games",
}

interface LiveTrackerEmbedServices {
  discordService: DiscordService;
  pagesUrl: string;
}

export class LiveTrackerEmbed extends BaseTableEmbed {
  private readonly services: LiveTrackerEmbedServices;
  private readonly data: LiveTrackerEmbedData;

  constructor(services: LiveTrackerEmbedServices, data: LiveTrackerEmbedData) {
    super();
    this.services = services;
    this.data = data;
  }

  get embeds(): APIEmbed[] {
    const { status, queueNumber, userId, lastUpdated, nextCheck, isPaused, enrichedMatches, seriesScore, seriesData } =
      this.data;
    const { discordService } = this.services;

    const hasMatches = enrichedMatches != null && enrichedMatches.length > 0;
    const userDisplay = `<@${userId}>`;
    const statusText = this.getStatusText(status, isPaused);
    const embedColor = this.getEmbedColor(status, isPaused);

    const titles = hasMatches
      ? ["Game", "Duration", `Score${seriesScore?.includes("🦅") === true ? " (🦅:🐍)" : ""}`]
      : ["Status"];

    // Build all table data rows
    const tableData: string[][] = [titles];

    if (hasMatches) {
      const sortedSubstitutions = this.processSortedSubstitutions();
      let substitutionIndex = 0;

      for (const { matchId, gameTypeAndMap, duration: gameDuration, gameScore, endTime } of enrichedMatches) {
        while (substitutionIndex < sortedSubstitutions.length) {
          const substitution = sortedSubstitutions[substitutionIndex];
          if (!substitution || isBefore(new Date(endTime), new Date(substitution.timestamp))) {
            break;
          }

          tableData.push(this.createSubstitutionRow(substitution));
          substitutionIndex++;
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
    } else {
      if (this.data.substitutions && this.data.substitutions.length > 0) {
        for (const substitution of this.data.substitutions) {
          tableData.push(this.createSubstitutionRow(substitution, 1));
        }
        tableData.push(["⏳ *Waiting for first match to complete...*"]);
      } else {
        tableData.push(["⏳ *Waiting for first match to complete...*"]);
      }
    }

    // Build post-table fields content (these stay together on the last embed)
    const currentTime = new Date();
    const lastUpdateText =
      lastUpdated != null
        ? discordService.getTimestamp(this.toISOString(lastUpdated), "f")
        : discordService.getTimestamp(this.toISOString(currentTime), "f");
    const nextCheckText = ((): string => {
      if (status === "stopped") {
        return "*Stopped*";
      }
      if (isPaused) {
        return "*Paused*";
      }
      if (nextCheck != null) {
        return discordService.getTimestamp(this.toISOString(nextCheck), "R");
      }
      const nextAlarmTime = addMinutes(currentTime, 3);
      return discordService.getTimestamp(this.toISOString(nextAlarmTime), "R");
    })();

    const postTableFieldsContent = [
      seriesData?.seriesScore ?? seriesScore ?? "🦅 0:0 🐍",
      hasMatches
        ? discordService.getTimestamp(
            this.toISOString(Preconditions.checkExists(enrichedMatches[enrichedMatches.length - 1]).endTime),
            "R",
          )
        : "-",
      lastUpdateText,
      nextCheckText,
    ];

    if (this.data.errorState && this.data.errorState.consecutiveErrors > 0) {
      postTableFieldsContent.push(this.getErrorMessage(this.data.errorState));
    }

    let postTableFooterText = `-# Live tracking started by ${userDisplay}`;
    if (seriesData != null) {
      postTableFooterText += `\n-# 📊 Series data from NeatQueue (Server: ${seriesData.seriesId.guildId})`;
    }
    postTableFieldsContent.push(postTableFooterText);

    // Calculate total length of post-table fields
    const postTableFieldsLength = postTableFieldsContent.reduce((sum, content) => sum + content.length, 0);

    const embeds: APIEmbed[] = [];
    const dataRows = tableData.slice(1); // All rows except titles
    let currentRowIndex = 0;

    while (currentRowIndex < dataRows.length) {
      const isFirstEmbed = embeds.length === 0;
      const fieldValues: string[] = Array.from({ length: titles.length }).fill("") as string[];

      // Try to fit as many rows as possible, considering post-table fields on the last pass
      while (currentRowIndex < dataRows.length) {
        const row = Preconditions.checkExists(dataRows[currentRowIndex]);
        const isLastRow = currentRowIndex === dataRows.length - 1;

        // Check if adding this row would exceed the limit
        let canAddRow = true;
        for (let col = 0; col < titles.length; col++) {
          const currentValue = Preconditions.checkExists(fieldValues[col]);
          const rowValue = Preconditions.checkExists(row[col]);
          const newValue = currentValue + (currentValue.length > 0 ? "\n" : "") + rowValue;

          // If this is the last row, also account for post-table fields
          if (isLastRow && newValue.length + postTableFieldsLength > 1024) {
            canAddRow = false;
            break;
          } else if (newValue.length > 1024) {
            canAddRow = false;
            break;
          }
        }

        if (!canAddRow) {
          break;
        }

        // Add the row to all columns
        for (let col = 0; col < titles.length; col++) {
          const rowValue = Preconditions.checkExists(row[col]);
          const currentFieldValue = Preconditions.checkExists(fieldValues[col]);
          fieldValues[col] = currentFieldValue + (currentFieldValue.length > 0 ? "\n" : "") + rowValue;
        }
        currentRowIndex++;
      }

      // Create the embed
      const embed: APIEmbed = {
        color: embedColor,
      };

      if (isFirstEmbed) {
        if (seriesData != null) {
          embed.title = `Live Tracker - NeatQueue Series (Queue #${seriesData.seriesId.queueNumber.toString()})`;
          const teamNames = seriesData.teams.map((t) => t.name).join(" vs ");
          embed.description = `**${statusText}**\n*${teamNames}*`;
        } else {
          embed.title = `Live Tracker - Queue #${queueNumber.toString()}`;
          embed.description = `**${statusText}**`;
        }
      }

      // Add table fields
      embed.fields = [];
      for (let col = 0; col < titles.length; col++) {
        const fieldValue = Preconditions.checkExists(fieldValues[col]);
        embed.fields.push({
          name: Preconditions.checkExists(titles[col]),
          value: fieldValue.length > 0 ? fieldValue : "-",
          inline: true,
        });
      }

      // If this is the last embed (all rows processed), add post-table fields
      if (currentRowIndex >= dataRows.length) {
        this.addSeparatorField(embed);

        // Use series data if available, otherwise fall back to local series score
        const displaySeriesScore = seriesData?.seriesScore ?? seriesScore ?? "🦅 0:0 🐍";
        const seriesScoreLabel = seriesData != null ? "NeatQueue Series Score" : "Series score";

        embed.fields.push({
          name: seriesScoreLabel,
          value: displaySeriesScore,
          inline: true,
        });
        embed.fields.push({
          name: "Last game completed",
          value: hasMatches
            ? discordService.getTimestamp(
                this.toISOString(Preconditions.checkExists(enrichedMatches[enrichedMatches.length - 1]).endTime),
                "R",
              )
            : "-",
          inline: true,
        });

        this.addSeparatorField(embed);

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

        let footerText = `-# Live tracking started by ${userDisplay}`;
        if (seriesData != null) {
          footerText += `\n-# 📊 Series data from NeatQueue (Server: ${seriesData.seriesId.guildId})`;
        }

        embed.fields.push({
          name: "",
          value: footerText,
        });
      }

      embeds.push(embed);
    }

    return embeds;
  }

  get actions(): APIMessageTopLevelComponent[] {
    const { status, guildId, queueNumber, trackerLabel, isPaused } = this.data;
    const components: APIButtonComponentWithCustomId[] = [];

    if (status !== "stopped") {
      components.push(this.createButton(InteractionComponent.Refresh, "Refresh Now", ButtonStyle.Primary, "🔄"));
    }

    if (status === "active" && !isPaused) {
      components.push(this.createButton(InteractionComponent.Pause, "Pause", ButtonStyle.Secondary, "⏸️"));
    }

    if (status === "paused" || isPaused) {
      components.push(this.createButton(InteractionComponent.Resume, "Resume", ButtonStyle.Primary, "▶️"));
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
      // Determine URL format based on tracker type
      const isIndividualTracker = trackerLabel != null && trackerLabel !== "";
      const webUrl = isIndividualTracker
        ? `${this.services.pagesUrl}/tracker?gamertag=${encodeURIComponent(trackerLabel)}`
        : `${this.services.pagesUrl}/tracker?server=${guildId}&queue=${queueNumber.toString()}`;

      actions.push({
        type: ComponentType.ActionRow,
        components: [
          this.createButton(InteractionComponent.Repost, "Move to bottom of chat", ButtonStyle.Secondary, "⏬"),
          {
            type: ComponentType.Button,
            label: "View live stats",
            style: ButtonStyle.Link,
            emoji: {
              name: "📈",
            },
            url: webUrl,
          },
        ],
      });
    }

    return actions;
  }

  toMessageData(): APIInteractionResponseCallbackData {
    return {
      embeds: this.embeds,
      components: this.actions,
    };
  }

  private isEffectivelyPaused(status: LiveTrackerEmbedData["status"], isPaused: boolean): boolean {
    return isPaused || status === "paused";
  }

  private getStatusText(status: LiveTrackerEmbedData["status"], isPaused: boolean): string {
    if (this.isEffectivelyPaused(status, isPaused)) {
      return "Live Tracking Paused";
    }
    if (status === "stopped") {
      return "Live Tracking Stopped";
    }
    return "Live Tracking Active";
  }

  private getEmbedColor(status: LiveTrackerEmbedData["status"], isPaused: boolean): number {
    if (this.isEffectivelyPaused(status, isPaused)) {
      return EmbedColors.WARNING;
    }
    if (status === "stopped") {
      return EmbedColors.INACTIVE;
    }
    return EmbedColors.SUCCESS;
  }

  private addSeparatorField(embed: APIEmbed): void {
    embed.fields ??= [];
    embed.fields.push({
      name: "\n",
      value: "\n",
      inline: false,
    });
  }

  private toISOString(date: Date | string): string {
    return new Date(date).toISOString();
  }

  private createButton(
    customId: InteractionComponent,
    label: string,
    style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger,
    emojiName: string,
  ): APIButtonComponentWithCustomId {
    return {
      type: ComponentType.Button,
      custom_id: customId,
      label,
      style,
      emoji: { name: emojiName },
    };
  }

  private processSortedSubstitutions(): NonNullable<LiveTrackerEmbedData["substitutions"]> {
    return [...(this.data.substitutions ?? [])].sort((a, b) =>
      compareAsc(new Date(a.timestamp), new Date(b.timestamp)),
    );
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
}
