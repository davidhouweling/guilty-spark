import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIMessageComponentSelectMenuInteraction,
  APIUserApplicationCommandGuildInteraction,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { LeaderboardMetric } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardMetricAggregation, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import {
  PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_COMPARE_HEAD_TO_HEAD_VALUE,
  PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
  PLAYER_COMPARE_TEMPORARY_ERROR_FOOTER,
  PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID,
  createPlayerCompareEmbeds,
  createPlayerCompareHeadToHeadEmbeds,
  createPlayerCompareLoadingResponse,
  createPlayerCompareNoQualifyingGamesResponse,
  getPlayerCompareControlIdBase,
  getPlayerCompareStateFromMessage,
  parsePlayerCompareAggregation,
} from "../../embeds/stats/player-compare-embed";
import type { PlayerCompareViewState } from "../../embeds/stats/player-compare-embed";
import { ALL_QUEUES_VALUE, getPlayerStatsMetricsForAggregation } from "../../embeds/stats/player-stats-embed";
import type { PlayerStatsQueueOption } from "../../embeds/stats/player-stats-embed";
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

export class StatsCompareHandler {
  constructor(private readonly context: StatsHandlerContext) {}

  private get services(): StatsHandlerContext["services"] {
    return this.context.services;
  }

  public handleSubcommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const data: APIInteractionResponseDeferredChannelMessageWithSource["data"] = isPlayerStatsPrivate(options)
      ? { flags: MessageFlags.Ephemeral }
      : {};
    const player1Id = options.get("player1");
    const player2Id = options.get("player2");

    return {
      response: { type: InteractionResponseType.DeferredChannelMessageWithSource, data },
      jobToComplete: async () =>
        this.compareSubCommandJob(interaction, {
          player1Id: typeof player1Id === "string" ? player1Id : undefined,
          player2Id: typeof player2Id === "string" ? player2Id : undefined,
        }),
    };
  }

  public handleUserCommand(interaction: APIUserApplicationCommandGuildInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral },
      },
      jobToComplete: async () =>
        this.compareSubCommandJob(interaction, {
          player1Id: this.services.discordService.getDiscordUserId(interaction),
          player2Id: interaction.data.target_id,
        }),
    };
  }

  private async compareSubCommandJob(
    interaction: APIApplicationCommandInteraction | APIUserApplicationCommandGuildInteraction,
    { player1Id, player2Id }: { player1Id: string | undefined; player2Id: string | undefined },
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
      if (player1Id == null || player2Id == null) {
        throw new EndUserError("Both players must be selected.");
      }

      if (player1Id === player2Id) {
        throw new EndUserError("Player 1 and Player 2 must be different players.");
      }

      const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: guildId });
      if (configuredQueues.length === 0) {
        throw new EndUserError(
          "This server has no configured NeatQueue channels. Set one up before using this command.",
        );
      }

      const associations = await this.services.databaseService.getDiscordAssociations([player1Id, player2Id]);
      const association1 = associations.find((association) => association.DiscordId === player1Id);
      const association2 = associations.find((association) => association.DiscordId === player2Id);
      if (association1 == null || association2 == null) {
        throw new EndUserError("Both Discord users must be linked to a Halo account.");
      }

      const response = await this.createPlayerCompareResponse({
        guildId,
        xboxXuid1: association1.XboxId,
        xboxXuid2: association2.XboxId,
        queueChannelId: null,
        configuredQueues,
        aggregation: null,
        headToHead: false,
        window: undefined,
        locale: interaction.guild_locale ?? interaction.locale,
      });

      if (response == null) {
        throw new EndUserError("No games played by one or both players in the selected window and queue scope.");
      }

      await this.services.discordService.updateDeferredReply(interaction.token, response);
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
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

    switch (getPlayerCompareControlIdBase(interaction.data.custom_id)) {
      case PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID: {
        return this.handleQueueSelect(interaction);
      }
      case PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID: {
        return this.handleAggregationSelect(interaction);
      }
      case PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID: {
        return this.handleWindowSelect(interaction);
      }
      default: {
        throw new Error(`Unexpected compare stats control: ${interaction.data.custom_id}`);
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
    return this.createSelectResponse(interaction, (state): PlayerCompareViewState => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A stats type must be selected.");
      }

      if (selectedValue === PLAYER_COMPARE_HEAD_TO_HEAD_VALUE) {
        return { ...state, aggregation: null, headToHead: true };
      }

      const aggregation = parsePlayerCompareAggregation(selectedValue);
      if (aggregation == null) {
        throw new EndUserError("The selected stats type is invalid.");
      }

      return { ...state, aggregation, headToHead: false };
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
    stateUpdater: (state: PlayerCompareViewState) => PlayerCompareViewState,
  ): ExecuteResponse {
    const pendingState = this.tryResolvePendingState(interaction, stateUpdater);

    if (pendingState == null) {
      return {
        response: { type: InteractionResponseType.DeferredMessageUpdate },
        jobToComplete: async (): Promise<void> => {
          await this.executeStateInteraction(interaction, () => {
            const currentState = getPlayerCompareStateFromMessage(interaction.message);
            if (currentState == null) {
              throw new EndUserError("This stats view has expired. Run /stats compare again.");
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
          createPlayerCompareLoadingResponse(
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
    stateUpdater: (state: PlayerCompareViewState) => PlayerCompareViewState,
  ): PlayerCompareViewState | null {
    try {
      const currentState = getPlayerCompareStateFromMessage(interaction.message);
      return currentState == null ? null : stateUpdater(currentState);
    } catch {
      return null;
    }
  }

  private async executeStateInteraction(
    interaction: APIMessageComponentSelectMenuInteraction,
    resolveState: () => PlayerCompareViewState,
  ): Promise<void> {
    try {
      const state = resolveState();
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: guildId });
      const response = await this.createPlayerCompareResponse({
        guildId,
        xboxXuid1: state.xboxXuid1,
        xboxXuid2: state.xboxXuid2,
        queueChannelId: state.queueChannelId,
        configuredQueues,
        aggregation: state.aggregation,
        headToHead: state.headToHead,
        window: state.window,
        locale: interaction.guild_locale ?? interaction.locale,
      });

      if (response == null) {
        await this.services.discordService.updateDeferredReply(
          interaction.token,
          createPlayerCompareNoQualifyingGamesResponse(interaction.message, state),
        );
        return;
      }

      await this.services.discordService.updateDeferredReply(interaction.token, response);
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error, {
        preserveMessage: interaction.message,
        errorEmbedFooter: PLAYER_COMPARE_TEMPORARY_ERROR_FOOTER,
      });
    }
  }

  private async createPlayerCompareResponse({
    guildId,
    xboxXuid1,
    xboxXuid2,
    queueChannelId,
    configuredQueues,
    aggregation,
    headToHead,
    window,
    locale,
  }: {
    guildId: string;
    xboxXuid1: string;
    xboxXuid2: string;
    queueChannelId: string | null;
    configuredQueues: NeatQueueConfigRow[];
    aggregation: LeaderboardMetricAggregation | null;
    headToHead: boolean;
    window: LeaderboardWindow | undefined;
    locale: string;
  }): Promise<
    ReturnType<typeof createPlayerCompareEmbeds> | ReturnType<typeof createPlayerCompareHeadToHeadEmbeds> | null
  > {
    const configuredQueueChannelIds = configuredQueues.map((queue) => queue.ChannelId);
    const queueChannelIdsOpt = queueChannelId == null ? { queueChannelIds: configuredQueueChannelIds } : {};
    const result1 = await this.services.leaderboardService.getLeaderboardPlayerStats({
      guildId,
      xboxXuid: xboxXuid1,
      queueChannelId,
      ...queueChannelIdsOpt,
      ...(window == null ? {} : { window }),
    });
    if (result1 == null) {
      return null;
    }

    const result2 = await this.services.leaderboardService.getLeaderboardPlayerStats({
      guildId,
      xboxXuid: xboxXuid2,
      queueChannelId,
      ...queueChannelIdsOpt,
      window: result1.window,
    });
    if (result2 == null) {
      return null;
    }

    const queueOptions = await this.getQueueOptions(guildId, configuredQueues);
    const queueLabel = getPlayerStatsQueueLabel(queueChannelId, queueOptions);

    if (headToHead) {
      const pair = await this.services.leaderboardService.getLeaderboardPlayerPairRelationship({
        guildId,
        xboxXuid1: result1.stats.XboxXuid,
        xboxXuid2: result2.stats.XboxXuid,
        queueChannelId,
        ...queueChannelIdsOpt,
        startEpochSeconds: result1.startEpochSeconds,
      });

      return createPlayerCompareHeadToHeadEmbeds({
        pair,
        stats1: result1.stats,
        stats2: result2.stats,
        state: {
          xboxXuid1: result1.stats.XboxXuid,
          xboxXuid2: result2.stats.XboxXuid,
          queueChannelId,
          window: result1.window,
          aggregation: null,
          headToHead: true,
        },
        queueLabel,
        queueOptions,
        resetAt: result1.resetAt,
        locale,
      });
    }

    const selectedAggregation = aggregation ?? result1.defaultAggregation;
    const metrics = getPlayerStatsMetricsForAggregation(selectedAggregation);
    const rankMetrics = metrics.includes(LeaderboardMetric.GamesPlayed)
      ? metrics
      : [LeaderboardMetric.GamesPlayed, ...metrics];
    const [ranks1, ranks2] = await Promise.all([
      this.services.leaderboardService.getLeaderboardPlayerMetricRanks({
        guildId,
        xboxXuid: xboxXuid1,
        queueChannelId,
        ...queueChannelIdsOpt,
        startEpochSeconds: result1.startEpochSeconds,
        minGamesPlayed: result1.minGamesPlayed,
        metrics: rankMetrics,
      }),
      this.services.leaderboardService.getLeaderboardPlayerMetricRanks({
        guildId,
        xboxXuid: xboxXuid2,
        queueChannelId,
        ...queueChannelIdsOpt,
        startEpochSeconds: result1.startEpochSeconds,
        minGamesPlayed: result1.minGamesPlayed,
        metrics: rankMetrics,
      }),
    ]);

    return createPlayerCompareEmbeds({
      stats1: result1.stats,
      stats2: result2.stats,
      ranks1,
      ranks2,
      state: {
        xboxXuid1: result1.stats.XboxXuid,
        xboxXuid2: result2.stats.XboxXuid,
        queueChannelId,
        window: result1.window,
        aggregation: selectedAggregation,
        headToHead: false,
      },
      locale,
      queueLabel,
      queueOptions,
      resetAt: result1.resetAt,
    });
  }

  private async getQueueOptions(
    guildId: string,
    configuredQueues: readonly NeatQueueConfigRow[],
  ): Promise<PlayerStatsQueueOption[]> {
    const queueChannelNames = await getQueueChannelNames(this.context, guildId, configuredQueues);
    const queueOptions = configuredQueues.map((queue) => ({
      label: getQueueOptionLabel(queue.ChannelId, queueChannelNames),
      value: queue.ChannelId,
    }));
    return queueOptions.length <= 1 ? queueOptions : [{ label: "All configured queues", value: null }, ...queueOptions];
  }
}
