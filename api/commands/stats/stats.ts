import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIEmbed,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  APISelectMenuOption,
  APIUserApplicationCommandGuildInteraction,
} from "discord-api-types/v10";
import {
  EmbedType,
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
import { MatchType } from "halo-infinite-api";
import type { MatchStats, GameVariantCategory } from "halo-infinite-api";
import { formatDistanceToNowStrict, subHours } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { computeSeriesTeamWins } from "@guilty-spark/shared/halo/series-score";
import {
  LeaderboardMetric,
  LeaderboardMetricAggregation,
  LeaderboardWindow,
} from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardPlayerRelationshipMetric } from "../../services/database/types/leaderboard_player_relationship";
import type { BaseInteraction, ExecuteResponse, ApplicationCommandData, CommandData } from "../base/base-command";
import { BaseCommand } from "../base/base-command";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import type { QueueData } from "../../services/discord/discord";
import type { BaseMatchEmbed } from "../../embeds/stats/base-match-embed";
import { SeriesPlayersEmbed } from "../../embeds/stats/series-players-embed";
import { SeriesOverviewEmbed } from "../../embeds/stats/series-overview-embed";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import { SeriesTeamsEmbed } from "../../embeds/stats/series-teams-embed";
import {
  buildDiscordSeriesRenderDataFromMatches,
  extractDiscordSeriesMatchIdsFromEmbeds,
} from "../../services/discord/discord-series-stats";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import { StatsReturnType } from "../../services/database/types/guild_config";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import { EmbedColors } from "../../embeds/colors";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import { create } from "../../embeds/stats/create";
import {
  ALL_QUEUES_VALUE,
  PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
  PLAYER_STATS_TEMPORARY_ERROR_FOOTER,
  PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
  createPlayerStatsEmbeds,
  createPlayerStatsNoQualifyingGamesResponse,
  createPlayerStatsRelationshipEmbeds,
  getPlayerStatsMetricsForAggregation,
  getPlayerStatsStateFromMessage,
  parsePlayerStatsRelationshipMetric,
} from "../../embeds/stats/player-stats-embed";
import type { PlayerStatsQueueOption, PlayerStatsViewState } from "../../embeds/stats/player-stats-embed";

interface FixFlowMetadata extends Record<string, unknown> {
  guildId: string;
  channelId: string;
  // timestamp is a Date at fetch time but becomes a string after the JSON round-trip through KV, so it's omitted here
  queueData: Omit<QueueData, "timestamp">;
  selectedPlayerId?: string;
  selectedMatchIds?: string[];
  selectedSeriesOutcome?: FixSeriesOutcome;
}

type FixSeriesOutcome = "TEAM_0" | "TEAM_1" | "TIE";

const FIX_METADATA_RETRY_BASE_DELAY_MS = 150;
const FIX_METADATA_MAX_RETRIES = 3;
const PLAYER_WINDOW_VALUES = new Set<string>(Object.values(LeaderboardWindow));
const PLAYER_AGGREGATION_VALUES = new Map<string, LeaderboardMetricAggregation>(
  Object.values(LeaderboardMetricAggregation).map((aggregation) => [aggregation, aggregation]),
);

function isLeaderboardWindow(value: string): value is LeaderboardWindow {
  return PLAYER_WINDOW_VALUES.has(value);
}

function parsePlayerStatsAggregation(value: string): LeaderboardMetricAggregation | null {
  return PLAYER_AGGREGATION_VALUES.get(value) ?? null;
}

function isPlayerStatsUserCommand(
  interaction: BaseInteraction,
): interaction is APIUserApplicationCommandGuildInteraction {
  return (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.data.type === ApplicationCommandType.User &&
    "guild_id" in interaction &&
    "member" in interaction
  );
}

export enum InteractionButton {
  Retry = "btn_stats_retry",
  LoadGames = "btn_stats_load_games",
  FixPlayerSelect = "btn_stats_fix_player_select",
  FixGamesSelect = "btn_stats_fix_games_select",
  FixOutcomeSelect = "btn_stats_fix_outcome_select",
  FixConfirm = "btn_stats_fix_confirm",
  FixCancel = "btn_stats_fix_cancel",
}

export class StatsCommand extends BaseCommand {
  readonly commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.User,
      name: "Player stats",
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
              type: ApplicationCommandOptionType.Boolean,
              name: "private",
              description: "Only show the response to you",
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
    ];
  }

  protected handleInteraction(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    switch (type) {
      case InteractionType.ApplicationCommand: {
        if (isPlayerStatsUserCommand(interaction)) {
          return this.handlePlayerStatsUserCommand(interaction);
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
          case "player": {
            return this.handlePlayerSubCommand(interaction, subcommand.mappedOptions);
          }
          default: {
            throw new Error("Unknown subcommand");
          }
        }
      }
      case InteractionType.MessageComponent: {
        const { custom_id } = interaction.data;
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
          default: {
            throw new Error(`Unknown interaction: ${custom_id}`);
          }
        }
      }
      case InteractionType.ModalSubmit: {
        throw new Error("Modals not supported");
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private handlePlayerSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const data: APIInteractionResponseDeferredChannelMessageWithSource["data"] = {};
    if (options.get("private") === true) {
      data.flags = MessageFlags.Ephemeral;
    }

    return {
      response: { type: InteractionResponseType.DeferredChannelMessageWithSource, data },
      jobToComplete: async () => this.playerStatsSubCommandJob(interaction, options),
    };
  }

  private handlePlayerStatsUserCommand(interaction: APIUserApplicationCommandGuildInteraction): ExecuteResponse {
    return {
      response: { type: InteractionResponseType.DeferredChannelMessageWithSource },
      jobToComplete: async () => this.playerStatsSubCommandJob(interaction, new Map(), interaction.data.target_id),
    };
  }

  private async playerStatsSubCommandJob(
    interaction: APIApplicationCommandInteraction | APIUserApplicationCommandGuildInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
    targetUserIdOverride?: string,
  ): Promise<void> {
    const guildId = interaction.guild_id;
    if (guildId == null) {
      await this.services.discordService.updateDeferredReplyWithError(
        interaction.token,
        new EndUserError("This command can only be used inside a server."),
      );
      return;
    }

    try {
      const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: guildId });
      if (configuredQueues.length === 0) {
        throw new EndUserError(
          "This server has no configured NeatQueue channels. Set one up before using this command.",
        );
      }

      const requestedQueue = options.get("queue");
      const queueChannelId = typeof requestedQueue === "string" ? requestedQueue : null;
      if (queueChannelId != null && !configuredQueues.some((queue) => queue.ChannelId === queueChannelId)) {
        throw new EndUserError("The selected channel is not a configured NeatQueue channel.");
      }

      const targetUserId = targetUserIdOverride ?? this.getPlayerTargetUserId(interaction, options);
      const associations = await this.services.databaseService.getDiscordAssociations([targetUserId]);
      const [association] = associations;
      if (association == null) {
        throw new EndUserError("That Discord user is not linked to a Halo account.");
      }

      const requestedWindow = options.get("window");
      const window = typeof requestedWindow === "string" ? this.parsePlayerWindow(requestedWindow) : undefined;
      const response = await this.createPlayerStatsResponse({
        guildId,
        xboxXuid: association.XboxId,
        queueChannelId,
        configuredQueues,
        aggregation: null,
        relationshipMetric: null,
        window,
        locale: interaction.guild_locale ?? interaction.locale,
      });

      if (response == null) {
        throw new EndUserError("No games played in the selected window and queue scope.");
      }

      await this.services.discordService.updateDeferredReply(interaction.token, response);
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private getPlayerTargetUserId(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): string {
    const requestedUser = options.get("user");
    if (typeof requestedUser === "string") {
      return requestedUser;
    }

    return this.services.discordService.getDiscordUserId(interaction);
  }

  private parsePlayerWindow(value: string): LeaderboardWindow {
    if (isLeaderboardWindow(value)) {
      return value;
    }

    throw new EndUserError("The selected leaderboard window is invalid.");
  }

  private handlePlayerStatsSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    if (!this.isPlayerStatsCommandInvoker(interaction)) {
      const warning = new EndUserError("Only the person who called the command can use this stats embed.", {
        title: "Stats embed locked",
        errorType: EndUserErrorType.WARNING,
      });
      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            embeds: [warning.discordEmbed],
            flags: MessageFlags.Ephemeral,
          },
        },
      };
    }

    switch (interaction.data.custom_id) {
      case PLAYER_STATS_QUEUE_SELECT_CONTROL_ID: {
        return this.handlePlayerStatsQueueSelect(interaction);
      }
      case PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID: {
        return this.handlePlayerStatsAggregationSelect(interaction);
      }
      case PLAYER_STATS_WINDOW_SELECT_CONTROL_ID: {
        return this.handlePlayerStatsWindowSelect(interaction);
      }
      default: {
        throw new Error(`Unexpected player stats control: ${interaction.data.custom_id}`);
      }
    }
  }

  private isPlayerStatsCommandInvoker(interaction: APIMessageComponentSelectMenuInteraction): boolean {
    const commandInvokerId = interaction.message.interaction_metadata?.user.id;
    if (commandInvokerId == null) {
      return false;
    }

    return this.services.discordService.getDiscordUserId(interaction) === commandInvokerId;
  }

  private handlePlayerStatsQueueSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return {
      response: { type: InteractionResponseType.DeferredMessageUpdate },
      jobToComplete: async (): Promise<void> => {
        await this.executePlayerStatsStateInteraction(interaction, (state) => {
          const [selectedValue] = interaction.data.values;
          if (selectedValue == null) {
            throw new EndUserError("A queue must be selected.");
          }

          return { ...state, queueChannelId: selectedValue === ALL_QUEUES_VALUE ? null : selectedValue };
        });
      },
    };
  }

  private handlePlayerStatsAggregationSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return {
      response: { type: InteractionResponseType.DeferredMessageUpdate },
      jobToComplete: async (): Promise<void> => {
        await this.executePlayerStatsStateInteraction(interaction, (state) => {
          const [selectedValue] = interaction.data.values;
          if (selectedValue == null) {
            throw new EndUserError("A stats type must be selected.");
          }

          const relationshipMetric = parsePlayerStatsRelationshipMetric(selectedValue);
          if (relationshipMetric != null) {
            return { ...state, aggregation: null, relationshipMetric };
          }

          const aggregation = parsePlayerStatsAggregation(selectedValue);
          if (aggregation == null) {
            throw new EndUserError("The selected stats type is invalid.");
          }

          return { ...state, aggregation, relationshipMetric: null };
        });
      },
    };
  }

  private handlePlayerStatsWindowSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return {
      response: { type: InteractionResponseType.DeferredMessageUpdate },
      jobToComplete: async (): Promise<void> => {
        await this.executePlayerStatsStateInteraction(interaction, (state) => {
          const [selectedValue] = interaction.data.values;
          if (selectedValue == null) {
            throw new EndUserError("A window must be selected.");
          }

          return { ...state, window: this.parsePlayerWindow(selectedValue) };
        });
      },
    };
  }

  private async executePlayerStatsStateInteraction(
    interaction: APIMessageComponentSelectMenuInteraction,
    stateUpdater: (state: PlayerStatsViewState) => PlayerStatsViewState,
  ): Promise<void> {
    try {
      const currentState = getPlayerStatsStateFromMessage(interaction.message);
      if (currentState == null) {
        throw new EndUserError("This stats view has expired. Run /stats player again.");
      }

      const state = stateUpdater(currentState);
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: guildId });
      const response = await this.createPlayerStatsResponse({
        guildId,
        xboxXuid: state.xboxXuid,
        queueChannelId: state.queueChannelId,
        configuredQueues,
        aggregation: state.aggregation,
        relationshipMetric: state.relationshipMetric,
        window: state.window,
        locale: interaction.guild_locale ?? interaction.locale,
      });

      if (response == null) {
        await this.services.discordService.updateDeferredReply(
          interaction.token,
          createPlayerStatsNoQualifyingGamesResponse(interaction.message, state),
        );
        return;
      }

      await this.services.discordService.updateDeferredReply(interaction.token, response);
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error, {
        preserveMessage: interaction.message,
        errorEmbedFooter: PLAYER_STATS_TEMPORARY_ERROR_FOOTER,
      });
    }
  }

  private async createPlayerStatsResponse({
    guildId,
    xboxXuid,
    queueChannelId,
    configuredQueues,
    aggregation,
    relationshipMetric,
    window,
    locale,
  }: {
    guildId: string;
    xboxXuid: string;
    queueChannelId: string | null;
    configuredQueues: NeatQueueConfigRow[];
    aggregation: LeaderboardMetricAggregation | null;
    relationshipMetric: LeaderboardPlayerRelationshipMetric | null;
    window: LeaderboardWindow | undefined;
    locale: string;
  }): Promise<ReturnType<typeof createPlayerStatsEmbeds> | null> {
    const configuredQueueChannelIds = configuredQueues.map((queue) => queue.ChannelId);
    if (relationshipMetric != null) {
      const relationshipResult = await this.services.leaderboardService.getLeaderboardPlayerRelationships({
        guildId,
        xboxXuid,
        queueChannelId,
        ...(queueChannelId == null ? { queueChannelIds: configuredQueueChannelIds } : {}),
        ...(window == null ? {} : { window }),
        metric: relationshipMetric,
      });
      if (relationshipResult == null) {
        return null;
      }

      const queueOptions = await this.getPlayerStatsQueueOptions({
        guildId,
        xboxXuid,
        configuredQueues,
        window: relationshipResult.window,
      });
      return createPlayerStatsRelationshipEmbeds({
        targetGamertag: relationshipResult.stats.Gamertag,
        rows: relationshipResult.rows,
        state: {
          aggregation: null,
          relationshipMetric,
          xboxXuid: relationshipResult.stats.XboxXuid,
          queueChannelId,
          window: relationshipResult.window,
        },
        locale,
        queueLabel: this.getPlayerStatsQueueLabel(queueChannelId, queueOptions),
        queueOptions,
        resetAt: relationshipResult.resetAt,
      });
    }

    const result = await this.services.leaderboardService.getLeaderboardPlayerStats({
      guildId,
      xboxXuid,
      queueChannelId,
      ...(queueChannelId == null ? { queueChannelIds: configuredQueueChannelIds } : {}),
      ...(window == null ? {} : { window }),
    });
    if (result == null) {
      return null;
    }

    const selectedAggregation = aggregation ?? result.defaultAggregation;
    const metrics = getPlayerStatsMetricsForAggregation(selectedAggregation);
    const rankMetrics = metrics.includes(LeaderboardMetric.GamesPlayed)
      ? metrics
      : [LeaderboardMetric.GamesPlayed, ...metrics];
    const ranks = await this.services.leaderboardService.getLeaderboardPlayerMetricRanks({
      guildId,
      xboxXuid,
      queueChannelId,
      ...(queueChannelId == null ? { queueChannelIds: configuredQueueChannelIds } : {}),
      startEpochSeconds: result.startEpochSeconds,
      minGamesPlayed: result.minGamesPlayed,
      metrics: rankMetrics,
    });
    const queueOptions = await this.getPlayerStatsQueueOptions({
      guildId,
      xboxXuid,
      configuredQueues,
      window: result.window,
    });

    return createPlayerStatsEmbeds({
      stats: result.stats,
      ranks,
      state: {
        aggregation: selectedAggregation,
        relationshipMetric: null,
        xboxXuid: result.stats.XboxXuid,
        queueChannelId,
        window: result.window,
      },
      locale,
      queueLabel: this.getPlayerStatsQueueLabel(queueChannelId, queueOptions),
      queueOptions,
      resetAt: result.resetAt,
      minGamesPlayed: result.minGamesPlayed,
    });
  }

  private async getPlayerStatsQueueOptions({
    guildId,
    xboxXuid,
    configuredQueues,
    window,
  }: {
    guildId: string;
    xboxXuid: string;
    configuredQueues: NeatQueueConfigRow[];
    window: LeaderboardWindow;
  }): Promise<PlayerStatsQueueOption[]> {
    const maxPlayedQueueOptions = 24;
    const queueProbeBatchSize = 8;
    const playedQueues: PlayerStatsQueueOption[] = [];

    // Reset markers (for LeaderboardWindow.LastReset) can differ per queue, so each queue's
    // eligibility must be resolved independently. Probing in small concurrent batches avoids both
    // a full round-trip's latency per configured queue and an unbounded burst across all queues,
    // and still exits early once enough played queues have been found.
    for (let batchStart = 0; batchStart < configuredQueues.length; batchStart += queueProbeBatchSize) {
      if (playedQueues.length >= maxPlayedQueueOptions) {
        break;
      }

      const batch = configuredQueues.slice(batchStart, batchStart + queueProbeBatchSize);
      const batchResults = await Promise.all(
        batch.map(async (queue) => ({
          queue,
          result: await this.services.leaderboardService.getLeaderboardPlayerStats({
            guildId,
            xboxXuid,
            queueChannelId: queue.ChannelId,
            window,
          }),
        })),
      );

      for (const { queue, result } of batchResults) {
        if (result != null && playedQueues.length < maxPlayedQueueOptions) {
          playedQueues.push({ label: `Queue ${queue.ChannelId}`, value: queue.ChannelId });
        }
      }
    }

    if (playedQueues.length <= 1) {
      return playedQueues;
    }

    return [{ label: "All configured queues", value: null }, ...playedQueues.slice(0, maxPlayedQueueOptions)];
  }

  private getPlayerStatsQueueLabel(
    queueChannelId: string | null,
    queueOptions: readonly PlayerStatsQueueOption[],
  ): string {
    if (queueChannelId == null) {
      return "all configured queues";
    }

    const queueOption = queueOptions.find((option) => option.value === queueChannelId);
    return queueOption?.label ?? `<#${queueChannelId}>`;
  }

  private handleNeatQueueSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const optionsChannel = options.get("channel") as string | undefined;
    let channel = optionsChannel ?? interaction.channel.id;
    const queue = options.get("queue") as number | undefined;

    const channelType = interaction.channel.type;

    if (
      optionsChannel == null &&
      (channelType === ChannelType.PublicThread ||
        channelType === ChannelType.PrivateThread ||
        channelType === ChannelType.AnnouncementThread)
    ) {
      if (queue == null) {
        return {
          response: {
            type: InteractionResponseType.DeferredChannelMessageWithSource,
          },
          jobToComplete: async () => this.neatQueueSubCommandInThreadJob(interaction),
        };
      }

      channel = interaction.channel.parent_id ?? interaction.channel.id;
    }

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      },
      jobToComplete: async () => this.neatQueueSubCommandJob(interaction, channel, queue),
    };
  }

  private async neatQueueSubCommandJob(
    interaction: APIApplicationCommandInteraction,
    channelId: string,
    queue: number | undefined,
  ): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;
    let computedQueue = queue;
    let endDateTime: Date | undefined;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const [guildConfig, queueData] = await Promise.all([
        databaseService.getGuildConfig(guildId),
        discordService.getTeamsFromQueueResult(guildId, channelId, queue),
      ]);

      computedQueue = queueData.queue;
      const startDateTime = subHours(queueData.timestamp, 6);
      endDateTime = queueData.timestamp;
      const series = await haloService.getSeriesFromDiscordQueue({
        teams: queueData.teams.map((team) =>
          team.players.map((player) => ({
            id: player.user.id,
            username: player.user.username,
            globalName: player.user.global_name,
            guildNickname: player.nick ?? null,
          })),
        ),
        startDateTime,
        endDateTime,
      });
      const seriesEmbed = await this.createSeriesEmbed({
        guildId: Preconditions.checkExists(interaction.guild_id, "No guild id"),
        channelId,
        locale,
        queueData,
        series,
      });

      await discordService.updateDeferredReply(interaction.token, {
        embeds: seriesEmbed.embeds,
        components: seriesEmbed.components,
      });

      await this.cacheDiscordSeriesStats(guildId, queueData.queue, series, locale);

      const message = await discordService.getMessageFromInteractionToken(interaction.token);
      const messageChannel = await discordService.getChannel(message.channel_id);
      const thread = [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(
        messageChannel.type,
      )
        ? messageChannel
        : await discordService.startThreadFromMessage(
            message.channel_id,
            message.id,
            `Queue #${queueData.queue.toString()} series stats (${haloService.getSeriesScore(series, locale, true)})`,
          );

      await this.postSeriesEmbedsToThread(thread.id, series, guildConfig, locale);
      await this.postGameStatsOrButton(thread.id, series, guildConfig, locale);

      await haloService.updateDiscordAssociations();
    } catch (error) {
      if (error instanceof EndUserError && computedQueue != null && endDateTime != null) {
        error.appendData({
          Channel: `<#${channelId}>`,
          Queue: computedQueue.toString(),
          Completed: discordService.getTimestamp(endDateTime.toISOString()),
        });
      }
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async neatQueueSubCommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
    const { databaseService, discordService, haloService, logService, neatQueueService } = this.services;
    let previousEndUserError: EndUserError | undefined;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");

      if (
        interaction.channel.type !== ChannelType.PublicThread &&
        interaction.channel.type !== ChannelType.PrivateThread &&
        interaction.channel.type !== ChannelType.AnnouncementThread
      ) {
        throw new EndUserError("This command must be run in a thread channel.");
      }
      const threadChannelId = interaction.channel.id;
      const [guildConfig, threadMessages] = await Promise.all([
        databaseService.getGuildConfig(guildId),
        this.services.discordService.getMessages(threadChannelId),
      ]);
      const firstMessage = threadMessages[threadMessages.length - 1];
      if (
        firstMessage?.referenced_message?.author.bot !== true ||
        firstMessage.referenced_message.author.id !== NEAT_QUEUE_BOT_USER_ID
      ) {
        throw new EndUserError("The first message in this thread is not from NeatQueue.");
      }
      const queueMessage = firstMessage.referenced_message;

      const guiltySparkMessages = threadMessages.filter(
        (message) =>
          message.author.id === this.env.DISCORD_APP_ID && (message.content !== "" || message.embeds.length > 0),
      );
      const errorMessages = guiltySparkMessages
        .map((message) => (message.embeds[0] ? EndUserError.fromDiscordEmbed(message.embeds[0]) : null))
        .filter((errorMessage) => errorMessage != null);

      try {
        await discordService.bulkDeleteMessages(
          threadChannelId,
          guiltySparkMessages.map((message) => message.id),
          "Cleaning up previous Guilty Spark messages before computing data",
        );
      } catch (error) {
        logService.error(error, new Map([["threadChannelId", threadChannelId]]));
      }

      [previousEndUserError] = errorMessages;
      if (
        previousEndUserError?.data["Channel"] != null &&
        previousEndUserError.data["Queue"] != null &&
        previousEndUserError.data["Completed"] != null
      ) {
        await neatQueueService.handleRetry({
          errorEmbed: previousEndUserError,
          guildId,
          interaction,
        });
      } else {
        const queueData = await discordService.getTeamsFromMessage(guildId, queueMessage);
        const locale = interaction.guild_locale ?? interaction.locale;
        const startDateTime = subHours(queueData.timestamp, 6);
        const endDateTime = queueData.timestamp;
        const series = await haloService.getSeriesFromDiscordQueue({
          teams: queueData.teams.map((team) =>
            team.players.map((player) => ({
              id: player.user.id,
              username: player.user.username,
              globalName: player.user.global_name,
              guildNickname: player.nick ?? null,
            })),
          ),
          startDateTime,
          endDateTime,
        });

        const seriesEmbed = await this.createSeriesEmbed({
          guildId,
          channelId: queueMessage.channel_id,
          locale,
          queueData,
          series,
        });

        await discordService.updateDeferredReply(interaction.token, {
          embeds: seriesEmbed.embeds,
          components: seriesEmbed.components,
        });

        await this.cacheDiscordSeriesStats(guildId, queueData.queue, series, locale);

        await this.postSeriesEmbedsToThread(threadChannelId, series, guildConfig, locale);
        await this.postGameStatsOrButton(threadChannelId, series, guildConfig, locale);

        await haloService.updateDiscordAssociations();
      }
    } catch (error) {
      if (error instanceof EndUserError) {
        error.appendData(previousEndUserError?.data ?? {});
      }
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private handleMatchSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const matchId = Preconditions.checkExists(options.get("id") as string, "Missing match id");
    const ephemeral = (options.get("private") as boolean | undefined) ?? false;
    const data: APIInteractionResponseDeferredChannelMessageWithSource["data"] = {};
    if (ephemeral) {
      data.flags = MessageFlags.Ephemeral;
    }

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data,
      },
      jobToComplete: async () => this.matchSubCommandJob(interaction, matchId),
    };
  }

  private async matchSubCommandJob(interaction: APIApplicationCommandInteraction, matchId: string): Promise<void> {
    const { discordService, haloService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;

    try {
      const [guildConfig, matches] = await Promise.all([
        this.services.databaseService.getGuildConfig(Preconditions.checkExists(interaction.guild_id)),
        haloService.getMatchDetails([matchId]),
      ]);
      if (!matches.length) {
        await discordService.updateDeferredReply(interaction.token, { content: "Match not found" });

        return;
      }

      const match = Preconditions.checkExists(matches[0]);
      const players = await haloService.getPlayerXuidsToGametags(match, { presentAtBeginningOnly: true });

      const matchEmbed = this.getMatchEmbed(guildConfig, match, locale);
      const embed = await matchEmbed.getEmbed(match, players);

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [embed],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async retryJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { discordService } = this.services;
    try {
      if (interaction.message.embeds[0] == null) {
        throw new Error("No embed found in the message");
      }

      const [embed] = interaction.message.embeds;
      const endUserError = EndUserError.fromDiscordEmbed(embed);
      if (endUserError == null) {
        throw new Error("No end user error found in the embed");
      }

      await this.services.neatQueueService.handleRetry({
        errorEmbed: endUserError,
        guildId: Preconditions.checkExists(interaction.guild_id),
        interaction,
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async loadGamesJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { env } = this;
    const { databaseService, discordService, haloService } = this.services;

    try {
      const locale = interaction.guild_locale ?? interaction.locale;

      const { channel } = interaction;
      if (channel.type !== ChannelType.PublicThread) {
        throw new Error('Unexpected channel type, expected "PublicThread"');
      }

      const parentId = Preconditions.checkExists(channel.parent_id, '"Missing parent id');
      const loadGamesTried = await env.APP_DATA.get(`loadGames.${parentId}`);
      if (loadGamesTried != null) {
        return;
      }

      const [parentMessage] = await Promise.all([
        discordService.getMessage(parentId, channel.id),
        env.APP_DATA.put(`loadGames.${parentId}`, "true", {
          expirationTtl: 60,
        }),
      ]);

      let statsOverviewEmbeds: APIEmbed[] = [];

      if (parentMessage.author.id === this.env.DISCORD_APP_ID) {
        // this is our series stats queue message - collect all embeds
        statsOverviewEmbeds = parentMessage.embeds;
      } else if (parentMessage.author.id === NEAT_QUEUE_BOT_USER_ID) {
        // stats overview embed has been posted as a thread created from neat queue bot
        const threadMessages = await this.services.discordService.getMessages(channel.id);
        const guiltySparkMessages = threadMessages.filter((message) => {
          const [firstEmbed] = message.embeds;
          if (message.author.id !== this.env.DISCORD_APP_ID || firstEmbed?.type !== EmbedType.Rich) {
            return false;
          }
          return (
            firstEmbed.title?.match(/Series stats for queue #/) != null ||
            firstEmbed.fields?.some((field) => field.name === "Game") === true
          );
        });

        // Collect all embeds from all Guilty Spark series stats messages
        statsOverviewEmbeds = guiltySparkMessages.flatMap((message) => message.embeds);
      } else {
        throw new Error("Unexpected parent message author");
      }

      if (statsOverviewEmbeds.length === 0) {
        throw new Error("No series stats embeds found");
      }

      // Collect all game data from all embeds
      const gamesDataParts: string[] = [];
      for (const embed of statsOverviewEmbeds) {
        const gameFieldValue = embed.fields?.find((field) => field.name === "Game")?.value;
        if (gameFieldValue != null) {
          gamesDataParts.push(gameFieldValue);
        }
      }

      const gamesData = gamesDataParts.join("\n");
      if (gamesData.length === 0) {
        throw new Error("Missing games data");
      }

      const matchIds = Array.from(
        gamesData.matchAll(/https:\/\/halodatahive\.com\/Infinite\/Match\/([a-zA-Z0-9-]+)/g),
        (match) => Preconditions.checkExists(match[1]),
      );

      const [guildConfig, matches] = await Promise.all([
        databaseService.getGuildConfig(Preconditions.checkExists(interaction.guild_id)),
        haloService.getMatchDetails(matchIds),
      ]);
      if (!matches.length) {
        throw new Error("No matches found");
      }

      for (const match of matches) {
        const players = await haloService.getPlayerXuidsToGametags(match, { presentAtBeginningOnly: true });
        const matchEmbed = this.getMatchEmbed(guildConfig, match, locale);
        const embed = await matchEmbed.getEmbed(match, players);

        await discordService.createMessage(channel.id, {
          embeds: [embed],
        });
      }

      // remove the buttons now that all the games are loaded
      await this.services.discordService.deleteMessage(
        channel.id,
        interaction.message.id,
        "Removing load games buttons",
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async postSeriesEmbedsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
  ): Promise<void> {
    const { discordService, haloService } = this.services;

    const seriesTeamsEmbed = new SeriesTeamsEmbed({
      discordService,
      haloService,
      guildConfig,
      locale,
    });
    const seriesTeamsEmbedOutput = await seriesTeamsEmbed.getSeriesEmbed(series);
    await discordService.createMessage(threadId, {
      embeds: [seriesTeamsEmbedOutput],
    });

    const seriesPlayersEmbed = new SeriesPlayersEmbed({ discordService, haloService, guildConfig, locale });
    const seriesPlayers = await haloService.getPlayerXuidsToGametags(series, { presentAtBeginningOnly: true });
    const seriesPlayersEmbedsOutput = await seriesPlayersEmbed.getSeriesEmbed(series, seriesPlayers, locale);
    for (const seriesPlayersEmbedOutput of seriesPlayersEmbedsOutput) {
      await discordService.createMessage(threadId, {
        embeds: [seriesPlayersEmbedOutput],
      });
    }
  }

  private async postGameStatsOrButton(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
  ): Promise<void> {
    const { discordService, haloService } = this.services;

    if (guildConfig.StatsReturn === StatsReturnType.SERIES_ONLY) {
      await discordService.createMessage(threadId, {
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.LoadGames,
                label: "Load game stats",
                style: 1,
                emoji: {
                  name: "🎮",
                },
              },
            ],
          },
        ],
      });
    } else {
      for (const match of series) {
        const players = await haloService.getPlayerXuidsToGametags(match, { presentAtBeginningOnly: true });
        const matchEmbed = this.getMatchEmbed(guildConfig, match, locale);
        const embed = await matchEmbed.getEmbed(match, players);

        await discordService.createMessage(threadId, { embeds: [embed] });
      }
    }
  }

  private async createSeriesEmbed({
    guildId,
    channelId,
    locale,
    queueData,
    series,
  }: {
    guildId: string;
    channelId: string;
    locale: string;
    queueData: Omit<QueueData, "timestamp">;
    series: MatchStats[];
  }): Promise<SeriesOverviewEmbedOutput> {
    const { discordService, haloService } = this.services;
    const seriesOverview = new SeriesOverviewEmbed({ discordService, haloService });
    const seriesEmbed = await seriesOverview.getEmbed({
      guildId,
      channelId,
      messageId: queueData.message.id,
      pagesUrl: this.env.PAGES_URL,
      locale,
      queue: queueData.queue,
      series,
      finalTeams: queueData.teams.map((team) => ({
        name: team.name,
        playerIds: team.players.map(({ user: { id } }) => id),
      })),
      substitutions: [],
      hideTeamsDescription: false,
    });

    return seriesEmbed;
  }

  private getMatchEmbed(
    guildConfig: GuildConfigRow,
    match: MatchStats,
    locale: string,
  ): BaseMatchEmbed<GameVariantCategory> {
    return create({
      discordService: this.services.discordService,
      haloService: this.services.haloService,
      guildConfig,
      gameVariantCategory: match.MatchInfo.GameVariantCategory,
      locale,
    });
  }

  private async cacheDiscordSeriesStats(
    guildId: string,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
  ): Promise<void> {
    const { discordService, haloService, logService } = this.services;

    try {
      const renderData = await buildDiscordSeriesRenderDataFromMatches({
        discordService,
        logService,
        haloService,
        guildId,
        queueNumber,
        matches: series,
        locale,
      });

      await discordService.cacheResolvedDiscordSeriesStats({
        guildId,
        queueNumber,
        matchIds: renderData.matches.map((match) => match.matchId),
        renderData,
      });
    } catch (error) {
      logService.warn(
        error,
        new Map([
          ["guildId", guildId],
          ["queueNumber", queueNumber.toString()],
          ["reason", "Failed to cache discord series stats directly"],
        ]),
      );
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
      const queueData = await discordService.getTeamsFromQueueResult(guildId, channelId, queueNumber);

      await this.fixCommandStartFlow(interaction, channelId, queueData);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async fixSubCommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      if (!this.isThreadChannel(interaction.channel.type)) {
        throw new EndUserError("This command must be run in a thread channel.");
      }

      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const queueNumber = await discordService.findQueueNumberForThread(guildId, interaction.channel.id);

      if (queueNumber == null) {
        throw new EndUserError(
          "Could not determine which queue this thread's stats are for. Try running /stats fix queue_number:<queue> from the parent channel instead.",
        );
      }

      const parentChannelId = "parent_id" in interaction.channel ? interaction.channel.parent_id : undefined;
      const channelId = parentChannelId ?? interaction.channel.id;
      const queueData = await discordService.getTeamsFromQueueResult(guildId, channelId, queueNumber);

      await this.fixCommandStartFlow(interaction, channelId, queueData);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async fixCommandStartFlow(
    interaction: APIApplicationCommandInteraction,
    channelId: string,
    queueData: QueueData,
  ): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

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
      queueData: queueDataWithoutTimestamp,
    });
  }

  private async handleFixPlayerSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const selectedPlayerId = Preconditions.checkExists(interaction.data.values[0], "No player selected");
      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const [association] = await databaseService.getDiscordAssociations([selectedPlayerId]);
      if (association?.XboxId == null || association.XboxId === "") {
        throw new EndUserError("That player does not have a linked Xbox account.");
      }

      const [user] = await haloService.getUsersByXuids([association.XboxId]);
      if (user == null) {
        throw new EndUserError("Could not find a Halo account for that player.");
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const matchHistory = await haloService.getEnrichedMatchHistory(user.gamertag, locale, MatchType.Custom, 25);
      if (matchHistory.matches.length === 0) {
        throw new EndUserError("No recent custom games were found for that player.");
      }

      const preselectedMatchIds = await this.getPreselectedFixMatchIds(metadata, interaction);

      const gameOptions: APISelectMenuOption[] = matchHistory.matches.map<APISelectMenuOption>((match) => {
        const label = this.getFixGameSelectionLabel(match.modeName, match.mapName, match.resultString);
        return {
          label: label.slice(0, 100),
          value: match.matchId,
          description: this.getFixGameSelectionDescription(match.endTime, match.endTimeIso).slice(0, 100),
          default: preselectedMatchIds.has(match.matchId),
        };
      });

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

  private getFixGameSelectionLabel(modeName: string, mapName: string, result: string): string {
    return `${modeName} ${mapName} - ${result}`;
  }

  private getFixGameSelectionDescription(endTime: string, endTimeIso: string): string {
    if (endTimeIso === "") {
      return `Ended at ${endTime}`;
    }

    const endDate = new Date(endTimeIso);
    if (Number.isNaN(endDate.getTime())) {
      return `Ended at ${endTime}`;
    }

    const absoluteUtc = `${endDate.toISOString().replace("T", " ").slice(0, 16)} UTC`;
    if (endDate.getTime() > Date.now()) {
      return `Ended at ${absoluteUtc}`;
    }

    const relative = formatDistanceToNowStrict(endDate, { addSuffix: true });
    return `Ended ${relative} (${absoluteUtc})`;
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

      if (existingLocation?.parentOverviewMessageId != null) {
        const overviewMessage = await discordService.getMessage(
          metadata.channelId,
          existingLocation.parentOverviewMessageId,
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
    const derivedResultLabel = this.getFixSeriesOutcomeLabel(derivedSeriesOutcome, metadata.queueData);
    const selectedResultLabel = this.getFixSeriesOutcomeLabel(selectedSeriesOutcome, metadata.queueData);

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
              options: this.getFixSeriesOutcomeOptions(metadata.queueData, selectedSeriesOutcome),
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

  private deriveFixSeriesOutcome(series: MatchStats[]): FixSeriesOutcome {
    const entries = series.map((match) => ({
      startTime: match.MatchInfo.StartTime,
      mapAssetId: match.MatchInfo.MapVariant.AssetId,
      mapVersionId: match.MatchInfo.MapVariant.VersionId,
      gameVariantCategory: match.MatchInfo.GameVariantCategory,
      teamOutcomes: match.Teams.map((team) => team.Outcome),
    }));
    const winsByTeam = computeSeriesTeamWins(entries);
    const team0Wins = winsByTeam[0] ?? 0;
    const team1Wins = winsByTeam[1] ?? 0;

    if (team0Wins === team1Wins) {
      return "TIE";
    }

    return team0Wins > team1Wins ? "TEAM_0" : "TEAM_1";
  }

  private parseFixSeriesOutcome(value: string): FixSeriesOutcome {
    switch (value) {
      case "TEAM_0":
      case "TEAM_1":
      case "TIE": {
        return value;
      }
      default: {
        throw new EndUserError("Invalid series outcome selection. Please run /stats fix again.");
      }
    }
  }

  private getFixSeriesOutcomeOptions(
    queueData: Omit<QueueData, "timestamp">,
    selectedSeriesOutcome: FixSeriesOutcome,
  ): APISelectMenuOption[] {
    const firstTeamName = this.getFixSeriesOutcomeTeamName(queueData, 0);
    const secondTeamName = this.getFixSeriesOutcomeTeamName(queueData, 1);

    return [
      {
        label: `${firstTeamName} wins`.slice(0, 100),
        value: "TEAM_0",
        default: selectedSeriesOutcome === "TEAM_0",
      },
      {
        label: `${secondTeamName} wins`.slice(0, 100),
        value: "TEAM_1",
        default: selectedSeriesOutcome === "TEAM_1",
      },
      {
        label: "Tie",
        value: "TIE",
        default: selectedSeriesOutcome === "TIE",
      },
    ];
  }

  private getFixSeriesOutcomeLabel(seriesOutcome: FixSeriesOutcome, queueData: Omit<QueueData, "timestamp">): string {
    switch (seriesOutcome) {
      case "TEAM_0": {
        return `${this.getFixSeriesOutcomeTeamName(queueData, 0)} wins`;
      }
      case "TEAM_1": {
        return `${this.getFixSeriesOutcomeTeamName(queueData, 1)} wins`;
      }
      case "TIE": {
        return "Tie";
      }
      default: {
        throw new UnreachableError(seriesOutcome);
      }
    }
  }

  private getFixSeriesOutcomeTeamName(queueData: Omit<QueueData, "timestamp">, teamIndex: 0 | 1): string {
    const teamName = Preconditions.checkExists(queueData.teams[teamIndex], "Expected queue team").name;
    return teamName.replaceAll(/[*_~`|]/g, "");
  }

  private async handleFixConfirmationJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService, leaderboardService, logService } = this.services;

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
      amendedOverviewEmbed.fields.push(amendedField);

      const existingLocation = await discordService.findExistingSeriesStatsThreadLocation(
        metadata.guildId,
        metadata.queueData.queue,
      );

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

        if (existingLocation.parentOverviewMessageId != null) {
          await discordService.editMessage(metadata.channelId, existingLocation.parentOverviewMessageId, {
            embeds: amendedSeriesEmbed.embeds,
            components: amendedSeriesEmbed.components,
          });
          destinationThreadId = existingLocation.threadId;
        } else {
          destinationThreadId = existingLocation.threadId;
          shouldPostOverviewInThread = true;
        }
      } else {
        const seriesOverviewMessage = await discordService.createMessage(metadata.channelId, {
          embeds: amendedSeriesEmbed.embeds,
          components: amendedSeriesEmbed.components,
        });
        const createdThread = await discordService.startThreadFromMessage(
          metadata.channelId,
          seriesOverviewMessage.id,
          `Queue #${metadata.queueData.queue.toString()} series stats (${haloService.getSeriesScore(series, locale, true)})`,
        );
        destinationThreadId = createdThread.id;
      }

      if (shouldPostOverviewInThread) {
        await discordService.createMessage(destinationThreadId, {
          embeds: amendedSeriesEmbed.embeds,
          components: amendedSeriesEmbed.components,
        });
      }
      await this.postSeriesEmbedsToThread(destinationThreadId, series, guildConfig, locale);
      await this.postGameStatsOrButton(destinationThreadId, series, guildConfig, locale);
      await this.cacheDiscordSeriesStats(metadata.guildId, metadata.queueData.queue, series, locale);
      try {
        const neatQueueConfig = await databaseService.getNeatQueueConfig(metadata.guildId, metadata.channelId);
        await leaderboardService.persistReconciledSeriesData({
          guildId: metadata.guildId,
          channelId: metadata.channelId,
          queueNumber: metadata.queueData.queue,
          neatQueueConfig,
          series,
          winnerTeamIndex:
            metadata.selectedSeriesOutcome === "TEAM_0" ? 0 : metadata.selectedSeriesOutcome === "TEAM_1" ? 1 : -1,
          locale,
        });
      } catch (error) {
        logService.warn(
          error,
          new Map([
            ["context", "Stats fix leaderboard reconciliation failed"],
            ["guildId", metadata.guildId],
            ["channelId", metadata.channelId],
            ["queue", metadata.queueData.queue.toString()],
          ]),
        );
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

  private createStatusEmbed(description: string): APIEmbed {
    return {
      color: EmbedColors.NEUTRAL,
      description,
    };
  }

  private isThreadChannel(channelType: ChannelType): boolean {
    return (
      channelType === ChannelType.PublicThread ||
      channelType === ChannelType.PrivateThread ||
      channelType === ChannelType.AnnouncementThread
    );
  }

  private async setFixMetadata(messageId: string, metadata: FixFlowMetadata): Promise<void> {
    await this.services.discordService.setInteractionMetadata(this.fixMetadataKey(messageId), metadata);
  }

  private async getFixMetadata(messageId: string): Promise<FixFlowMetadata | null> {
    const metadata = await this.services.discordService.getInteractionMetadata<FixFlowMetadata>(
      this.fixMetadataKey(messageId),
    );

    return metadata;
  }

  private async getFixMetadataWithRetry(messageId: string): Promise<FixFlowMetadata | null> {
    for (let attempt = 0; attempt <= FIX_METADATA_MAX_RETRIES; attempt += 1) {
      const metadata = await this.getFixMetadata(messageId);
      if (metadata != null) {
        return metadata;
      }

      if (attempt === FIX_METADATA_MAX_RETRIES) {
        break;
      }

      const delayMilliseconds = FIX_METADATA_RETRY_BASE_DELAY_MS * (attempt + 1);
      await this.wait(delayMilliseconds);
    }

    return null;
  }

  private async wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  private fixMetadataKey(messageId: string): string {
    return `statsFix:${messageId}`;
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
