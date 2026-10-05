import type { APIEmbed, APIMessageComponentButtonInteraction } from "discord-api-types/v10";
import { ChannelType, EmbedType } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import { createMatchEmbed } from "./stats-match-command";
import type { StatsHandlerContext } from "./stats-handler-context";

export class StatsGamesHandler {
  constructor(private readonly context: StatsHandlerContext) {}

  async retryJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { discordService } = this.context.services;
    try {
      const endUserError = this.findEndUserError(interaction.message.embeds);
      if (endUserError == null) {
        throw new Error("No end user error found in the message embeds");
      }

      await this.context.services.neatQueueService.handleRetry({
        errorEmbed: endUserError,
        guildId: Preconditions.checkExists(interaction.guild_id),
        interaction,
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  /**
   * The error embed is appended last, after any preserved embeds.
   */
  private findEndUserError(embeds: APIEmbed[]): EndUserError | undefined {
    for (const embed of [...embeds].reverse()) {
      const endUserError = EndUserError.fromDiscordEmbed(embed);
      if (endUserError != null) {
        return endUserError;
      }
    }

    return undefined;
  }

  async loadGamesJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { env } = this.context;
    const { databaseService, discordService, haloService } = this.context.services;

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

      if (parentMessage.author.id === env.DISCORD_APP_ID) {
        statsOverviewEmbeds = parentMessage.embeds;
      } else if (parentMessage.author.id === NEAT_QUEUE_BOT_USER_ID) {
        const threadMessages = await discordService.getMessages(channel.id);
        const guiltySparkMessages = threadMessages.filter((message) => {
          const [firstEmbed] = message.embeds;
          if (message.author.id !== env.DISCORD_APP_ID || firstEmbed?.type !== EmbedType.Rich) {
            return false;
          }
          return (
            firstEmbed.title?.match(/Series stats for queue #/) != null ||
            firstEmbed.fields?.some((field) => field.name === "Game") === true
          );
        });

        statsOverviewEmbeds = guiltySparkMessages.flatMap((message) => message.embeds);
      } else {
        throw new Error("Unexpected parent message author");
      }

      if (statsOverviewEmbeds.length === 0) {
        throw new Error("No series stats embeds found");
      }

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
        const matchEmbed = createMatchEmbed(this.context, guildConfig, match, locale);
        const embed = await matchEmbed.getEmbed(match, players);

        await discordService.createMessage(channel.id, {
          embeds: [embed],
        });
      }

      await discordService.deleteMessage(channel.id, interaction.message.id, "Removing load games buttons");
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }
}
