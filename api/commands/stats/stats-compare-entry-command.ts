import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIUserApplicationCommandGuildInteraction,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import { EndUserError } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import { StatsPlayerFiltersCommand } from "./stats-player-filters-command";

export abstract class StatsCompareEntryCommand extends StatsPlayerFiltersCommand {
  protected handleCompareSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const data: APIInteractionResponseDeferredChannelMessageWithSource["data"] = this.isPlayerStatsPrivate(options)
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

  protected handleCompareStatsUserCommand(interaction: APIUserApplicationCommandGuildInteraction): ExecuteResponse {
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
}
