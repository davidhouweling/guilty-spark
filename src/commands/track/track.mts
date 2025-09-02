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
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { LiveTrackerEmbed, InteractionComponent } from "../../embeds/live-tracker-embed.mjs";

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
        custom_id: InteractionComponent.Stop,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.Refresh,
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
          const startResponse = await doStub.fetch("http://do/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              guildId,
              channelId: targetChannelId,
              queueNumber,
              interactionToken: interaction.token,
              teams: activeQueueData.teams,
              queueStartTime: activeQueueData.timestamp.toISOString(),
            }),
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
      case InteractionComponent.Stop: {
        return this.stopResponse(interaction);
      }
      case InteractionComponent.Refresh: {
        return this.refreshResponse(interaction);
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
        const queueNumber = 42; // Mock queue number for POC

        try {
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

          // Update embed to show paused state
          const currentTime = new Date();
          const liveTrackerEmbed = new LiveTrackerEmbed(
            { discordService: this.services.discordService },
            {
              userId,
              guildId,
              channelId,
              queueNumber,
              status: "paused",
              isPaused: true,
              lastUpdated: currentTime,
              // No nextCheck when paused
            },
          );

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
        const queueNumber = 42; // Mock queue number for POC

        try {
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

          // Update embed to show active state
          const currentTime = new Date();
          const nextCheckTime = new Date(currentTime.getTime() + 10 * 1000); // 10 seconds for POC

          const liveTrackerEmbed = new LiveTrackerEmbed(
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
            },
          );

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

  private stopResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
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
        const queueNumber = 42; // Mock queue number for POC

        try {
          // Get the Durable Object instance
          const doId = this.env.LIVE_TRACKER_DO.idFromName(`${guildId}:${channelId}:${queueNumber.toString()}`);
          const doStub = this.env.LIVE_TRACKER_DO.get(doId);

          // Call stop endpoint
          const stopResponse = await doStub.fetch("http://do/stop", {
            method: "POST",
          });

          if (!stopResponse.ok) {
            throw new Error(`Failed to stop live tracker: ${stopResponse.status.toString()}`);
          }

          // Update embed to show stopped state
          const currentTime = new Date();
          const liveTrackerEmbed = new LiveTrackerEmbed(
            { discordService: this.services.discordService },
            {
              userId,
              guildId,
              channelId,
              queueNumber,
              status: "stopped",
              isPaused: false,
              lastUpdated: currentTime,
              // nextCheck omitted when stopped
            },
          );

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );

          this.services.logService.info(
            "Live tracker stopped via button",
            new Map([
              ["guildId", guildId],
              ["channelId", channelId],
              ["queueNumber", queueNumber.toString()],
              ["userId", userId],
            ]),
          );
        } catch (error) {
          this.services.logService.error("Failed to stop live tracker", new Map([["error", String(error)]]));

          // Still update the embed to show stopped state, even if DO call failed
          const currentTime = new Date();
          const liveTrackerEmbed = new LiveTrackerEmbed(
            { discordService: this.services.discordService },
            {
              userId,
              guildId,
              channelId,
              queueNumber,
              status: "stopped",
              isPaused: false,
              lastUpdated: currentTime,
              // nextCheck omitted when stopped
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
        const queueNumber = 42; // Mock queue number for POC

        try {
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
          const nextCheckTime = new Date(currentTime.getTime() + 10 * 1000); // 10 seconds for POC

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
}
