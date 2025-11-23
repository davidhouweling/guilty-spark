import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIEmbed,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIMessageComponentButtonInteraction,
} from "discord-api-types/v10";
import {
  EmbedType,
  ChannelType,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  InteractionContextType,
} from "discord-api-types/v10";
import type { MatchStats, GameVariantCategory } from "halo-infinite-api";
import { subHours } from "date-fns";
import type { BaseInteraction, ExecuteResponse, ApplicationCommandData, CommandData } from "../base/base-command.mjs";
import { BaseCommand } from "../base/base-command.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { NEAT_QUEUE_BOT_USER_ID, type QueueData } from "../../services/discord/discord.mjs";
import type { BaseMatchEmbed } from "../../embeds/stats/base-match-embed.mjs";
import { SeriesPlayersEmbed } from "../../embeds/stats/series-players-embed.mjs";
import { SeriesOverviewEmbed } from "../../embeds/stats/series-overview-embed.mjs";
import { SeriesTeamsEmbed } from "../../embeds/stats/series-teams-embed.mjs";
import type { GuildConfigRow } from "../../services/database/types/guild_config.mjs";
import { StatsReturnType } from "../../services/database/types/guild_config.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { create } from "../../embeds/stats/create.mjs";

export enum InteractionButton {
  LoadGames = "btn_stats_load_games",
}

export class StatsCommand extends BaseCommand {
  readonly commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "stats",
      description: "Pulls stats from Halo waypoint",
      contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
      default_member_permissions: null,
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "neatqueue",
          description: "Pulls stats for a NeatQueue series result",
          options: [
            {
              name: "channel",
              description: "The channel the NeatQueue result message is in (if not this channel)",
              type: ApplicationCommandOptionType.Channel,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "queue",
              description: "The Queue number for the series (defaults to last queue result)",
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "match",
          description: "Pulls stats for a specific match",
          options: [
            {
              type: ApplicationCommandOptionType.String,
              name: "id",
              description: "The match ID (example: d9d77058-f140-4838-8f41-1a3406b28566)",
              required: true,
              max_length: 36,
              min_length: 36,
            },
            {
              name: "private",
              description: "Only provide the response to you instead of the channel",
              required: false,
              type: ApplicationCommandOptionType.Boolean,
            },
          ],
        },
      ],
    },
  ];

  // StatsCommand manually defines its component data (not using handler pattern yet)
  override get data(): CommandData[] {
    return [
      ...this.commands,
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.LoadGames,
        },
      },
    ];
  }

  protected handleInteraction(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    switch (type) {
      case InteractionType.ApplicationCommand: {
        const subcommand = this.services.discordService.extractSubcommand(interaction, "stats");

        switch (subcommand.name) {
          case "neatqueue": {
            return this.handleNeatQueueSubCommand(interaction, subcommand.mappedOptions);
          }
          case "match": {
            return this.handleMatchSubCommand(interaction, subcommand.mappedOptions);
          }
          default: {
            throw new Error("Unknown subcommand");
          }
        }
      }
      case InteractionType.MessageComponent: {
        const { custom_id } = interaction.data;
        switch (custom_id) {
          case InteractionButton.LoadGames.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () => this.loadGamesJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          default: {
            throw new Error(`Unknown interaction: ${custom_id}`);
          }
        }
      }
      case InteractionType.ModalSubmit: {
        throw new Error("Modals not supported");
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private handleNeatQueueSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const channel = (options.get("channel") as string | undefined) ?? interaction.channel.id;
    const queue = options.get("queue") as number | undefined;

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      },
      jobToComplete: async () => this.neatQueueSubCommandJob(interaction, channel, queue),
    };
  }

  private async neatQueueSubCommandJob(
    interaction: APIApplicationCommandInteraction,
    channelId: string,
    queue: number | undefined,
  ): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;
    let computedQueue = queue;
    let endDateTime: Date | undefined;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const [guildConfig, queueData] = await Promise.all([
        databaseService.getGuildConfig(guildId),
        discordService.getTeamsFromQueueResult(guildId, channelId, queue),
      ]);
      if (!queueData) {
        throw new EndUserError(
          `No queue found within the last 100 messages of <#${channelId}>${queue != null ? `, with queue number ${queue.toString()}` : ""}. If the results are in a different channel to this one, please specify the channel with the \`/stats neatqueue channel:\` option.`,
          {
            errorType: EndUserErrorType.WARNING,
            handled: true,
          },
        );
      }
      this.services.logService.debug("Found queue data", new Map([["queueData", JSON.stringify(queueData)]]));

      computedQueue = queueData.queue;
      const startDateTime = subHours(queueData.timestamp, 6);
      endDateTime = queueData.timestamp;
      const series = await haloService.getSeriesFromDiscordQueue({
        teams: queueData.teams.map((team) =>
          team.players.map((player) => ({
            id: player.user.id,
            username: player.user.username,
            globalName: player.user.global_name,
            guildNickname: player.nick ?? null,
          })),
        ),
        startDateTime,
        endDateTime,
      });
      const seriesEmbed = await this.createSeriesEmbed({
        guildId: Preconditions.checkExists(interaction.guild_id, "No guild id"),
        channelId,
        locale,
        queueData,
        series,
      });

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [seriesEmbed],
      });

      const message = await discordService.getMessageFromInteractionToken(interaction.token);
      const messageChannel = await discordService.getChannel(message.channel_id);
      const thread = [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(
        messageChannel.type,
      )
        ? messageChannel
        : await discordService.startThreadFromMessage(
            message.channel_id,
            message.id,
            `Queue #${queueData.queue.toString()} series stats`,
          );

      const seriesTeamsEmbed = new SeriesTeamsEmbed({
        discordService,
        haloService,
        guildConfig,
        locale,
      });
      const seriesTeamsEmbedOutput = await seriesTeamsEmbed.getSeriesEmbed(series);
      await discordService.createMessage(thread.id, {
        embeds: [seriesTeamsEmbedOutput],
      });

      const seriesPlayersEmbed = new SeriesPlayersEmbed({ discordService, haloService, guildConfig, locale });
      const seriesPlayers = await haloService.getPlayerXuidsToGametags(series);
      const seriesPlayersEmbedsOutput = await seriesPlayersEmbed.getSeriesEmbed(series, seriesPlayers, locale);
      for (const seriesPlayersEmbedOutput of seriesPlayersEmbedsOutput) {
        await discordService.createMessage(thread.id, {
          embeds: [seriesPlayersEmbedOutput],
        });
      }

      if (guildConfig.StatsReturn === StatsReturnType.SERIES_ONLY) {
        await discordService.createMessage(thread.id, {
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  custom_id: InteractionButton.LoadGames,
                  label: "Load game stats",
                  style: 1,
                  emoji: {
                    name: "🎮",
                  },
                },
              ],
            },
          ],
        });
      } else {
        for (const match of series) {
          const players = await haloService.getPlayerXuidsToGametags(match);
          const matchEmbed = this.getMatchEmbed(guildConfig, match, locale);
          const embed = await matchEmbed.getEmbed(match, players);

          await discordService.createMessage(thread.id, { embeds: [embed] });
        }
      }

      await haloService.updateDiscordAssociations();
    } catch (error) {
      if (error instanceof EndUserError && computedQueue != null && endDateTime != null) {
        error.appendData({
          Channel: `<#${channelId}>`,
          Queue: computedQueue.toString(),
          Completed: discordService.getTimestamp(endDateTime.toISOString()),
        });
      }
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private handleMatchSubCommand(
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
      const players = await haloService.getPlayerXuidsToGametags(match);

      const matchEmbed = this.getMatchEmbed(guildConfig, match, locale);
      const embed = await matchEmbed.getEmbed(match, players);

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [embed],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async loadGamesJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { env } = this;
    const { databaseService, discordService, haloService } = this.services;

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

      let statsOverviewEmbed: APIEmbed | undefined;

      if (parentMessage.author.id === this.env.DISCORD_APP_ID) {
        // this is our series stats queue message
        statsOverviewEmbed = Preconditions.checkExists(parentMessage.embeds[0], '"Missing series stats embed');
      } else if (parentMessage.author.id === NEAT_QUEUE_BOT_USER_ID) {
        // stats overview embed has been posted as a thread created from neat queue bot
        const threadMessages = await this.services.discordService.getMessages(channel.id);
        statsOverviewEmbed = Preconditions.checkExists(
          threadMessages.find((message) => {
            return (
              message.author.id === this.env.DISCORD_APP_ID &&
              message.embeds[0]?.type === EmbedType.Rich &&
              message.embeds[0].title?.match(/Series stats for queue #/) != null
            );
          })?.embeds[0],
          '"Missing series stats overview embed',
        );
      } else {
        throw new Error("Unexpected parent message author");
      }

      const gamesData = Preconditions.checkExists(
        statsOverviewEmbed.fields?.find((field) => field.name === "Game")?.value,
        '"Missing games data',
      );

      const matchIds = Array.from(
        gamesData.matchAll(/https:\/\/halodatahive\.com\/Infinite\/Match\/([a-f0-9-]+)/g),
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
        const players = await haloService.getPlayerXuidsToGametags(match);
        const matchEmbed = this.getMatchEmbed(guildConfig, match, locale);
        const embed = await matchEmbed.getEmbed(match, players);

        await discordService.createMessage(channel.id, {
          embeds: [embed],
        });
      }

      // remove the buttons now that all the games are loaded
      await this.services.discordService.deleteMessage(
        channel.id,
        interaction.message.id,
        "Removing load games buttons",
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async createSeriesEmbed({
    guildId,
    channelId,
    locale,
    queueData,
    series,
  }: {
    guildId: string;
    channelId: string;
    locale: string;
    queueData: QueueData;
    series: MatchStats[];
  }): Promise<APIEmbed> {
    const { discordService, haloService } = this.services;
    const seriesOverview = new SeriesOverviewEmbed({ discordService, haloService });
    const seriesEmbed = await seriesOverview.getEmbed({
      guildId,
      channelId,
      messageId: queueData.message.id,
      locale,
      queue: queueData.queue,
      series,
      finalTeams: queueData.teams.map((team) => ({
        name: team.name,
        playerIds: team.players.map(({ user: { id } }) => id),
      })),
      substitutions: [],
      hideTeamsDescription: false,
    });

    return seriesEmbed;
  }

  private getMatchEmbed(
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
