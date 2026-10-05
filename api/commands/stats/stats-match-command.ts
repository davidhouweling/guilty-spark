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
import type { StatsHandlerContext } from "./stats-handler-context";

export function createMatchEmbed(
  context: StatsHandlerContext,
  guildConfig: GuildConfigRow,
  match: MatchStats,
  locale: string,
): BaseMatchEmbed<GameVariantCategory> {
  return create({
    discordService: context.services.discordService,
    haloService: context.services.haloService,
    guildConfig,
    gameVariantCategory: match.MatchInfo.GameVariantCategory,
    locale,
  });
}

export class StatsMatchHandler {
  constructor(private readonly context: StatsHandlerContext) {}

  handleMatchSubCommand(
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
    const { discordService, haloService } = this.context.services;
    const locale = interaction.guild_locale ?? interaction.locale;

    try {
      const [guildConfig, matches] = await Promise.all([
        this.context.services.databaseService.getGuildConfig(Preconditions.checkExists(interaction.guild_id)),
        haloService.getMatchDetails([matchId]),
      ]);
      if (!matches.length) {
        await discordService.updateDeferredReply(interaction.token, { content: "Match not found" });
        return;
      }

      const match = Preconditions.checkExists(matches[0]);
      const players = await haloService.getPlayerXuidsToGametags(match, { presentAtBeginningOnly: true });

      const matchEmbed = createMatchEmbed(this.context, guildConfig, match, locale);
      const embed = await matchEmbed.getEmbed(match, players);

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [embed],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }
}
