/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/restrict-template-expressions */
import type {
  APIApplicationCommandInteraction,
  APIMessageComponentButtonInteraction,
  APIApplicationCommandInteractionDataBasicOption,
} from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChannelType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  InteractionContextType,
} from "discord-api-types/v10";
import type { BaseInteraction, CommandData, ExecuteResponse } from "../base/base.mjs";
import type { LiveTrackerStartData, LiveTrackerState } from "../../durable-objects/live-tracker-do.mjs";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { LiveTrackerEmbed, InteractionComponent } from "../../embeds/live-tracker-embed.mjs";
import type { LiveTrackerEmbedData } from "../../embeds/live-tracker-embed.mjs";

export class TrackCommand extends BaseCommand {
  readonly data: CommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "track",
      description: "Live tracking for matches",
      contexts: [InteractionContextType.Guild],
      default_member_permissions: null,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "neatqueue",
          description: "Start live tracking for a NeatQueue series",
          options: [
            {
              name: "channel",
              description: "The channel with the queue to track (defaults to current channel)",
              type: ApplicationCommandOptionType.Channel,
              channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
              required: false,
            },
          ],
        },
      ],
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.Pause,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.Resume,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.Refresh,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.Repost,
      },
    },
  ];

  execute(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    try {
      switch (type) {
        case InteractionType.ApplicationCommand: {
          return this.applicationCommandJob(interaction);
        }
        case InteractionType.MessageComponent: {
          return this.messageComponentResponse(interaction as APIMessageComponentButtonInteraction);
        }
        case InteractionType.ModalSubmit: {
          throw new Error("This command cannot be used in this context.");
        }
        default:
          throw new UnreachableError(type);
      }
    } catch (error) {
      this.services.logService.error(error as Error);

      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `Error: ${error instanceof Error ? error.message : "unknown"}`,
            flags: MessageFlags.Ephemeral,
          },
        },
      };
    }
  }

  private applicationCommandJob(interaction: APIApplicationCommandInteraction): ExecuteResponse {
    if (interaction.data.type !== ApplicationCommandType.ChatInput) {
      throw new Error("This command can only be used as a chat input command.");
    }

    const { options } = interaction.data;
    const subcommand = options?.[0];

    if (subcommand?.type !== ApplicationCommandOptionType.Subcommand) {
      throw new Error("Invalid subcommand.");
    }

    switch (subcommand.name) {
      case "neatqueue": {
        return this.neatqueueSubcommand(interaction, subcommand.options ?? []);
      }
      default: {
        throw new Error(`Unknown subcommand: ${subcommand.name}`);
      }
    }
  }

  private neatqueueSubcommand(
    interaction: APIApplicationCommandInteraction,
    options: APIApplicationCommandInteractionDataBasicOption[],
  ): ExecuteResponse {
    const channelOption = options.find((opt) => opt.name === "channel");
    const targetChannelId =
      channelOption?.type === ApplicationCommandOptionType.Channel ? channelOption.value : interaction.channel.id;

    if (!targetChannelId) {
      throw new Error("Unable to determine target channel.");
    }

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      },
      jobToComplete: async (): Promise<void> => {
        const userId = Preconditions.checkExists(
          interaction.member?.user.id ?? interaction.user?.id,
          "expected user id",
        );

        const guildId = interaction.guild_id ?? "";

        try {
          // Discover active queue data from the target channel
          const activeQueueData = await this.services.discordService.getTeamsFromQueueChannel(guildId, targetChannelId);

          if (!activeQueueData) {
            throw new EndUserError("No active queue found in the specified channel.", {
              errorType: EndUserErrorType.WARNING,
              handled: true,
            });
          }

          const queueNumber = activeQueueData.queue;

          // Create Durable Object instance
          const doId = this.env.LIVE_TRACKER_DO.idFromName(`${guildId}:${targetChannelId}:${queueNumber.toString()}`);
          const doStub = this.env.LIVE_TRACKER_DO.get(doId);

          // Start the live tracker with real queue data
          const startData: LiveTrackerStartData = {
            userId,
            guildId,
            channelId: targetChannelId,
            queueNumber,
            interactionToken: interaction.token,
            teams: activeQueueData.teams,
            queueStartTime: activeQueueData.timestamp.toISOString(),
          };

          const startResponse = await doStub.fetch("http://do/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(startData),
          });

          if (!startResponse.ok) {
            throw new Error(`Failed to start live tracker: ${startResponse.status.toString()}`);
          }

          const startResult = (await startResponse.json()) as { success: boolean };
          if (!startResult.success) {
            throw new Error("Durable Object failed to start tracking");
          }
        } catch (error) {
          if (error instanceof EndUserError) {
            // Send user-friendly error
            await this.services.discordService.updateDeferredReply(interaction.token, {
              embeds: [error.discordEmbed],
              components: error.discordActions,
            });
            return;
          }

          // Handle unexpected error
          this.services.logService.error("Failed to start live tracker", new Map([["error", String(error)]]));

          const errorEmbed = new LiveTrackerEmbed(
            { discordService: this.services.discordService },
            {
              userId,
              guildId,
              channelId: targetChannelId,
              queueNumber: 0,
              status: "stopped",
              isPaused: false,
              lastUpdated: undefined,
              nextCheck: undefined,
              enrichedMatches: undefined,
              seriesScore: undefined,
              errorState: undefined,
            },
          );

          await this.services.discordService.updateDeferredReply(interaction.token, errorEmbed.toMessageData());
        }
      },
    };
  }

  private messageComponentResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    const customId = interaction.data.custom_id as InteractionComponent;

    switch (customId) {
      case InteractionComponent.Pause: {
        return this.pauseResponse(interaction);
      }
      case InteractionComponent.Resume: {
        return this.resumeResponse(interaction);
      }
      case InteractionComponent.Refresh: {
        return this.refreshResponse(interaction);
      }
      case InteractionComponent.Repost: {
        return this.repostResponse(interaction);
      }
      default: {
        throw new UnreachableError(customId);
      }
    }
  }

  private pauseResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        const userId = Preconditions.checkExists(
          interaction.member?.user.id ?? interaction.user?.id,
          "expected user id",
        );

        const guildId = interaction.guild_id ?? "";
        const channelId = interaction.channel.id;

        // Get current state to extract queue number
        let queueNumber = 0; // Default fallback

        try {
          const statusResponse = await this.getTrackerStatus(guildId, channelId);
          if (!statusResponse?.state) {
            throw new Error("No active live tracker found");
          }

          ({ queueNumber } = statusResponse.state);
          // Get the Durable Object instance
          const doId = this.env.LIVE_TRACKER_DO.idFromName(`${guildId}:${channelId}:${queueNumber.toString()}`);
          const doStub = this.env.LIVE_TRACKER_DO.get(doId);

          // Call pause endpoint
          const pauseResponse = await doStub.fetch("http://do/pause", {
            method: "POST",
          });

          if (!pauseResponse.ok) {
            throw new Error(`Failed to pause live tracker: ${pauseResponse.status.toString()}`);
          }

          const pauseResult = (await pauseResponse.json()) as {
            success: boolean;
            state: LiveTrackerState;
            embedData?: LiveTrackerEmbedData;
          };

          if (!pauseResult.success) {
            throw new Error("Durable Object failed to pause tracking");
          }

          let liveTrackerEmbed;
          if (pauseResult.embedData) {
            liveTrackerEmbed = new LiveTrackerEmbed(
              { discordService: this.services.discordService },
              pauseResult.embedData,
            );
          } else {
            const currentTime = new Date();
            liveTrackerEmbed = new LiveTrackerEmbed(
              { discordService: this.services.discordService },
              {
                userId,
                guildId,
                channelId,
                queueNumber,
                status: "paused",
                isPaused: true,
                lastUpdated: currentTime,
                nextCheck: undefined,
                enrichedMatches: undefined,
                seriesScore: undefined,
                errorState: undefined,
              },
            );
          }

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );

          this.services.logService.info(
            "Live tracker paused via button",
            new Map([
              ["guildId", guildId],
              ["channelId", channelId],
              ["queueNumber", queueNumber.toString()],
              ["userId", userId],
            ]),
          );
        } catch (error) {
          this.services.logService.error("Failed to pause live tracker", new Map([["error", String(error)]]));

          // Still update the embed to show some response, even if DO call failed
          const liveTrackerEmbed = new LiveTrackerEmbed(
            { discordService: this.services.discordService },
            {
              userId,
              guildId,
              channelId,
              queueNumber,
              status: "stopped", // Show as stopped if we can't pause
              isPaused: false,
              lastUpdated: undefined,
              nextCheck: undefined,
              enrichedMatches: undefined,
              seriesScore: undefined,
              errorState: undefined,
            },
          );

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );
        }
      },
    };
  }

  private resumeResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        const userId = Preconditions.checkExists(
          interaction.member?.user.id ?? interaction.user?.id,
          "expected user id",
        );

        const guildId = interaction.guild_id ?? "";
        const channelId = interaction.channel.id;

        // Get current state to extract queue number
        let queueNumber = 0; // Default fallback

        try {
          const statusResponse = await this.getTrackerStatus(guildId, channelId);
          if (!statusResponse?.state) {
            throw new Error("No active live tracker found");
          }

          ({ queueNumber } = statusResponse.state);
          // Get the Durable Object instance
          const doId = this.env.LIVE_TRACKER_DO.idFromName(`${guildId}:${channelId}:${queueNumber.toString()}`);
          const doStub = this.env.LIVE_TRACKER_DO.get(doId);

          // Call resume endpoint
          const resumeResponse = await doStub.fetch("http://do/resume", {
            method: "POST",
          });

          if (!resumeResponse.ok) {
            throw new Error(`Failed to resume live tracker: ${resumeResponse.status.toString()}`);
          }

          const resumeResult = (await resumeResponse.json()) as {
            success: boolean;
            state: LiveTrackerState;
            embedData?: LiveTrackerEmbedData;
          };

          if (!resumeResult.success) {
            throw new Error("Durable Object failed to resume tracking");
          }

          let liveTrackerEmbed;
          if (resumeResult.embedData) {
            liveTrackerEmbed = new LiveTrackerEmbed(
              { discordService: this.services.discordService },
              resumeResult.embedData,
            );
          } else {
            const currentTime = new Date();
            const nextCheckTime = new Date(currentTime.getTime() + 3 * 60 * 1000); // 3 minutes
            liveTrackerEmbed = new LiveTrackerEmbed(
              { discordService: this.services.discordService },
              {
                userId,
                guildId,
                channelId,
                queueNumber,
                status: "active",
                isPaused: false,
                lastUpdated: currentTime,
                nextCheck: nextCheckTime,
                enrichedMatches: undefined,
                seriesScore: undefined,
                errorState: undefined,
              },
            );
          }

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );

          this.services.logService.info(
            "Live tracker resumed via button",
            new Map([
              ["guildId", guildId],
              ["channelId", channelId],
              ["queueNumber", queueNumber.toString()],
              ["userId", userId],
            ]),
          );
        } catch (error) {
          this.services.logService.error("Failed to resume live tracker", new Map([["error", String(error)]]));

          // Still update the embed to show some response, even if DO call failed
          const liveTrackerEmbed = new LiveTrackerEmbed(
            { discordService: this.services.discordService },
            {
              userId,
              guildId,
              channelId,
              queueNumber,
              status: "stopped", // Show as stopped if we can't resume
              isPaused: false,
              lastUpdated: undefined,
              nextCheck: undefined,
              enrichedMatches: undefined,
              seriesScore: undefined,
              errorState: undefined,
            },
          );

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );
        }
      },
    };
  }

  private refreshResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        const userId = Preconditions.checkExists(
          interaction.member?.user.id ?? interaction.user?.id,
          "expected user id",
        );

        const guildId = interaction.guild_id ?? "";
        const channelId = interaction.channel.id;

        // Get current state to extract queue number
        let queueNumber = 0; // Default fallback

        try {
          const statusResponse = await this.getTrackerStatus(guildId, channelId);
          if (!statusResponse?.state) {
            throw new Error("No active live tracker found");
          }

          ({ queueNumber } = statusResponse.state);
          // Get the Durable Object instance
          const doId = this.env.LIVE_TRACKER_DO.idFromName(`${guildId}:${channelId}:${queueNumber.toString()}`);
          const doStub = this.env.LIVE_TRACKER_DO.get(doId);

          // Call refresh endpoint to manually trigger an update
          const refreshResponse = await doStub.fetch("http://do/refresh", {
            method: "POST",
          });

          if (!refreshResponse.ok) {
            throw new Error(`Failed to refresh live tracker: ${refreshResponse.status.toString()}`);
          }

          this.services.logService.info(
            "Live tracker manually refreshed via button",
            new Map([
              ["guildId", guildId],
              ["channelId", channelId],
              ["queueNumber", queueNumber.toString()],
              ["userId", userId],
            ]),
          );
        } catch (error) {
          this.services.logService.error("Failed to refresh live tracker", new Map([["error", String(error)]]));

          // On error, still try to update the message with current state
          const currentTime = new Date();
          const nextCheckTime = new Date(currentTime.getTime() + 3 * 60 * 1000); // 3 minutes

          const liveTrackerEmbed = new LiveTrackerEmbed(
            { discordService: this.services.discordService },
            {
              userId,
              guildId,
              channelId,
              queueNumber,
              status: "active", // Assume active since refresh was clicked
              isPaused: false,
              lastUpdated: currentTime,
              nextCheck: nextCheckTime,
              enrichedMatches: undefined,
              seriesScore: undefined,
              errorState: undefined,
            },
          );

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );
        }
      },
    };
  }

  private async getTrackerStatus(guildId: string, channelId: string): Promise<{ state: LiveTrackerState } | null> {
    try {
      // We need to try different queue numbers to find the active one
      // In production, we'd store this mapping or iterate through possible values
      // For now, check against the Durable Object storage directly

      // First try to get active queue data to determine the queue number
      const activeQueueData = await this.services.discordService.getTeamsFromQueueChannel(guildId, channelId);
      if (!activeQueueData) {
        return null;
      }

      const queueNumber = activeQueueData.queue;
      const doId = this.env.LIVE_TRACKER_DO.idFromName(`${guildId}:${channelId}:${queueNumber.toString()}`);
      const doStub = this.env.LIVE_TRACKER_DO.get(doId);

      const statusResponse = await doStub.fetch("http://do/status", {
        method: "GET",
      });

      if (!statusResponse.ok) {
        return null;
      }

      return (await statusResponse.json()) as { state: LiveTrackerState };
    } catch (error) {
      this.services.logService.error("Failed to get tracker status", new Map([["error", String(error)]]));
      return null;
    }
  }

  private repostResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        const newMessage = await this.services.discordService.createMessage(interaction.channel.id, {
          embeds: interaction.message.embeds,
          components: interaction.message.components,
          content: interaction.message.content,
        });

        const guildId = interaction.guild_id;
        const channelId = interaction.channel.id;
        const title = interaction.message.embeds[0]?.title;
        let queueNumber: number | undefined;
        if (title) {
          const queueRegex = /Live Tracker - Queue #(\d+)/;
          const queueMatch = queueRegex.exec(title);
          if (queueMatch?.[1]) {
            queueNumber = Number.parseInt(queueMatch[1], 10);
          }
        }

        if (queueNumber != null && guildId != null) {
          try {
            const doId = this.env.LIVE_TRACKER_DO.idFromName(`${guildId}:${channelId}:${queueNumber.toString()}`);
            const doStub = this.env.LIVE_TRACKER_DO.get(doId);

            const repostResponse = await doStub.fetch("http://do/repost", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ newMessageId: newMessage.id }),
            });

            if (!repostResponse.ok) {
              this.services.logService.warn(
                "Failed to update live tracker message ID after repost",
                new Map([
                  ["status", repostResponse.status.toString()],
                  ["queueNumber", queueNumber.toString()],
                  ["newMessageId", newMessage.id],
                ]),
              );
            }
          } catch (error) {
            this.services.logService.error(
              "Error updating live tracker message ID after repost",
              new Map([
                ["error", String(error)],
                ["queueNumber", queueNumber.toString()],
                ["newMessageId", newMessage.id],
              ]),
            );
          }
        }

        await this.services.discordService.deleteMessage(
          interaction.channel.id,
          interaction.message.id,
          "Reposting maps",
        );
      },
    };
  }
}
