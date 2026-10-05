import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIMessageComponentSelectMenuInteraction,
  APIUserApplicationCommandGuildInteraction,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { LeaderboardMetric, LeaderboardMetricAggregation } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardPlayerRelationshipMetric } from "@guilty-spark/shared/halo/leaderboard-formatting";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import {
  ALL_QUEUES_VALUE,
  PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
  PLAYER_STATS_TEMPORARY_ERROR_FOOTER,
  PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
  createPlayerStatsEmbeds,
  createPlayerStatsLoadingResponse,
  createPlayerStatsNoQualifyingGamesResponse,
  createPlayerStatsRelationshipEmbeds,
  getPlayerStatsMetricsForAggregation,
  getPlayerStatsStateFromMessage,
  parsePlayerStatsRelationshipMetric,
} from "../../embeds/stats/player-stats-embed";
import type { PlayerStatsQueueOption, PlayerStatsViewState } from "../../embeds/stats/player-stats-embed";
import type { StatsHandlerContext } from "./stats-handler-context";
import {
  getPlayerStatsQueueLabel,
  getQueueChannelNames,
  getQueueOptionLabel,
  isPlayerStatsCommandInvoker,
  isPlayerStatsPrivate,
  parsePlayerWindow,
  showLoadingState,
} from "./stats-command-helpers";

const PLAYER_AGGREGATION_VALUES = new Map<string, LeaderboardMetricAggregation>(
  Object.values(LeaderboardMetricAggregation).map((aggregation) => [aggregation, aggregation]),
);

function parsePlayerStatsAggregation(value: string): LeaderboardMetricAggregation | null {
  return PLAYER_AGGREGATION_VALUES.get(value) ?? null;
}

export class StatsPlayerHandler {
  constructor(private readonly context: StatsHandlerContext) {}

  private get services(): StatsHandlerContext["services"] {
    return this.context.services;
  }

  private get env(): StatsHandlerContext["env"] {
    return this.context.env;
  }

  public handleSubcommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const data: APIInteractionResponseDeferredChannelMessageWithSource["data"] = isPlayerStatsPrivate(options)
      ? { flags: MessageFlags.Ephemeral }
      : {};

    return {
      response: { type: InteractionResponseType.DeferredChannelMessageWithSource, data },
      jobToComplete: async () => this.playerStatsSubCommandJob(interaction, options),
    };
  }

  public handleUserCommand(interaction: APIUserApplicationCommandGuildInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral },
      },
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
      const window = typeof requestedWindow === "string" ? parsePlayerWindow(requestedWindow) : undefined;
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

  public handleSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    if (!isPlayerStatsCommandInvoker(this.context, interaction)) {
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
        return this.handleQueueSelect(interaction);
      }
      case PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID: {
        return this.handleAggregationSelect(interaction);
      }
      case PLAYER_STATS_WINDOW_SELECT_CONTROL_ID: {
        return this.handleWindowSelect(interaction);
      }
      default: {
        throw new Error(`Unexpected player stats control: ${interaction.data.custom_id}`);
      }
    }
  }

  private handleQueueSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createSelectResponse(interaction, (state) => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A queue must be selected.");
      }

      return { ...state, queueChannelId: selectedValue === ALL_QUEUES_VALUE ? null : selectedValue };
    });
  }

  private handleAggregationSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createSelectResponse(interaction, (state) => {
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
  }

  private handleWindowSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createSelectResponse(interaction, (state) => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A window must be selected.");
      }

      return { ...state, window: parsePlayerWindow(selectedValue) };
    });
  }

  private createSelectResponse(
    interaction: APIMessageComponentSelectMenuInteraction,
    stateUpdater: (state: PlayerStatsViewState) => PlayerStatsViewState,
  ): ExecuteResponse {
    const pendingState = this.tryResolvePendingState(interaction, stateUpdater);

    if (pendingState == null) {
      return {
        response: { type: InteractionResponseType.DeferredMessageUpdate },
        jobToComplete: async (): Promise<void> => {
          await this.executeStateInteraction(interaction, () => {
            const currentState = getPlayerStatsStateFromMessage(interaction.message);
            if (currentState == null) {
              throw new EndUserError("This stats view has expired. Run /stats player again.");
            }

            return stateUpdater(currentState);
          });
        },
      };
    }

    const resolvedState = pendingState;
    return {
      response: { type: InteractionResponseType.DeferredMessageUpdate },
      jobToComplete: async (): Promise<void> => {
        await showLoadingState(
          this.context,
          interaction,
          createPlayerStatsLoadingResponse(
            interaction.message,
            resolvedState,
            this.services.discordService.getLoadingEmoji(),
          ),
        );
        await this.executeStateInteraction(interaction, () => resolvedState);
      },
    };
  }

  private tryResolvePendingState(
    interaction: APIMessageComponentSelectMenuInteraction,
    stateUpdater: (state: PlayerStatsViewState) => PlayerStatsViewState,
  ): PlayerStatsViewState | null {
    try {
      const currentState = getPlayerStatsStateFromMessage(interaction.message);
      return currentState == null ? null : stateUpdater(currentState);
    } catch {
      return null;
    }
  }

  private async executeStateInteraction(
    interaction: APIMessageComponentSelectMenuInteraction,
    resolveState: () => PlayerStatsViewState,
  ): Promise<void> {
    try {
      const state = resolveState();
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: guildId });
      const xboxXuid = await this.services.leaderboardService.resolveXboxXuidForGamertag(state.gamertag, guildId);
      const response = await this.createPlayerStatsResponse({
        guildId,
        xboxXuid,
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
          gamertag: relationshipResult.stats.Gamertag,
          queueChannelId,
          window: relationshipResult.window,
        },
        locale,
        guildId,
        queueLabel: getPlayerStatsQueueLabel(queueChannelId, queueOptions),
        queueOptions,
        resetAt: relationshipResult.resetAt,
        pagesUrl: this.env.PAGES_URL,
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
        gamertag: result.stats.Gamertag,
        queueChannelId,
        window: result.window,
      },
      locale,
      guildId,
      queueLabel: getPlayerStatsQueueLabel(queueChannelId, queueOptions),
      queueOptions,
      resetAt: result.resetAt,
      minGamesPlayed: result.minGamesPlayed,
      pagesUrl: this.env.PAGES_URL,
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
    const queueChannelNames = await getQueueChannelNames(this.context, guildId, configuredQueues);

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
          playedQueues.push({
            label: getQueueOptionLabel(queue.ChannelId, queueChannelNames),
            value: queue.ChannelId,
          });
        }
      }
    }

    if (playedQueues.length <= 1) {
      return playedQueues;
    }

    return [{ label: "All configured queues", value: null }, ...playedQueues.slice(0, maxPlayedQueueOptions)];
  }
}
