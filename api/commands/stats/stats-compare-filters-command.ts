import type { APIMessageComponentSelectMenuInteraction } from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import { ALL_QUEUES_VALUE } from "../../embeds/stats/player-stats-embed";
import {
  PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_COMPARE_HEAD_TO_HEAD_VALUE,
  PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
  PLAYER_COMPARE_TEMPORARY_ERROR_FOOTER,
  PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID,
  createPlayerCompareLoadingResponse,
  createPlayerCompareNoQualifyingGamesResponse,
  getPlayerCompareControlIdBase,
  getPlayerCompareStateFromMessage,
  parsePlayerCompareAggregation,
} from "../../embeds/stats/player-compare-embed";
import type { PlayerCompareViewState } from "../../embeds/stats/player-compare-embed";
import type { ExecuteResponse } from "../base/base-command";
import { StatsCompareEntryCommand } from "./stats-compare-entry-command";

export abstract class StatsCompareFiltersCommand extends StatsCompareEntryCommand {
  protected handleCompareSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
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

    switch (getPlayerCompareControlIdBase(interaction.data.custom_id)) {
      case PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID: {
        return this.handleCompareQueueSelect(interaction);
      }
      case PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID: {
        return this.handleCompareAggregationSelect(interaction);
      }
      case PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID: {
        return this.handleCompareWindowSelect(interaction);
      }
      default: {
        throw new Error(`Unexpected compare stats control: ${interaction.data.custom_id}`);
      }
    }
  }

  private handleCompareQueueSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createCompareSelectResponse(interaction, (state) => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A queue must be selected.");
      }

      return { ...state, queueChannelId: selectedValue === ALL_QUEUES_VALUE ? null : selectedValue };
    });
  }

  private handleCompareAggregationSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createCompareSelectResponse(interaction, (state): PlayerCompareViewState => {
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

  private handleCompareWindowSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createCompareSelectResponse(interaction, (state) => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A window must be selected.");
      }

      return { ...state, window: this.parsePlayerWindow(selectedValue) };
    });
  }

  private createCompareSelectResponse(
    interaction: APIMessageComponentSelectMenuInteraction,
    stateUpdater: (state: PlayerCompareViewState) => PlayerCompareViewState,
  ): ExecuteResponse {
    const pendingState = this.tryResolveComparePendingState(interaction, stateUpdater);

    if (pendingState == null) {
      return {
        response: { type: InteractionResponseType.DeferredMessageUpdate },
        jobToComplete: async (): Promise<void> => {
          await this.executeCompareStateInteraction(interaction, () => {
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
        await this.showLoadingState(
          interaction,
          createPlayerCompareLoadingResponse(
            interaction.message,
            resolvedState,
            this.services.discordService.getLoadingEmoji(),
          ),
        );
        await this.executeCompareStateInteraction(interaction, () => resolvedState);
      },
    };
  }

  private tryResolveComparePendingState(
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

  private async executeCompareStateInteraction(
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
}
