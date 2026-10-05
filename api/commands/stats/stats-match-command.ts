import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponseDeferredChannelMessageWithSource,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v10";
import type { GameVariantCategory, MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { ExecuteResponse } from "../base/base-command";
import type { BaseMatchEmbed } from "../../embeds/stats/base-match-embed";
import { create } from "../../embeds/stats/create";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import { StatsCommandBase } from "./stats-command-base";

export abstract class StatsMatchCommand extends StatsCommandBase {
  protected handleMatchSubCommand(
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

  protected getMatchEmbed(
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
}
