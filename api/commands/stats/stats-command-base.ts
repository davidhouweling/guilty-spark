import type {
  APIApplicationCommandInteractionDataBasicOption,
  APIEmbed,
  APIMessageComponentSelectMenuInteraction,
  APIMessageTopLevelComponent,
} from "discord-api-types/v10";
import { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { BaseCommand } from "../base/base-command";
import { EndUserError } from "../../base/end-user-error";
import type { PlayerStatsQueueOption } from "../../embeds/stats/player-stats-embed";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";

const DISCORD_SELECT_OPTION_LABEL_LIMIT = 100;
const PLAYER_WINDOW_VALUES = new Set<string>(Object.values(LeaderboardWindow));
const PLAYER_STATS_VISIBILITY_VALUES = new Set(["public", "private"]);

function isLeaderboardWindow(value: string): value is LeaderboardWindow {
  return PLAYER_WINDOW_VALUES.has(value);
}

export abstract class StatsCommandBase extends BaseCommand {
  protected isPlayerStatsPrivate(
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): boolean {
    const visibility = options.get("visible");
    if (visibility == null) {
      return true;
    }
    if (typeof visibility !== "string" || !PLAYER_STATS_VISIBILITY_VALUES.has(visibility)) {
      throw new EndUserError("The selected player stats visibility is invalid.");
    }

    return visibility === "private";
  }

  protected parsePlayerWindow(value: string): LeaderboardWindow {
    if (isLeaderboardWindow(value)) {
      return value;
    }

    throw new EndUserError("The selected leaderboard window is invalid.");
  }

  protected isPlayerStatsCommandInvoker(interaction: APIMessageComponentSelectMenuInteraction): boolean {
    // Discord's deprecated `interaction` field is still populated on older messages where
    // `interaction_metadata` may be absent, so fall back to it to avoid locking the invoker out.
    const commandInvokerId =
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      interaction.message.interaction_metadata?.user.id ?? interaction.message.interaction?.user.id;
    if (commandInvokerId == null) {
      return false;
    }

    return this.services.discordService.getDiscordUserId(interaction) === commandInvokerId;
  }

  /**
   * Progress feedback is best-effort: a failure here must not stop the real update from landing.
   */
  protected async showLoadingState(
    interaction: APIMessageComponentSelectMenuInteraction,
    loadingResponse: { embeds: APIEmbed[]; components: APIMessageTopLevelComponent[] },
  ): Promise<void> {
    try {
      await this.services.discordService.updateDeferredReply(interaction.token, loadingResponse);
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["customId", interaction.data.custom_id],
          ["reason", "Failed to render stats loading state"],
        ]),
      );
    }
  }

  /**
   * One guild-channels request covers every configured queue, so the selector avoids a per-queue
   * channel fetch. Unresolved channels keep the raw-id label rather than failing the response.
   */
  protected async getQueueChannelNames(
    guildId: string,
    configuredQueues: readonly NeatQueueConfigRow[],
  ): Promise<Map<string, string>> {
    const queueChannelNames = new Map<string, string>();
    if (configuredQueues.length === 0) {
      return queueChannelNames;
    }

    try {
      const channels = await this.services.discordService.getGuildChannels(guildId);
      const namesByChannelId = new Map(channels.map((channel) => [channel.id, channel.name]));

      for (const queue of configuredQueues) {
        const name = namesByChannelId.get(queue.ChannelId);
        if (name != null && name !== "") {
          queueChannelNames.set(queue.ChannelId, `#${name}`.slice(0, DISCORD_SELECT_OPTION_LABEL_LIMIT));
        }
      }
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["guildId", guildId],
          ["reason", "Failed to resolve queue channel names"],
        ]),
      );
    }

    return queueChannelNames;
  }

  protected getQueueOptionLabel(queueChannelId: string, queueChannelNames: ReadonlyMap<string, string>): string {
    return queueChannelNames.get(queueChannelId) ?? `Queue ${queueChannelId}`;
  }

  protected getPlayerStatsQueueLabel(
    queueChannelId: string | null,
    queueOptions: readonly PlayerStatsQueueOption[],
  ): string {
    if (queueChannelId == null) {
      return "all configured queues";
    }

    const queueOption = queueOptions.find((option) => option.value === queueChannelId);
    return queueOption?.label ?? `<#${queueChannelId}>`;
  }
}
