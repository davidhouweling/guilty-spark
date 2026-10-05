import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIUserApplicationCommandGuildInteraction,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { EndUserError } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import { StatsCompareResponseCommand } from "./stats-compare-response-command";

export abstract class StatsPlayerCommand extends StatsCompareResponseCommand {
  protected handlePlayerSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const data: APIInteractionResponseDeferredChannelMessageWithSource["data"] = this.isPlayerStatsPrivate(options)
      ? { flags: MessageFlags.Ephemeral }
      : {};

    return {
      response: { type: InteractionResponseType.DeferredChannelMessageWithSource, data },
      jobToComplete: async () => this.playerStatsSubCommandJob(interaction, options),
    };
  }

  protected handlePlayerStatsUserCommand(interaction: APIUserApplicationCommandGuildInteraction): ExecuteResponse {
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
}
