import type {
  APIModalSubmitInteraction,
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
} from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { BaseInteraction, ExecuteResponse, ApplicationCommandData, CommandData } from "../base/base-command";
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
import { StatsFixMaintenanceCommand } from "./stats-fix-maintenance-command";
import { InteractionButton } from "./stats-interaction-button";
import type { ManualFlowMetadata } from "./stats-flow-types";
import { MANUAL_QUEUE_NUMBER_MIN } from "./manual-series";

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

export class StatsCommand extends StatsFixMaintenanceCommand {
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
}
