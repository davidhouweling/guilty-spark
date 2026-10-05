import type {
  APIApplicationCommandInteraction,
  APIModalSubmitInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIMessage,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIUserApplicationCommandGuildInteraction,
} from "discord-api-types/v10";
import {
  ChannelType,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  InteractionContextType,
  PermissionFlagsBits,
} from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { BaseInteraction, ExecuteResponse, ApplicationCommandData, CommandData } from "../base/base-command";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import type { ExistingSeriesStatsThreadLocation, QueueData } from "../../services/discord/discord";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import {
  extractDiscordSeriesMatchIdsFromEmbeds,
  extractQueueNumberFromSeriesOverviewEmbed,
} from "../../services/discord/discord-series-stats";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import { NeatQueuePostSeriesDisplayMode } from "../../services/database/types/neat_queue_config";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import {
  PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
  PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
} from "../../embeds/stats/player-stats-embed";
import {
  PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
  PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID,
  getPlayerCompareControlIdBase,
} from "../../embeds/stats/player-compare-embed";
import { StatsManualConfirmCommand } from "./stats-manual-confirm-command";
import { InteractionButton } from "./stats-interaction-button";
import type {
  FixFlowMetadata,
  FixSeriesOutcome,
  FixSeriesSource,
  FixSeriesSourceKind,
  ManualFlowMetadata,
} from "./stats-flow-types";
import { MANUAL_QUEUE_NUMBER_MIN } from "./manual-series";

function isManualSeriesOverview(message: APIMessage): boolean {
  return message.embeds.some((embed) => embed.fields?.some((field) => field.name === "Created manually by") === true);
}

function isPlayerStatsUserCommand(
  interaction: BaseInteraction,
): interaction is APIUserApplicationCommandGuildInteraction {
  return (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.data.type === ApplicationCommandType.User &&
    interaction.data.name === "Player stats" &&
    "guild_id" in interaction &&
    "member" in interaction
  );
}

function isCompareStatsUserCommand(
  interaction: BaseInteraction,
): interaction is APIUserApplicationCommandGuildInteraction {
  return (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.data.type === ApplicationCommandType.User &&
    interaction.data.name === "Compare stats" &&
    "guild_id" in interaction &&
    "member" in interaction
  );
}

export class StatsCommand extends StatsManualConfirmCommand {
  readonly commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.User,
      name: "Player stats",
      description: "",
      contexts: [InteractionContextType.Guild],
      default_member_permissions: null,
    },
    {
      type: ApplicationCommandType.User,
      name: "Compare stats",
      description: "",
      contexts: [InteractionContextType.Guild],
      default_member_permissions: null,
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: "stats",
      description: "Pulls stats from Halo waypoint",
      contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
      default_member_permissions: null,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "neatqueue",
          description: "Pulls stats for a NeatQueue series result",
          options: [
            {
              name: "channel",
              description: "The channel the NeatQueue result message is in (if not this channel)",
              type: ApplicationCommandOptionType.Channel,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "queue",
              description: "The Queue number for the series (defaults to last queue result)",
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "match",
          description: "Pulls stats for a specific match",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "id",
              description: "The match ID (example: d9d77058-f140-4838-8f41-1a3406b28566)",
              required: true,
              max_length: 36,
              min_length: 36,
            },
            {
              name: "private",
              description: "Only provide the response to you instead of the channel",
              required: false,
              type: ApplicationCommandOptionType.Boolean,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "fix",
          description: "Manually correct a series by selecting custom games",
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: "queue_number",
              description: "The queue number to fix (optional if running from queue thread)",
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "manual",
          description: "Manually create series stats when NeatQueue did not post a result",
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: "queue_number",
              description: "The queue number, if the series came from a queue",
              required: false,
              min_value: 1,
              max_value: MANUAL_QUEUE_NUMBER_MIN - 1,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "player",
          description: "Pulls accumulated leaderboard stats for a player",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "The player to show (defaults to you)",
              required: false,
            },
            {
              type: ApplicationCommandOptionType.Channel,
              name: "queue",
              description: "Configured NeatQueue channel (defaults to all configured queues)",
              channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
              required: false,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "window",
              description: "Leaderboard window (defaults to 3 months)",
              choices: [
                { name: "1 week", value: LeaderboardWindow.OneWeek },
                { name: "1 month", value: LeaderboardWindow.OneMonth },
                { name: "3 months", value: LeaderboardWindow.ThreeMonths },
                { name: "6 months", value: LeaderboardWindow.SixMonths },
                { name: "12 months", value: LeaderboardWindow.TwelveMonths },
              ],
              required: false,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "visible",
              description: "Who can see the response (defaults to private)",
              choices: [
                { name: "Public", value: "public" },
                { name: "Private", value: "private" },
              ],
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "compare",
          description: "Compares accumulated leaderboard stats between two players",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "player1",
              description: "The first player to compare",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.User,
              name: "player2",
              description: "The second player to compare",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "visible",
              description: "Who can see the response (defaults to private)",
              choices: [
                { name: "Public", value: "public" },
                { name: "Private", value: "private" },
              ],
              required: false,
            },
          ],
        },
      ],
    },
  ];

  // StatsCommand manually defines its component data (not using handler pattern yet)
  override get data(): CommandData[] {
    return [
      ...this.commands,
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.Retry,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.LoadGames,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.FixPlayerSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.FixGamesSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.FixOutcomeSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.FixConfirm,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.FixCancel,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.ManualQueueSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualQueuePreviousPage,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualQueueNextPage,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.UserSelect,
          custom_id: InteractionButton.ManualPlayerSelect,
          values: [],
          resolved: { users: {} },
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.ManualGamesSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.ManualOutcomeSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualConfirm,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualSetQueueNumber,
        },
      },
      {
        type: InteractionType.ModalSubmit,
        data: {
          components: [],
          custom_id: InteractionButton.ManualQueueNumberModal,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualAdjustScore,
        },
      },
      {
        type: InteractionType.ModalSubmit,
        data: {
          components: [],
          custom_id: InteractionButton.ManualScoreModal,
        },
      },
    ];
  }

  protected handleInteraction(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    switch (type) {
      case InteractionType.ApplicationCommand: {
        if (isPlayerStatsUserCommand(interaction)) {
          return this.handlePlayerStatsUserCommand(interaction);
        }

        if (isCompareStatsUserCommand(interaction)) {
          return this.handleCompareStatsUserCommand(interaction);
        }

        const subcommand = this.services.discordService.extractSubcommand(interaction, "stats");

        switch (subcommand.name) {
          case "neatqueue": {
            return this.handleNeatQueueSubCommand(interaction, subcommand.mappedOptions);
          }
          case "match": {
            return this.handleMatchSubCommand(interaction, subcommand.mappedOptions);
          }
          case "fix": {
            return this.handleFixSubCommand(interaction, subcommand.mappedOptions);
          }
          case "manual": {
            return this.handleManualSubCommand(interaction, subcommand.mappedOptions);
          }
          case "player": {
            return this.handlePlayerSubCommand(interaction, subcommand.mappedOptions);
          }
          case "compare": {
            return this.handleCompareSubCommand(interaction, subcommand.mappedOptions);
          }
          default: {
            throw new Error("Unknown subcommand");
          }
        }
      }
      case InteractionType.MessageComponent: {
        const { custom_id } = interaction.data;
        const compareCustomId = getPlayerCompareControlIdBase(custom_id);
        if (
          compareCustomId === PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID ||
          compareCustomId === PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID ||
          compareCustomId === PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID
        ) {
          return this.handleCompareSelect(interaction as APIMessageComponentSelectMenuInteraction);
        }

        switch (custom_id) {
          case PLAYER_STATS_QUEUE_SELECT_CONTROL_ID: {
            return this.handlePlayerStatsSelect(interaction as APIMessageComponentSelectMenuInteraction);
          }
          case PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID: {
            return this.handlePlayerStatsSelect(interaction as APIMessageComponentSelectMenuInteraction);
          }
          case PLAYER_STATS_WINDOW_SELECT_CONTROL_ID: {
            return this.handlePlayerStatsSelect(interaction as APIMessageComponentSelectMenuInteraction);
          }
          case InteractionButton.Retry.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () => this.retryJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.LoadGames.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () => this.loadGamesJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.FixPlayerSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Fetching recent custom games...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleFixPlayerSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.FixGamesSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.handleFixGamesSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.FixOutcomeSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.handleFixOutcomeSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.FixConfirm.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.handleFixConfirmationJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.FixCancel.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () => this.handleFixCancelJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.ManualQueueSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Loading recent custom games...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualQueueSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.ManualQueuePreviousPage.toString():
          case InteractionButton.ManualQueueNextPage.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Loading queue selection...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualQueuePageJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.ManualPlayerSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Fetching recent custom games...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualPlayerSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.ManualGamesSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Generating series preview...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualGamesSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.ManualOutcomeSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Updating series preview...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualOutcomeSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.ManualConfirm.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Posting series stats...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualConfirmJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.ManualSetQueueNumber.toString(): {
            return { response: this.createManualQueueNumberModal() };
          }
          case InteractionButton.ManualAdjustScore.toString(): {
            return { response: this.createManualScoreModal() };
          }
          default: {
            throw new Error(`Unknown interaction: ${custom_id}`);
          }
        }
      }
      case InteractionType.ModalSubmit: {
        if (interaction.data.custom_id === InteractionButton.ManualQueueNumberModal.toString()) {
          return this.handleManualQueueNumberModal(interaction);
        }

        if (interaction.data.custom_id === InteractionButton.ManualScoreModal.toString()) {
          return this.handleManualScoreModal(interaction);
        }

        throw new Error(`Unknown modal: ${interaction.data.custom_id}`);
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private async handleManualQueueSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { databaseService, discordService } = this.services;

    try {
      const queueChannelId = Preconditions.checkExists(interaction.data.values[0], "No queue selected");
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      const configuredQueues = await databaseService.findNeatQueueConfig({ GuildId: metadata.guildId });
      if (!configuredQueues.some((queue) => queue.ChannelId === queueChannelId)) {
        throw new EndUserError("The selected channel is not a configured NeatQueue channel.");
      }

      await this.showManualFlowStep(
        interaction.token,
        interaction.guild_locale ?? interaction.locale,
        { ...metadata, queueChannelId },
        discordService.getDiscordUserId(interaction),
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  /**
   * Returns to the preview when games were already chosen, otherwise to the games screen.
   */
  private async showManualFlowStep(
    interactionToken: string,
    locale: string,
    metadata: ManualFlowMetadata,
    fallbackPlayerId: string,
  ): Promise<void> {
    if (metadata.teams == null || metadata.selectedMatchIds == null) {
      await this.showManualGamesForPlayer(
        interactionToken,
        locale,
        metadata,
        metadata.selectedPlayerId ?? fallbackPlayerId,
      );
      return;
    }

    const series = await this.getManualSeriesMatches(metadata.selectedMatchIds);
    await this.showManualSeriesPreview(interactionToken, locale, {
      metadata,
      series,
      derivedSeriesOutcome: this.deriveManualSeriesOutcome(series),
    });
  }

  private handleManualQueueNumberModal(interaction: APIModalSubmitInteraction): ExecuteResponse {
    const rawQueueNumber = this.services.discordService.extractModalSubmitData(interaction).get("queue_number") ?? "";
    const queueNumber = /^\d+$/.test(rawQueueNumber.trim()) ? Number(rawQueueNumber.trim()) : Number.NaN;
    if (!Number.isInteger(queueNumber) || queueNumber < 1 || queueNumber >= MANUAL_QUEUE_NUMBER_MIN) {
      const warning = new EndUserError("The queue number must be a whole number between 1 and 999,999,999.", {
        title: "Invalid queue number",
        errorType: EndUserErrorType.WARNING,
      });
      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { embeds: [warning.discordEmbed], flags: MessageFlags.Ephemeral },
        },
      };
    }

    return {
      response: { type: InteractionResponseType.DeferredMessageUpdate },
      jobToComplete: async () => this.handleManualQueueNumberSubmitJob(interaction, queueNumber),
    };
  }

  private async handleManualQueueNumberSubmitJob(
    interaction: APIModalSubmitInteraction,
    queueNumber: number,
  ): Promise<void> {
    const { databaseService, discordService } = this.services;

    try {
      const messageId = Preconditions.checkExists(interaction.message, "Expected modal to come from a message").id;
      const metadata = await this.getManualMetadataWithRetry(messageId);
      const configuredQueues = await databaseService.findNeatQueueConfig({ GuildId: metadata.guildId });
      const updatedMetadata: ManualFlowMetadata = {
        ...metadata,
        queueNumber,
        queueChannelId: configuredQueues.length === 1 ? (configuredQueues[0]?.ChannelId ?? null) : null,
        queuePage: 0,
      };

      if (configuredQueues.length > 1) {
        await this.showManualQueueSelect(interaction.token, updatedMetadata, configuredQueues);
        return;
      }

      await this.showManualFlowStep(
        interaction.token,
        interaction.guild_locale ?? interaction.locale,
        updatedMetadata,
        discordService.getDiscordUserId(interaction),
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private handleFixSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const queueNumber = options.get("queue_number") as number | undefined;
    const isThreadChannel = this.isThreadChannel(interaction.channel.type);

    if (!isThreadChannel && queueNumber == null) {
      throw new EndUserError("queue_number is required when running /stats fix outside a thread.");
    }

    if (isThreadChannel && queueNumber == null) {
      return {
        response: {
          type: InteractionResponseType.DeferredChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
          },
        },
        jobToComplete: async () => this.fixSubCommandInThreadJob(interaction),
      };
    }

    const parentChannelId = "parent_id" in interaction.channel ? interaction.channel.parent_id : undefined;
    const channelId = isThreadChannel ? (parentChannelId ?? interaction.channel.id) : interaction.channel.id;

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: {
          flags: MessageFlags.Ephemeral,
        },
      },
      jobToComplete: async () => this.fixSubCommandJob(interaction, channelId, Preconditions.checkExists(queueNumber)),
    };
  }

  private async fixSubCommandJob(
    interaction: APIApplicationCommandInteraction,
    channelId: string,
    queueNumber: number,
  ): Promise<void> {
    const { discordService } = this.services;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const fixSource = await this.getFixQueueData(guildId, channelId, queueNumber);

      await this.fixCommandStartFlow(interaction, fixSource);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  /**
   * Manual series (and series whose NeatQueue result is gone) are rebuilt from the Guilty Spark overview instead.
   */
  private async getFixQueueData(guildId: string, channelId: string, queueNumber: number): Promise<FixSeriesSource> {
    if (queueNumber >= MANUAL_QUEUE_NUMBER_MIN) {
      const fromOverview = await this.getQueueDataFromSeriesOverview(guildId, queueNumber);
      if (fromOverview == null) {
        throw new EndUserError(`Could not find series stats for queue #${queueNumber.toString()}.`);
      }

      return fromOverview;
    }

    try {
      return {
        queueData: await this.services.discordService.getTeamsFromQueueResult(guildId, channelId, queueNumber),
        channelId,
        sourceKind: "neatqueue-result",
        isManualSeries: false,
      };
    } catch (error) {
      if (!(error instanceof EndUserError)) {
        throw error;
      }

      const fromOverview = await this.getQueueDataFromSeriesOverview(guildId, queueNumber);
      if (fromOverview == null) {
        throw error;
      }

      return fromOverview;
    }
  }

  private async getQueueDataFromSeriesOverview(
    guildId: string,
    queueNumber: number,
  ): Promise<FixSeriesSource | undefined> {
    const { discordService } = this.services;
    const overviewMessage = await discordService.findSeriesOverviewMessage(guildId, queueNumber);
    if (overviewMessage == null) {
      return undefined;
    }

    return {
      queueData: await discordService.getTeamsFromSeriesOverview(guildId, overviewMessage, queueNumber),
      channelId: overviewMessage.channel_id,
      sourceKind: "series-overview",
      isManualSeries: queueNumber >= MANUAL_QUEUE_NUMBER_MIN || isManualSeriesOverview(overviewMessage),
    };
  }

  private async fixSubCommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      if (!this.isThreadChannel(interaction.channel.type)) {
        throw new EndUserError("This command must be run in a thread channel.");
      }

      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const threadId = interaction.channel.id;
      const parentChannelId = "parent_id" in interaction.channel ? interaction.channel.parent_id : undefined;
      const channelId = parentChannelId ?? threadId;
      const queueNumber = await discordService.findQueueNumberForThread(guildId, threadId);
      const fixSource =
        queueNumber != null
          ? await this.getFixQueueData(guildId, channelId, queueNumber)
          : await this.getQueueDataFromThreadStarterMessage(guildId, channelId, threadId);

      await this.fixCommandStartFlow(interaction, fixSource);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  /**
   * Threads started from a message share its ID, so a thread can be traced back to the NeatQueue result or
   * Guilty Spark series overview it hangs off.
   */
  private async getQueueDataFromThreadStarterMessage(
    guildId: string,
    channelId: string,
    threadId: string,
  ): Promise<FixSeriesSource> {
    const { discordService } = this.services;
    const notFoundError = new EndUserError(
      "Could not determine which queue this thread's stats are for. Try running /stats fix queue_number:<queue> from the parent channel instead.",
    );

    let starterMessage: APIMessage;
    try {
      starterMessage = await discordService.getMessage(channelId, threadId);
    } catch {
      throw notFoundError;
    }

    if (starterMessage.author.id === NEAT_QUEUE_BOT_USER_ID) {
      return {
        queueData: await discordService.getTeamsFromMessage(guildId, starterMessage),
        channelId,
        sourceKind: "neatqueue-result",
        isManualSeries: false,
      };
    }

    const overviewQueueNumber =
      starterMessage.author.id === this.env.DISCORD_APP_ID
        ? extractQueueNumberFromSeriesOverviewEmbed(starterMessage)
        : undefined;
    if (overviewQueueNumber == null) {
      throw notFoundError;
    }

    return {
      queueData: await discordService.getTeamsFromSeriesOverview(guildId, starterMessage, overviewQueueNumber),
      channelId,
      sourceKind: "series-overview",
      isManualSeries: overviewQueueNumber >= MANUAL_QUEUE_NUMBER_MIN || isManualSeriesOverview(starterMessage),
    };
  }

  private async fixCommandStartFlow(
    interaction: APIApplicationCommandInteraction,
    fixSource: FixSeriesSource,
  ): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    const { channelId, queueData } = fixSource;
    const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
    const userId = discordService.getDiscordUserId(interaction);
    const permissions = await discordService.computeMemberPermissions(guildId, userId);
    const isAdmin = (permissions & PermissionFlagsBits.Administrator) !== 0n;
    const queuePlayers = queueData.teams.flatMap((team) => team.players);
    const queuePlayerIds = new Set(queuePlayers.map((player) => player.user.id));

    if (!isAdmin && !queuePlayerIds.has(userId)) {
      throw new EndUserError("Only players from that queue (or admins) can run /stats fix.");
    }

    const discordAssociations = await databaseService.getDiscordAssociations([...queuePlayerIds]);
    const xboxIds = discordAssociations.flatMap((association) =>
      association.XboxId !== "" ? [association.XboxId] : [],
    );
    const usersByXuid = xboxIds.length > 0 ? await haloService.getUsersByXuids(xboxIds) : [];
    const xuidToGamertag = new Map(usersByXuid.map((user) => [user.xuid, user.gamertag]));
    const discordIdToGamertag = new Map<string, string>();
    for (const association of discordAssociations) {
      if (association.XboxId === "") {
        continue;
      }

      const gamertag = xuidToGamertag.get(association.XboxId);
      if (gamertag == null || gamertag === "") {
        continue;
      }

      discordIdToGamertag.set(association.DiscordId, gamertag);
    }

    const selectOptions = queueData.teams
      .flatMap((team) =>
        team.players
          .filter((player) => discordIdToGamertag.has(player.user.id))
          .map((player) => {
            const label = player.nick ?? player.user.global_name ?? player.user.username;
            const gamertag = Preconditions.checkExists(discordIdToGamertag.get(player.user.id));

            return {
              label: label.slice(0, 100),
              value: player.user.id,
              description: `Gamertag: ${gamertag}`.slice(0, 100),
            };
          }),
      )
      .slice(0, 25); // Discord select menu has a max of 25 options

    if (selectOptions.length === 0) {
      throw new EndUserError(
        "No players in that queue have a connected Halo account. Ask a player to run /connect first.",
      );
    }

    const message = await discordService.updateDeferredReply(interaction.token, {
      embeds: [this.createStatusEmbed("Select a player from the queue to load candidate custom games.")],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.FixPlayerSelect,
              min_values: 1,
              max_values: 1,
              options: selectOptions,
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.FixCancel,
              label: "Cancel",
              style: 2,
            },
          ],
        },
      ],
    });

    const queueDataWithoutTimestamp: Omit<QueueData, "timestamp"> = {
      message: queueData.message,
      queue: queueData.queue,
      teams: queueData.teams,
    };
    await this.setFixMetadata(message.id, {
      guildId,
      channelId,
      sourceKind: fixSource.sourceKind,
      isManualSeries: fixSource.isManualSeries,
      queueData: queueDataWithoutTimestamp,
    });
  }

  private async handleFixPlayerSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      const selectedPlayerId = Preconditions.checkExists(interaction.data.values[0], "No player selected");
      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const recentGames = await this.getRecentCustomGames(selectedPlayerId, locale);
      const preselectedMatchIds = await this.getPreselectedFixMatchIds(metadata, interaction);
      const gameOptions = this.toGameSelectOptions(recentGames, preselectedMatchIds);

      const selectedMatchIds = gameOptions.filter((option) => Boolean(option.default)).map((option) => option.value);
      await this.setFixMetadata(interaction.message.id, {
        ...metadata,
        selectedPlayerId,
        selectedMatchIds,
      });

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed("Select the custom games that belong to this series.")],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionButton.FixGamesSelect,
                min_values: 1,
                max_values: Math.min(gameOptions.length, 25),
                options: gameOptions,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.FixCancel,
                label: "Cancel",
                style: 2,
              },
            ],
          },
        ],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async getPreselectedFixMatchIds(
    metadata: FixFlowMetadata,
    interaction: APIMessageComponentSelectMenuInteraction,
  ): Promise<Set<string>> {
    const { discordService, logService } = this.services;
    const preselectedMatchIds = new Set<string>();

    try {
      if (this.isThreadChannel(interaction.channel.type)) {
        const threadMessages = await discordService.findBotMessagesInThread(metadata.guildId, interaction.channel.id);
        for (const threadMessage of threadMessages) {
          const matchIds = extractDiscordSeriesMatchIdsFromEmbeds(threadMessage.embeds);
          for (const matchId of matchIds) {
            preselectedMatchIds.add(matchId);
          }
        }

        if (preselectedMatchIds.size > 0) {
          return preselectedMatchIds;
        }
      }

      const existingLocation = await discordService.findExistingSeriesStatsThreadLocation(
        metadata.guildId,
        metadata.queueData.queue,
      );

      if (existingLocation?.parentOverviewMessage != null) {
        const overviewMessage = await discordService.getMessage(
          existingLocation.parentOverviewMessage.channelId,
          existingLocation.parentOverviewMessage.messageId,
        );
        const matchIds = extractDiscordSeriesMatchIdsFromEmbeds(overviewMessage.embeds);
        for (const matchId of matchIds) {
          preselectedMatchIds.add(matchId);
        }
      }

      if (preselectedMatchIds.size === 0 && existingLocation?.threadId != null) {
        const threadMessages = await discordService.findBotMessagesInThread(
          metadata.guildId,
          existingLocation.threadId,
        );
        for (const threadMessage of threadMessages) {
          const matchIds = extractDiscordSeriesMatchIdsFromEmbeds(threadMessage.embeds);
          for (const matchId of matchIds) {
            preselectedMatchIds.add(matchId);
          }
        }
      }
    } catch (error) {
      logService.warn(
        error,
        new Map([
          ["guildId", metadata.guildId],
          ["queueNumber", metadata.queueData.queue.toString()],
          ["reason", "Failed to discover existing series match IDs for /stats fix preselection"],
        ]),
      );
    }

    return preselectedMatchIds;
  }

  private async handleFixGamesSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService, haloService } = this.services;

    try {
      const selectedMatchIds = interaction.data.values;
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("Select at least one game.");
      }

      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const series = await haloService.getMatchDetails(selectedMatchIds);
      if (series.length === 0) {
        throw new EndUserError("No match details found for the selected games.");
      }

      const derivedSeriesOutcome = this.deriveFixSeriesOutcome(series);
      const selectedSeriesOutcome = derivedSeriesOutcome;

      await this.setFixMetadata(interaction.message.id, {
        ...metadata,
        selectedMatchIds,
        selectedSeriesOutcome,
      });

      await this.updateFixOutcomePreview(interaction, metadata, series, derivedSeriesOutcome, selectedSeriesOutcome);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleFixOutcomeSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService, haloService } = this.services;

    try {
      const [selectedSeriesOutcomeRaw] = interaction.data.values;
      if (selectedSeriesOutcomeRaw == null) {
        throw new EndUserError("No series outcome selected. Please run /stats fix again.");
      }
      const selectedSeriesOutcome = this.parseFixSeriesOutcome(selectedSeriesOutcomeRaw);
      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const selectedMatchIds = metadata.selectedMatchIds ?? [];
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("No games were selected. Please run /stats fix again.");
      }

      const series = await haloService.getMatchDetails(selectedMatchIds);
      if (series.length === 0) {
        throw new EndUserError("No match details found for the selected games.");
      }

      const derivedSeriesOutcome = this.deriveFixSeriesOutcome(series);
      await this.setFixMetadata(interaction.message.id, { ...metadata, selectedSeriesOutcome });
      await this.updateFixOutcomePreview(interaction, metadata, series, derivedSeriesOutcome, selectedSeriesOutcome);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async updateFixOutcomePreview(
    interaction: APIMessageComponentSelectMenuInteraction,
    metadata: FixFlowMetadata,
    series: MatchStats[],
    derivedSeriesOutcome: FixSeriesOutcome,
    selectedSeriesOutcome: FixSeriesOutcome,
  ): Promise<void> {
    const { discordService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;
    const seriesEmbed = await this.createSeriesEmbed({
      guildId: metadata.guildId,
      channelId: metadata.channelId,
      locale,
      queueData: metadata.queueData,
      series,
    });
    const derivedResultLabel = this.getFixSeriesOutcomeLabel(derivedSeriesOutcome, metadata.queueData.teams);
    const selectedResultLabel = this.getFixSeriesOutcomeLabel(selectedSeriesOutcome, metadata.queueData.teams);

    await discordService.updateDeferredReply(interaction.token, {
      embeds: [
        this.createStatusEmbed(
          `Preview generated. Confirm to replace the previous series stats.\nDerived result: ${derivedResultLabel}\nFinal result: ${selectedResultLabel}`,
        ),
        ...seriesEmbed.embeds,
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.FixOutcomeSelect,
              min_values: 1,
              max_values: 1,
              options: this.getFixSeriesOutcomeOptions(metadata.queueData.teams, selectedSeriesOutcome),
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.FixConfirm,
              label: "Confirm",
              style: 3,
            },
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.FixCancel,
              label: "Cancel",
              style: 2,
            },
          ],
        },
      ],
    });
  }

  private async handleFixConfirmationJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const selectedMatchIds = metadata.selectedMatchIds ?? [];
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("No games were selected. Please run /stats fix again.");
      }
      if (metadata.selectedSeriesOutcome == null) {
        throw new EndUserError("No final series result was selected. Please run /stats fix again.");
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const [guildConfig, series] = await Promise.all([
        databaseService.getGuildConfig(metadata.guildId),
        haloService.getMatchDetails(selectedMatchIds),
      ]);
      if (series.length === 0) {
        throw new EndUserError("No match details found for selected games.");
      }

      const amendedSeriesEmbed = await this.createSeriesEmbed({
        guildId: metadata.guildId,
        channelId: metadata.channelId,
        locale,
        queueData: metadata.queueData,
        series,
      });
      const amendedByUserId = discordService.getDiscordUserId(interaction);
      const amendedField = {
        name: "Amended by",
        value: `<@${amendedByUserId}> on ${discordService.getTimestamp(new Date().toISOString())}`,
        inline: false,
      };
      const amendedOverviewEmbed = Preconditions.checkExists(amendedSeriesEmbed.embeds[0]);
      amendedOverviewEmbed.fields ??= [];
      const createdManuallyByField = metadata.queueData.message.embeds
        .flatMap((embed) => embed.fields ?? [])
        .find((field) => field.name === "Created manually by");
      if (metadata.isManualSeries === true) {
        amendedOverviewEmbed.fields.push({
          name: "Final series result",
          value: this.getFixSeriesOutcomeLabel(metadata.selectedSeriesOutcome, metadata.queueData.teams),
          inline: false,
        });
      }
      if (metadata.isManualSeries === true && createdManuallyByField != null) {
        amendedOverviewEmbed.fields.push(createdManuallyByField);
      }
      amendedOverviewEmbed.fields.push(amendedField);

      const isManualSeries = metadata.isManualSeries ?? metadata.queueData.queue >= MANUAL_QUEUE_NUMBER_MIN;
      const linkedQueueSource =
        metadata.sourceKind === "series-overview"
          ? this.getLinkedQueueSourceFromOverview(metadata.queueData.message, metadata.guildId)
          : undefined;
      const hasKnownManualQueueChannel = linkedQueueSource != null && linkedQueueSource.messageId == null;
      const neatQueueConfig =
        isManualSeries && metadata.queueData.queue >= MANUAL_QUEUE_NUMBER_MIN && !hasKnownManualQueueChannel
          ? undefined
          : await this.tryResolveNeatQueueConfigForResultsChannel(
              metadata.guildId,
              metadata.channelId,
              metadata.sourceKind ?? "neatqueue-result",
              metadata.queueData.message,
            );
      const existingLocation =
        (await discordService.findExistingSeriesStatsThreadLocation(metadata.guildId, metadata.queueData.queue)) ??
        this.getNeatQueueResultThreadLocation(metadata.queueData.message);
      await this.deletePreviousSeriesErrorMessages(metadata, neatQueueConfig);

      let destinationThreadId: string;
      let shouldPostOverviewInThread = false;
      if (existingLocation != null) {
        const existingThreadMessages = await discordService.findBotMessagesInThread(
          metadata.guildId,
          existingLocation.threadId,
        );
        const existingGuiltySparkMessageIds = existingThreadMessages
          .filter((message) => message.content !== "" || message.embeds.length > 0)
          .map((message) => message.id);
        await this.deleteMessagesInChunks(
          existingLocation.threadId,
          existingGuiltySparkMessageIds,
          "Replacing amended series stats",
        );

        if (existingLocation.parentOverviewMessage != null) {
          await discordService.editMessage(
            existingLocation.parentOverviewMessage.channelId,
            existingLocation.parentOverviewMessage.messageId,
            {
              embeds: amendedSeriesEmbed.embeds,
              components: amendedSeriesEmbed.components,
            },
          );
          destinationThreadId = existingLocation.threadId;
        } else {
          destinationThreadId = existingLocation.threadId;
          shouldPostOverviewInThread = true;
        }
      } else {
        const destination = await this.createFixSeriesStatsThread({
          metadata,
          neatQueueConfig,
          seriesEmbed: amendedSeriesEmbed,
          threadName: `Queue #${metadata.queueData.queue.toString()} series stats (${haloService.getSeriesScore(series, locale, true)})`,
        });
        ({ threadId: destinationThreadId, shouldPostOverviewInThread } = destination);
      }

      if (shouldPostOverviewInThread) {
        await discordService.createMessage(destinationThreadId, {
          embeds: amendedSeriesEmbed.embeds,
          components: amendedSeriesEmbed.components,
        });
      }
      await this.postSeriesEmbedsToThread(destinationThreadId, series, guildConfig, locale);
      await this.postGameStatsOrButton(destinationThreadId, series, guildConfig, locale);
      if (isManualSeries) {
        await discordService.cacheDiscordSeriesMatchIds(
          metadata.guildId,
          metadata.queueData.queue,
          series.map((match) => match.MatchId),
        );
      }
      await this.cacheDiscordSeriesStats(metadata.guildId, metadata.queueData.queue, series, locale, isManualSeries);
      if (neatQueueConfig != null && metadata.queueData.queue < MANUAL_QUEUE_NUMBER_MIN) {
        await this.persistFixedSeriesToLeaderboard(metadata, neatQueueConfig, series, locale);
      }

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed("Series stats were amended successfully.")],
        components: [],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private getNeatQueueResultThreadLocation(
    neatQueueMessage: APIMessage,
  ): ExistingSeriesStatsThreadLocation | undefined {
    return neatQueueMessage.thread != null ? { threadId: neatQueueMessage.thread.id } : undefined;
  }

  /**
   * Mirrors NeatQueue series posting, falling back to a channel post if the result thread can't be started.
   */
  private async createFixSeriesStatsThread({
    metadata,
    neatQueueConfig,
    seriesEmbed,
    threadName,
  }: {
    metadata: FixFlowMetadata;
    neatQueueConfig: NeatQueueConfigRow | undefined;
    seriesEmbed: SeriesOverviewEmbedOutput;
    threadName: string;
  }): Promise<{ threadId: string; shouldPostOverviewInThread: boolean }> {
    const { discordService, logService } = this.services;

    if (neatQueueConfig?.PostSeriesMode === NeatQueuePostSeriesDisplayMode.THREAD) {
      try {
        const thread = await discordService.startThreadFromMessage(
          metadata.channelId,
          metadata.queueData.message.id,
          threadName,
        );
        return { threadId: thread.id, shouldPostOverviewInThread: true };
      } catch (error) {
        logService.warn(
          error,
          new Map([
            ["guildId", metadata.guildId],
            ["channelId", metadata.channelId],
            ["queue", metadata.queueData.queue.toString()],
            ["reason", "Failed to start thread from NeatQueue result, falling back to channel post"],
          ]),
        );
      }
    }

    const postChannelId =
      neatQueueConfig?.PostSeriesChannelId ?? neatQueueConfig?.ResultsChannelId ?? metadata.channelId;
    const seriesOverviewMessage = await discordService.createMessage(postChannelId, {
      embeds: seriesEmbed.embeds,
      components: seriesEmbed.components,
    });
    const thread = await discordService.startThreadFromMessage(postChannelId, seriesOverviewMessage.id, threadName);
    return { threadId: thread.id, shouldPostOverviewInThread: false };
  }

  /**
   * Channel-mode failures post the error straight into the post channel rather than a thread.
   */
  private async deletePreviousSeriesErrorMessages(
    metadata: FixFlowMetadata,
    neatQueueConfig: NeatQueueConfigRow | undefined,
  ): Promise<void> {
    const { discordService, logService } = this.services;
    const resultsChannelId = neatQueueConfig?.ResultsChannelId ?? metadata.channelId;
    const postChannelId = neatQueueConfig?.PostSeriesChannelId ?? resultsChannelId;

    try {
      const errorMessages = await discordService.findSeriesErrorMessagesInChannel(metadata.guildId, postChannelId, {
        queueNumber: metadata.queueData.queue,
        resultsChannelId,
        afterMessageId: metadata.queueData.message.id,
      });
      await this.deleteMessagesInChunks(
        postChannelId,
        errorMessages.map((message) => message.id),
        "Replacing amended series stats",
      );
    } catch (error) {
      logService.warn(
        error,
        new Map([
          ["guildId", metadata.guildId],
          ["channelId", postChannelId],
          ["queue", metadata.queueData.queue.toString()],
          ["reason", "Failed to clean up previous series error messages"],
        ]),
      );
    }
  }

  private async persistFixedSeriesToLeaderboard(
    metadata: FixFlowMetadata,
    neatQueueConfig: NeatQueueConfigRow,
    series: MatchStats[],
    locale: string,
  ): Promise<void> {
    try {
      await this.services.leaderboardService.persistReconciledSeriesData({
        guildId: metadata.guildId,
        channelId: neatQueueConfig.ChannelId,
        queueNumber: metadata.queueData.queue,
        neatQueueConfig,
        series,
        winnerTeamIndex:
          metadata.selectedSeriesOutcome === "TEAM_0" ? 0 : metadata.selectedSeriesOutcome === "TEAM_1" ? 1 : -1,
        locale,
      });
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["context", "Stats fix leaderboard reconciliation failed"],
          ["guildId", metadata.guildId],
          ["channelId", metadata.channelId],
          ["queue", metadata.queueData.queue.toString()],
        ]),
      );
    }
  }

  private async tryResolveNeatQueueConfigForResultsChannel(
    guildId: string,
    resultsChannelId: string,
    sourceKind: FixSeriesSourceKind,
    sourceMessage: APIMessage,
  ): Promise<NeatQueueConfigRow | undefined> {
    try {
      return await this.resolveNeatQueueConfigForResultsChannel(guildId, resultsChannelId, sourceKind, sourceMessage);
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["context", "Stats fix queue config resolution failed"],
          ["guildId", guildId],
          ["channelId", resultsChannelId],
        ]),
      );
      return undefined;
    }
  }

  private async resolveNeatQueueConfigForResultsChannel(
    guildId: string,
    resultsChannelId: string,
    sourceKind: FixSeriesSourceKind,
    sourceMessage: APIMessage,
  ): Promise<NeatQueueConfigRow> {
    const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: guildId });
    const linkedSource =
      sourceKind === "series-overview" ? this.getLinkedQueueSourceFromOverview(sourceMessage, guildId) : undefined;
    const isSelfLink =
      linkedSource?.channelId === sourceMessage.channel_id && linkedSource.messageId === sourceMessage.id;
    if (linkedSource != null && !isSelfLink && linkedSource.messageId == null) {
      const linkedQueueMatches = this.findNeatQueueConfigs(configuredQueues, linkedSource.channelId, "ChannelId");
      if (linkedQueueMatches.length === 1) {
        return Preconditions.checkExists(linkedQueueMatches[0]);
      }
    } else if (linkedSource != null && !isSelfLink) {
      const linkedResultsMatches = this.findNeatQueueConfigs(
        configuredQueues,
        linkedSource.channelId,
        "ResultsChannelId",
      );
      if (linkedResultsMatches.length === 1) {
        return Preconditions.checkExists(linkedResultsMatches[0]);
      }
    }

    return this.resolveNeatQueueConfigForChannelRole(configuredQueues, resultsChannelId, sourceKind);
  }

  private resolveNeatQueueConfigForChannelRole(
    configuredQueues: NeatQueueConfigRow[],
    channelId: string,
    sourceKind: FixSeriesSourceKind,
  ): NeatQueueConfigRow {
    const channelRoles: ("PostSeriesChannelId" | "ResultsChannelId" | "ChannelId")[] =
      sourceKind === "series-overview"
        ? ["PostSeriesChannelId", "ResultsChannelId", "ChannelId"]
        : ["ChannelId", "ResultsChannelId", "PostSeriesChannelId"];
    for (const channelRole of channelRoles) {
      const matches = this.findNeatQueueConfigs(configuredQueues, channelId, channelRole);
      if (matches.length === 1) {
        return Preconditions.checkExists(matches[0]);
      }
      if (matches.length > 1) {
        throw new Error(`Expected exactly one NeatQueue config for ${channelRole} ${channelId}`);
      }
    }

    throw new Error(`Could not find a NeatQueue config for channel ${channelId}`);
  }

  private findNeatQueueConfigs(
    configuredQueues: NeatQueueConfigRow[],
    channelId: string,
    channelRole: "PostSeriesChannelId" | "ResultsChannelId" | "ChannelId",
  ): NeatQueueConfigRow[] {
    return configuredQueues.filter((queue) => queue[channelRole] === channelId);
  }

  private async handleFixCancelJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed("Cancelled.")],
        components: [],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async deleteMessagesInChunks(channelId: string, messageIds: string[], reason: string): Promise<void> {
    const { discordService, logService } = this.services;

    for (let start = 0; start < messageIds.length; start += 100) {
      const chunk = messageIds.slice(start, start + 100);
      if (chunk.length === 0) {
        continue;
      }
      if (chunk.length === 1) {
        await discordService.deleteMessage(channelId, Preconditions.checkExists(chunk[0]), reason);
        continue;
      }
      try {
        await discordService.bulkDeleteMessages(channelId, chunk, reason);
      } catch (error) {
        logService.warn(
          error,
          new Map([
            ["channelId", channelId],
            ["messageCount", chunk.length.toString()],
            ["reason", "Bulk delete failed, falling back to per-message delete"],
          ]),
        );
        for (const messageId of chunk) {
          await discordService.deleteMessage(channelId, messageId, reason);
        }
      }
    }
  }
}
