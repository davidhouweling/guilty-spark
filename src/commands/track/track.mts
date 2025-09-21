import type {
  APIApplicationCommandInteraction,
  APIMessageComponentButtonInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIEmbed,
  APIGuildMember,
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
import { addMinutes } from "date-fns";
import type { BaseInteraction, CommandData, ExecuteResponse } from "../base/base.mjs";
import type { LiveTrackerDO } from "../../durable-objects/live-tracker-do.mjs";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { LiveTrackerEmbed, InteractionComponent } from "../../embeds/live-tracker-embed.mjs";
import type { LiveTrackerEmbedData } from "../../embeds/live-tracker-embed.mjs";
import type {
  LiveTrackerPauseResponse,
  LiveTrackerRefreshCooldownErrorResponse,
  LiveTrackerResumeResponse,
  LiveTrackerStartRequest,
  LiveTrackerState,
  LiveTrackerStatusResponse,
} from "../../durable-objects/types.mjs";

interface UserContext {
  userId: string;
  guildId: string;
  channelId: string;
}

interface TrackerContext extends UserContext {
  queueNumber: number;
}

export class TrackCommand extends BaseCommand {
  private static readonly DO_ENDPOINTS = {
    START: "http://do/start",
    PAUSE: "http://do/pause",
    RESUME: "http://do/resume",
    REFRESH: "http://do/refresh",
    STATUS: "http://do/status",
    REPOST: "http://do/repost",
  } as const;

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
          const players = activeQueueData.teams.flatMap(({ players: p }) => p);
          const teams = activeQueueData.teams.map((team) => ({
            name: team.name,
            playerIds: team.players.map((player) => player.user.id),
          }));

          // Create Durable Object instance
          const doStub = this.getDurableObjectStub({
            userId,
            guildId,
            channelId: targetChannelId,
            queueNumber,
          });

          // Start the live tracker with real queue data
          const startData: LiveTrackerStartRequest = {
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
          };

          const startResponse = await doStub.fetch(TrackCommand.DO_ENDPOINTS.START, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(startData),
          });

          if (!startResponse.ok) {
            throw new Error(`Failed to start live tracker: ${String(startResponse.status)}`);
          }

          await startResponse.json<LiveTrackerPauseResponse>();
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

  private getDurableObjectStub(context: TrackerContext): DurableObjectStub<LiveTrackerDO> {
    const doId = this.env.LIVE_TRACKER_DO.idFromName(
      `${context.guildId}:${context.channelId}:${context.queueNumber.toString()}`,
    );

    return this.env.LIVE_TRACKER_DO.get(doId);
  }

  private createErrorFallbackEmbed(context: TrackerContext, status: "active" | "paused" | "stopped"): LiveTrackerEmbed {
    return new LiveTrackerEmbed(
      { discordService: this.services.discordService },
      {
        userId: context.userId,
        guildId: context.guildId,
        channelId: context.channelId,
        queueNumber: context.queueNumber,
        status,
        isPaused: false,
        lastUpdated: undefined,
        nextCheck: undefined,
        enrichedMatches: undefined,
        seriesScore: undefined,
        errorState: undefined,
      },
    );
  }

  private async createButtonResponse(
    interaction: APIMessageComponentButtonInteraction,
    action: (context: TrackerContext, doStub: DurableObjectStub) => Promise<void>,
  ): Promise<void> {
    const context = await this.getTrackerContextFromInteraction(interaction);
    if (!context) {
      await this.updateMessageWithFallback(interaction, "stopped");
      return;
    }

    try {
      const doStub = this.getDurableObjectStub(context);
      await action(context, doStub);
    } catch (error) {
      await this.handleButtonError(interaction, context, error);
    }
  }

  private async updateMessageWithFallback(
    interaction: APIMessageComponentButtonInteraction,
    status: "active" | "paused" | "stopped",
  ): Promise<void> {
    const userContext = this.extractUserContext(interaction);
    const fallbackEmbed = this.createErrorFallbackEmbed(
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

    const fallbackEmbed = this.createErrorFallbackEmbed(context, "stopped");
    await this.services.discordService.editMessage(
      interaction.channel.id,
      interaction.message.id,
      fallbackEmbed.toMessageData(),
    );
  }

  private createLiveTrackerEmbedFromResult(
    context: TrackerContext,
    embedData: LiveTrackerEmbedData | undefined,
    defaultStatus: "active" | "paused",
    additionalTime?: Date,
  ): LiveTrackerEmbed {
    if (embedData) {
      return new LiveTrackerEmbed({ discordService: this.services.discordService }, embedData);
    }

    const currentTime = new Date();
    return new LiveTrackerEmbed(
      { discordService: this.services.discordService },
      {
        userId: context.userId,
        guildId: context.guildId,
        channelId: context.channelId,
        queueNumber: context.queueNumber,
        status: defaultStatus,
        isPaused: defaultStatus === "paused",
        lastUpdated: currentTime,
        nextCheck: additionalTime,
        enrichedMatches: undefined,
        seriesScore: undefined,
        errorState: undefined,
      },
    );
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
        const context = await this.getTrackerContextFromInteraction(interaction);
        if (!context) {
          const userContext = this.extractUserContext(interaction);
          const fallbackEmbed = this.createErrorFallbackEmbed(
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
          const doStub = this.getDurableObjectStub(context);
          const pauseResponse = await doStub.fetch(TrackCommand.DO_ENDPOINTS.PAUSE, {
            method: "POST",
          });

          if (!pauseResponse.ok) {
            throw new Error(`Failed to pause live tracker: ${String(pauseResponse.status)}`);
          }

          const pauseResult = await pauseResponse.json<LiveTrackerPauseResponse>();

          const liveTrackerEmbed = this.createLiveTrackerEmbedFromResult(context, pauseResult.embedData, "paused");

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );

          this.services.logService.info("Live tracker paused via button", this.createLogParams(context));
        } catch (error) {
          this.services.logService.error("Failed to pause live tracker", new Map([["error", String(error)]]));

          const fallbackEmbed = this.createErrorFallbackEmbed(context, "stopped");
          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            fallbackEmbed.toMessageData(),
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
        const context = await this.getTrackerContextFromInteraction(interaction);
        if (!context) {
          const userContext = this.extractUserContext(interaction);
          const fallbackEmbed = this.createErrorFallbackEmbed(
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
          const doStub = this.getDurableObjectStub(context);
          const resumeResponse = await doStub.fetch(TrackCommand.DO_ENDPOINTS.RESUME, {
            method: "POST",
          });

          if (!resumeResponse.ok) {
            throw new Error(`Failed to resume live tracker: ${String(resumeResponse.status)}`);
          }

          const resumeResult = await resumeResponse.json<LiveTrackerResumeResponse>();

          const currentTime = new Date();
          const nextCheckTime = addMinutes(currentTime, 3);
          const liveTrackerEmbed = this.createLiveTrackerEmbedFromResult(
            context,
            resumeResult.embedData,
            "active",
            nextCheckTime,
          );

          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            liveTrackerEmbed.toMessageData(),
          );

          this.services.logService.info("Live tracker resumed via button", this.createLogParams(context));
        } catch (error) {
          this.services.logService.error("Failed to resume live tracker", new Map([["error", String(error)]]));

          const fallbackEmbed = this.createErrorFallbackEmbed(context, "stopped");
          await this.services.discordService.editMessage(
            interaction.channel.id,
            interaction.message.id,
            fallbackEmbed.toMessageData(),
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
        await this.createButtonResponse(interaction, async (context, doStub) => {
          const refreshResponse = await doStub.fetch(TrackCommand.DO_ENDPOINTS.REFRESH, {
            method: "POST",
          });

          if (refreshResponse.status === 429) {
            await this.handleRefreshCooldown(interaction, refreshResponse);
            return;
          }

          if (!refreshResponse.ok) {
            throw new Error(`Failed to refresh live tracker: ${String(refreshResponse.status)}`);
          }

          this.services.logService.info("Live tracker manually refreshed via button", this.createLogParams(context));
        });
      },
    };
  }

  private async handleRefreshCooldown(
    interaction: APIMessageComponentButtonInteraction,
    response: Response,
  ): Promise<void> {
    const cooldownData = await response.json<LiveTrackerRefreshCooldownErrorResponse>();

    const [currentEmbed] = interaction.message.embeds;
    if (currentEmbed) {
      const fields = currentEmbed.fields ?? [];
      const title = "⚠️ Refresh cooldown";
      const cooldownFieldExists = fields.some((field) => field.name === title);

      if (!cooldownFieldExists) {
        fields.push({
          name: title,
          value: cooldownData.message,
          inline: false,
        });
      }

      const updatedEmbed: APIEmbed = {
        ...currentEmbed,
        fields,
      };

      await this.services.discordService.editMessage(interaction.channel.id, interaction.message.id, {
        embeds: [updatedEmbed],
        components: interaction.message.components,
      });
    }
  }

  private async getTrackerStatus(guildId: string, channelId: string): Promise<LiveTrackerState | null> {
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
      const doStub = this.getDurableObjectStub({
        userId: "", // Not needed for status check
        guildId,
        channelId,
        queueNumber,
      });

      const statusResponse = await doStub.fetch(TrackCommand.DO_ENDPOINTS.STATUS, {
        method: "GET",
      });

      if (!statusResponse.ok) {
        return null;
      }

      const { state } = await statusResponse.json<LiveTrackerStatusResponse>();
      return state;
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
        if (title != null && title.length > 0) {
          const queueRegex = /Live Tracker - Queue #(\d+)/;
          const queueMatch = queueRegex.exec(title);
          if (queueMatch?.[1] != null && queueMatch[1].length > 0) {
            queueNumber = Number.parseInt(queueMatch[1], 10);
          }
        }

        if (queueNumber != null && guildId != null) {
          try {
            const doStub = this.getDurableObjectStub({
              userId: "", // Not needed for repost
              guildId,
              channelId,
              queueNumber,
            });

            const repostResponse = await doStub.fetch(TrackCommand.DO_ENDPOINTS.REPOST, {
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
