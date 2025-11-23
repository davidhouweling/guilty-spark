import type {
  APIApplicationCommandInteraction,
  APIMessageComponentButtonInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIGuildMember,
} from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChannelType,
  InteractionResponseType,
  InteractionType,
  InteractionContextType,
} from "discord-api-types/v10";
import { addMinutes } from "date-fns";
import type {
  BaseInteraction,
  ExecuteResponse,
  ApplicationCommandData,
  ComponentHandlerMap,
} from "../base/base-command.mjs";
import { BaseCommand } from "../base/base-command.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { InteractionComponent } from "../../embeds/live-tracker-embed.mjs";
import type { LiveTrackerState } from "../../durable-objects/types.mjs";
import { isCooldownError } from "../../durable-objects/types.mjs";

interface UserContext {
  userId: string;
  guildId: string;
  channelId: string;
}

interface TrackerContext extends UserContext {
  queueNumber: number;
}

export class TrackCommand extends BaseCommand {
  readonly commands: ApplicationCommandData[] = [
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
  ];

  protected override readonly components: ComponentHandlerMap = this.createHandlerMap(InteractionComponent, {
    [InteractionComponent.Pause]: this.buttonHandler((interaction) => this.handlePause(interaction)),

    [InteractionComponent.Resume]: this.buttonHandler((interaction) => this.handleResume(interaction)),

    [InteractionComponent.Refresh]: this.buttonHandler((interaction) => this.handleRefresh(interaction)),

    [InteractionComponent.Repost]: this.buttonHandler((interaction) => this.handleRepost(interaction)),
  });

  protected handleInteraction(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    switch (type) {
      case InteractionType.ApplicationCommand: {
        return this.applicationCommandJob(interaction);
      }
      case InteractionType.MessageComponent: {
        const customId = interaction.data.custom_id;
        const handler = this.components[customId];

        if (!handler) {
          throw new Error(`No handler found for component: ${customId}`);
        }

        return this.executeComponentHandler(handler, interaction);
      }
      case InteractionType.ModalSubmit: {
        throw new Error("This command cannot be used in this context.");
      }
      default:
        throw new UnreachableError(type);
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
          const players = activeQueueData.teams.flatMap(({ players: p }) => p);
          const teams = activeQueueData.teams.map((team) => ({
            name: team.name,
            playerIds: team.players.map((player) => player.user.id),
          }));

          // Start the live tracker with real queue data using the service
          await this.services.liveTrackerService.startTracker({
            userId,
            guildId,
            channelId: targetChannelId,
            queueNumber,
            interactionToken: interaction.token,
            players: players.reduce<Record<string, APIGuildMember>>((acc, player) => {
              acc[player.user.id] = player;
              return acc;
            }, {}),
            teams,
            queueStartTime: activeQueueData.timestamp.toISOString(),
          });
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

          const errorEmbed = this.services.liveTrackerService.createErrorFallbackEmbed(
            {
              userId,
              guildId,
              channelId: targetChannelId,
              queueNumber: 0,
            },
            "stopped",
          );

          await this.services.discordService.updateDeferredReply(interaction.token, errorEmbed.toMessageData());
        }
      },
    };
  }

  private extractUserContext(interaction: APIMessageComponentButtonInteraction): UserContext {
    const userId = Preconditions.checkExists(interaction.member?.user.id ?? interaction.user?.id, "expected user id");
    const guildId = interaction.guild_id ?? "";
    const channelId = interaction.channel.id;

    return { userId, guildId, channelId };
  }

  private async getTrackerContextFromInteraction(
    interaction: APIMessageComponentButtonInteraction,
  ): Promise<TrackerContext | null> {
    const userContext = this.extractUserContext(interaction);

    try {
      const state = await this.getTrackerStatus(userContext.guildId, userContext.channelId);
      if (!state) {
        return null;
      }

      return {
        ...userContext,
        queueNumber: state.queueNumber,
      };
    } catch (error) {
      this.services.logService.error("Failed to get tracker context", new Map([["error", String(error)]]));
      return null;
    }
  }

  private createLogParams(context: TrackerContext, additionalParams = new Map<string, string>()): Map<string, string> {
    const params = new Map([
      ["guildId", context.guildId],
      ["channelId", context.channelId],
      ["queueNumber", context.queueNumber.toString()],
      ["userId", context.userId],
    ]);

    for (const [key, value] of additionalParams) {
      params.set(key, value);
    }

    return params;
  }

  private async updateMessageWithFallback(
    interaction: APIMessageComponentButtonInteraction,
    status: "active" | "paused" | "stopped",
  ): Promise<void> {
    const userContext = this.extractUserContext(interaction);
    const fallbackEmbed = this.services.liveTrackerService.createErrorFallbackEmbed(
      {
        ...userContext,
        queueNumber: 0,
      },
      status,
    );

    await this.services.discordService.editMessage(
      interaction.channel.id,
      interaction.message.id,
      fallbackEmbed.toMessageData(),
    );
  }

  private async handleButtonError(
    interaction: APIMessageComponentButtonInteraction,
    context: TrackerContext,
    error: unknown,
  ): Promise<void> {
    this.services.logService.error(
      "Button action failed",
      this.createLogParams(context, new Map([["error", String(error)]])),
    );

    const fallbackEmbed = this.services.liveTrackerService.createErrorFallbackEmbed(context, "stopped");
    await this.services.discordService.editMessage(
      interaction.channel.id,
      interaction.message.id,
      fallbackEmbed.toMessageData(),
    );
  }

  private handlePause(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        const context = await this.getTrackerContextFromInteraction(interaction);
        if (!context) {
          const userContext = this.extractUserContext(interaction);
          const fallbackEmbed = this.services.liveTrackerService.createErrorFallbackEmbed(
            {
              ...userContext,
              queueNumber: 0,
            },
            "stopped",
          );

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            fallbackEmbed.toMessageData(),
          );
          return;
        }

        try {
          const pauseResult = await this.services.liveTrackerService.pauseTracker(context);

          const liveTrackerEmbed = this.services.liveTrackerService.createLiveTrackerEmbedFromResult({
            context,
            embedData: pauseResult.embedData,
            defaultStatus: "paused",
          });

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );

          this.services.logService.info("Live tracker paused via button", this.createLogParams(context));
        } catch (error) {
          this.services.logService.error("Failed to pause live tracker", new Map([["error", String(error)]]));

          const fallbackEmbed = this.services.liveTrackerService.createErrorFallbackEmbed(context, "stopped");
          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            fallbackEmbed.toMessageData(),
          );
        }
      },
    };
  }

  private handleResume(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        const context = await this.getTrackerContextFromInteraction(interaction);
        if (!context) {
          await this.updateMessageWithFallback(interaction, "stopped");
          return;
        }

        try {
          const resumeResult = await this.services.liveTrackerService.resumeTracker(context);

          const currentTime = new Date();
          const nextCheckTime = addMinutes(currentTime, 3);
          const liveTrackerEmbed = this.services.liveTrackerService.createLiveTrackerEmbedFromResult({
            context,
            embedData: resumeResult.embedData,
            defaultStatus: "active",
            additionalTime: nextCheckTime,
          });

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );

          this.services.logService.info("Live tracker resumed via button", this.createLogParams(context));
        } catch (error) {
          this.services.logService.error("Failed to resume live tracker", new Map([["error", String(error)]]));

          const fallbackEmbed = this.services.liveTrackerService.createErrorFallbackEmbed(context, "stopped");
          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            fallbackEmbed.toMessageData(),
          );
        }
      },
    };
  }

  private handleRefresh(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        const context = await this.getTrackerContextFromInteraction(interaction);
        if (!context) {
          await this.updateMessageWithFallback(interaction, "stopped");
          return;
        }

        try {
          const refreshResult = await this.services.liveTrackerService.refreshTracker(context);

          if (!refreshResult.success) {
            if (isCooldownError(refreshResult)) {
              await this.services.liveTrackerService.handleRefreshCooldown({ interaction, response: refreshResult });
              return;
            }
            throw new Error("Failed to refresh live tracker");
          }

          this.services.logService.info("Live tracker manually refreshed via button", this.createLogParams(context));
        } catch (error) {
          await this.handleButtonError(interaction, context, error);
        }
      },
    };
  }

  private async getTrackerStatus(guildId: string, channelId: string): Promise<LiveTrackerState | null> {
    try {
      // First try to get active queue data to determine the queue number
      const activeQueueData = await this.services.discordService.getTeamsFromQueueChannel(guildId, channelId);
      if (!activeQueueData) {
        return null;
      }

      const queueNumber = activeQueueData.queue;
      const statusResponse = await this.services.liveTrackerService.getTrackerStatus({
        userId: "", // Not needed for status check
        guildId,
        channelId,
        queueNumber,
      });

      return statusResponse?.state ?? null;
    } catch (error) {
      this.services.logService.error("Failed to get tracker status", new Map([["error", String(error)]]));
      return null;
    }
  }

  private handleRepost(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
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
        if (title != null && title.length > 0) {
          const queueRegex = /Live Tracker - Queue #(\d+)/;
          const queueMatch = queueRegex.exec(title);
          if (queueMatch?.[1] != null && queueMatch[1].length > 0) {
            queueNumber = Number.parseInt(queueMatch[1], 10);
          }
        }

        if (queueNumber != null && guildId != null) {
          try {
            await this.services.liveTrackerService.repostTracker({
              context: {
                userId: "", // Not needed for repost
                guildId,
                channelId,
                queueNumber,
              },
              newMessageId: newMessage.id,
            });
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
