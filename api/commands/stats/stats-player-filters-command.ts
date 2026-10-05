import type { APIMessageComponentSelectMenuInteraction } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { LeaderboardMetricAggregation } from "@guilty-spark/shared/halo/leaderboard";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import {
  ALL_QUEUES_VALUE,
  PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
  PLAYER_STATS_TEMPORARY_ERROR_FOOTER,
  PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
  createPlayerStatsLoadingResponse,
  createPlayerStatsNoQualifyingGamesResponse,
  getPlayerStatsStateFromMessage,
  parsePlayerStatsRelationshipMetric,
} from "../../embeds/stats/player-stats-embed";
import type { PlayerStatsViewState } from "../../embeds/stats/player-stats-embed";
import type { ExecuteResponse } from "../base/base-command";
import { StatsPlayerCommand } from "./stats-player-command";

const PLAYER_AGGREGATION_VALUES = new Map<string, LeaderboardMetricAggregation>(
  Object.values(LeaderboardMetricAggregation).map((aggregation) => [aggregation, aggregation]),
);

function parsePlayerStatsAggregation(value: string): LeaderboardMetricAggregation | null {
  return PLAYER_AGGREGATION_VALUES.get(value) ?? null;
}

export abstract class StatsPlayerFiltersCommand extends StatsPlayerCommand {
  protected handlePlayerStatsSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
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

  private handlePlayerStatsQueueSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createPlayerStatsSelectResponse(interaction, (state) => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A queue must be selected.");
      }

      return { ...state, queueChannelId: selectedValue === ALL_QUEUES_VALUE ? null : selectedValue };
    });
  }

  private handlePlayerStatsAggregationSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createPlayerStatsSelectResponse(interaction, (state) => {
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

  private handlePlayerStatsWindowSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createPlayerStatsSelectResponse(interaction, (state) => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A window must be selected.");
      }

      return { ...state, window: this.parsePlayerWindow(selectedValue) };
    });
  }

  private createPlayerStatsSelectResponse(
    interaction: APIMessageComponentSelectMenuInteraction,
    stateUpdater: (state: PlayerStatsViewState) => PlayerStatsViewState,
  ): ExecuteResponse {
    const pendingState = this.tryResolvePlayerStatsPendingState(interaction, stateUpdater);

    if (pendingState == null) {
      return {
        response: { type: InteractionResponseType.DeferredMessageUpdate },
        jobToComplete: async (): Promise<void> => {
          await this.executePlayerStatsStateInteraction(interaction, () => {
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
        await this.showLoadingState(
          interaction,
          createPlayerStatsLoadingResponse(
            interaction.message,
            resolvedState,
            this.services.discordService.getLoadingEmoji(),
          ),
        );
        await this.executePlayerStatsStateInteraction(interaction, () => resolvedState);
      },
    };
  }

  private tryResolvePlayerStatsPendingState(
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

  private async executePlayerStatsStateInteraction(
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
}
