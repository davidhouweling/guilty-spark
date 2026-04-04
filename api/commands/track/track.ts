import type {
  APIApplicationCommandInteraction,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
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
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type {
  BaseInteraction,
  ExecuteResponse,
  ApplicationCommandData,
  ComponentHandlerMap,
} from "../base/base-command";
import { BaseCommand } from "../base/base-command";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import { InteractionComponent } from "../../embeds/live-tracker-embed";
import type { LiveTrackerState } from "../../durable-objects/types";
import { isCooldownError } from "../../durable-objects/types";
import type { LiveTrackerIndividualStartRequest, UpdateTarget } from "../../durable-objects/individual/types";
import { LiveTrackerIndividualMatchSelectEmbed } from "../../embeds/live-tracker-individual-match-select-embed";
import { LiveTrackerLoadingEmbed } from "../../embeds/live-tracker-loading-embed";

interface UserContext {
  userId: string;
  guildId: string;
  channelId: string;
}

interface TrackerContext extends UserContext {
  queueNumber: number;
}

interface SubcommandOption {
  type: ApplicationCommandOptionType.Subcommand;
  name: string;
  options?: APIApplicationCommandInteractionDataBasicOption[];
}

function isSubcommandOption(opt: unknown): opt is SubcommandOption {
  return (
    typeof opt === "object" &&
    opt !== null &&
    "type" in opt &&
    opt.type === ApplicationCommandOptionType.Subcommand &&
    "name" in opt &&
    typeof opt.name === "string"
  );
}

export class TrackCommand extends BaseCommand {
  readonly commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "track",
      description: "Live tracking for matches",
      contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
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
        {
          type: ApplicationCommandOptionType.SubcommandGroup,
          name: "individual",
          description: "Start live tracking for an individual player",
          options: [
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: "xbox",
              description: "Track an Xbox gamertag",
              options: [
                {
                  name: "gamertag",
                  description: "The Xbox gamertag to track",
                  type: ApplicationCommandOptionType.String,
                  required: true,
                },
              ],
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: "discord",
              description: "Track a Discord user",
              options: [
                {
                  name: "user",
                  description: "The Discord user to track",
                  type: ApplicationCommandOptionType.User,
                  required: true,
                },
              ],
            },
            {
              type: ApplicationCommandOptionType.Subcommand,
              name: "me",
              description: "Track yourself (using your linked gamertag)",
              options: [],
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

    [InteractionComponent.IndividualMatchSelect]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleIndividualMatchSelect(interaction)),
    ),
    [InteractionComponent.IndividualStartWithoutGames]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleIndividualStartWithoutGames(interaction)),
    ),
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
    const firstOption = options?.[0];

    if (!firstOption) {
      throw new Error("No subcommand provided.");
    }

    // Handle regular subcommand (neatqueue)
    if (firstOption.type === ApplicationCommandOptionType.Subcommand) {
      switch (firstOption.name) {
        case "neatqueue": {
          return this.neatqueueSubcommand(interaction, firstOption.options ?? []);
        }
        default: {
          throw new Error(`Unknown subcommand: ${firstOption.name}`);
        }
      }
    }

    // Handle subcommand group (individual)
    if (firstOption.type === ApplicationCommandOptionType.SubcommandGroup) {
      switch (firstOption.name) {
        case "individual": {
          const [subcommand] = firstOption.options;
          if (!subcommand) {
            throw new Error("No subcommand within individual group.");
          }
          if (!isSubcommandOption(subcommand)) {
            throw new Error("Invalid subcommand within individual group.");
          }
          return this.individualSubcommand(interaction, subcommand);
        }
        default: {
          throw new Error(`Unknown subcommand group: ${firstOption.name}`);
        }
      }
    }

    throw new Error("Invalid command structure.");
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
            playersAssociationData: {},
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

  private individualSubcommand(
    interaction: APIApplicationCommandInteraction,
    subcommand: SubcommandOption,
  ): ExecuteResponse {
    const groupName = subcommand.name;

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      },
      jobToComplete: async (): Promise<void> => {
        const userId = Preconditions.checkExists(
          interaction.member?.user.id ?? interaction.user?.id,
          "expected user id",
        );

        const guildId = interaction.guild_id ?? ""; // Can be empty for DM
        const channelId = interaction.channel.id;
        const locale = interaction.guild_locale ?? interaction.locale;

        try {
          // Resolve player based on subcommand
          let gamertag: string;

          switch (groupName) {
            case "xbox": {
              const gamertagOption = subcommand.options?.find((opt) => opt.name === "gamertag");
              gamertag = gamertagOption?.type === ApplicationCommandOptionType.String ? gamertagOption.value : "";

              if (!gamertag) {
                throw new EndUserError("Gamertag is required", {
                  errorType: EndUserErrorType.WARNING,
                  handled: true,
                });
              }
              const { gamertag: resolvedGamertag } = await this.services.haloService.getUserByGamertag(gamertag);
              gamertag = resolvedGamertag;
              break;
            }
            case "discord": {
              const userOption = subcommand.options?.find((opt) => opt.name === "user");
              const discordUserId = userOption?.type === ApplicationCommandOptionType.User ? userOption.value : "";

              if (!discordUserId) {
                throw new EndUserError("Discord user is required", {
                  errorType: EndUserErrorType.WARNING,
                  handled: true,
                });
              }

              // Lookup XUID from Discord user via database
              const associations = await this.services.databaseService.getDiscordAssociations([discordUserId]);
              const [association] = associations;

              if (!association) {
                throw new EndUserError(
                  `Discord user <@${discordUserId}> is not associated with an Xbox account. They need to use \`/connect\` first.`,
                  {
                    errorType: EndUserErrorType.WARNING,
                    handled: true,
                  },
                );
              }

              const xuid = association.XboxId;

              // Fetch user info to get gamertag
              const userInfoData = await this.services.haloService.getUsersByXuids([xuid]);
              if (userInfoData.length === 0) {
                throw new EndUserError(`Could not find gamertag for Xbox ID ${xuid}.`, {
                  errorType: EndUserErrorType.WARNING,
                  handled: true,
                });
              }
              const [firstUser] = userInfoData;
              if (!firstUser) {
                throw new EndUserError(`Could not find gamertag for Xbox ID ${xuid}.`, {
                  errorType: EndUserErrorType.WARNING,
                  handled: true,
                });
              }
              ({ gamertag } = firstUser);
              break;
            }
            case "me": {
              // Lookup current user's XUID from database
              const associations = await this.services.databaseService.getDiscordAssociations([userId]);
              const [association] = associations;

              if (!association) {
                throw new EndUserError(
                  "You are not associated with an Xbox account. Use `/connect` to link your account.",
                  {
                    errorType: EndUserErrorType.WARNING,
                    handled: true,
                  },
                );
              }

              const xuid = association.XboxId;

              // Fetch user info to get gamertag
              const userInfoData = await this.services.haloService.getUsersByXuids([xuid]);
              if (userInfoData.length === 0) {
                throw new EndUserError(`Could not find gamertag for Xbox ID ${xuid}.`, {
                  errorType: EndUserErrorType.WARNING,
                  handled: true,
                });
              }
              const [firstUser] = userInfoData;
              if (!firstUser) {
                throw new EndUserError(`Could not find gamertag for Xbox ID ${xuid}.`, {
                  errorType: EndUserErrorType.WARNING,
                  handled: true,
                });
              }
              ({ gamertag } = firstUser);
              break;
            }
            default: {
              throw new Error(`Unknown subcommand: ${groupName}`);
            }
          }

          // Fetch recent enriched matches for the player
          const matchHistory = await this.services.haloService.getEnrichedMatchHistory(gamertag, locale);

          if (matchHistory.matches.length === 0) {
            throw new EndUserError(`No recent matches found for ${gamertag}.`, {
              errorType: EndUserErrorType.WARNING,
              handled: true,
            });
          }

          const matchSelectEmbed = new LiveTrackerIndividualMatchSelectEmbed({
            gamertag,
            locale,
            matches: matchHistory.matches,
          });

          await this.services.discordService.updateDeferredReply(interaction.token, matchSelectEmbed.toMessageData());
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
          this.services.logService.error("Failed to start individual tracker", new Map([["error", String(error)]]));

          const errorEmbed = this.services.liveTrackerService.createErrorFallbackEmbed(
            {
              userId,
              guildId,
              channelId,
              queueNumber: 0,
            },
            "stopped",
          );

          await this.services.discordService.updateDeferredReply(interaction.token, errorEmbed.toMessageData());
        }
      },
    };
  }

  private extractUserContext(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): UserContext {
    const userId = Preconditions.checkExists(interaction.member?.user.id ?? interaction.user?.id, "expected user id");
    const guildId = interaction.guild_id ?? "";
    const channelId = interaction.channel.id;

    return { userId, guildId, channelId };
  }

  private getGamertagFromMatchSelectEmbed(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): string {
    const [embed] = interaction.message.embeds;
    const title = Preconditions.checkExists(embed?.title, "Match selection embed missing title");
    const prefix = LiveTrackerIndividualMatchSelectEmbed.getTitlePrefix();

    if (!title.startsWith(prefix)) {
      throw new Error("Match selection embed title is invalid");
    }

    const gamertag = title.slice(prefix.length).trim();
    if (gamertag === "") {
      throw new Error("Match selection embed gamertag is missing");
    }

    return gamertag;
  }

  private async handleIndividualMatchSelect(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    await this.startIndividualTrackerFromInteraction(interaction, interaction.data.values);
  }

  private async handleIndividualStartWithoutGames(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    await this.startIndividualTrackerFromInteraction(interaction, []);
  }

  private async startIndividualTrackerFromInteraction(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    selectedGameIds: string[],
  ): Promise<void> {
    const { userId, guildId, channelId } = this.extractUserContext(interaction);

    try {
      const gamertag = this.getGamertagFromMatchSelectEmbed(interaction);
      const userInfo = await this.services.haloService.getUserByGamertag(gamertag);

      // Create initial loading message
      const loadingEmbed = new LiveTrackerLoadingEmbed();
      const loadingEmbedData = { embeds: [loadingEmbed.embed] };
      const loadingMessage = await this.services.discordService.updateDeferredReply(
        interaction.token,
        loadingEmbedData,
      );

      // Create Discord target with loading message
      const discordTargetId = `discord-${userId}-${channelId}-${Date.now().toString()}`;
      const discordTarget: UpdateTarget = {
        id: discordTargetId,
        type: "discord",
        createdAt: new Date().toISOString(),
        discord: {
          userId,
          guildId,
          channelId,
          messageId: loadingMessage.id,
          lastMatchCount: 0,
        },
      };

      const startRequest: LiveTrackerIndividualStartRequest = {
        xuid: userInfo.xuid,
        gamertag,
        searchStartTime: new Date().toISOString(),
        selectedGameIds,
        playersAssociationData: {},
        initialTarget: discordTarget,
      };

      await this.services.liveTrackerService.startTrackerIndividual(startRequest);

      this.services.logService.info(
        `Started individual tracker for ${gamertag}`,
        new Map([
          ["xuid", userInfo.xuid],
          ["gamertag", gamertag],
          ["userId", userId],
          ["matchCount", selectedGameIds.length.toString()],
        ]),
      );
    } catch (error) {
      this.services.logService.error("Failed to start individual tracker", new Map([["error", String(error)]]));

      const errorEmbed = this.services.liveTrackerService.createErrorFallbackEmbed(
        {
          userId,
          guildId,
          channelId,
          queueNumber: 0,
        },
        "stopped",
      );

      await this.services.discordService.updateDeferredReply(interaction.token, errorEmbed.toMessageData());
    }
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

          this.services.logService.debug("Live tracker paused via button", this.createLogParams(context));
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

          this.services.logService.debug("Live tracker resumed via button", this.createLogParams(context));
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

          this.services.logService.debug("Live tracker manually refreshed via button", this.createLogParams(context));
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
