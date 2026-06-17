import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIEmbed,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
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
  PermissionFlagsBits,
} from "discord-api-types/v10";
import type { MatchStats, GameVariantCategory } from "halo-infinite-api";
import { subHours } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { BaseInteraction, ExecuteResponse, ApplicationCommandData, CommandData } from "../base/base-command";
import { BaseCommand } from "../base/base-command";
import { NEAT_QUEUE_BOT_USER_ID, type QueueData } from "../../services/discord/discord";
import type { BaseMatchEmbed } from "../../embeds/stats/base-match-embed";
import { SeriesPlayersEmbed } from "../../embeds/stats/series-players-embed";
import { SeriesOverviewEmbed } from "../../embeds/stats/series-overview-embed";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import { SeriesTeamsEmbed } from "../../embeds/stats/series-teams-embed";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import { StatsReturnType } from "../../services/database/types/guild_config";
import { EndUserError } from "../../base/end-user-error";
import { create } from "../../embeds/stats/create";

interface FixFlowMetadata extends Record<string, unknown> {
  guildId: string;
  channelId: string;
  queueData: QueueData;
  selectedPlayerId?: string;
  selectedMatchIds?: string[];
}

export enum InteractionButton {
  Retry = "btn_stats_retry",
  LoadGames = "btn_stats_load_games",
  FixPlayerSelect = "btn_stats_fix_player_select",
  FixGamesSelect = "btn_stats_fix_games_select",
  FixConfirm = "btn_stats_fix_confirm",
  FixCancel = "btn_stats_fix_cancel",
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
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "fix",
          description: "Manually correct a series by selecting custom games",
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: "queue_number",
              description: "The queue number to fix (optional if running from queue thread)",
              required: false,
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
          custom_id: InteractionButton.Retry,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.LoadGames,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.FixPlayerSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.FixGamesSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.FixConfirm,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.FixCancel,
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
          case "fix": {
            return this.handleFixSubCommand(interaction, subcommand.mappedOptions);
          }
          default: {
            throw new Error("Unknown subcommand");
          }
        }
      }
      case InteractionType.MessageComponent: {
        const { custom_id } = interaction.data;
        switch (custom_id) {
          case InteractionButton.Retry.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () => this.retryJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.LoadGames.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () => this.loadGamesJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.FixPlayerSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.handleFixPlayerSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.FixGamesSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.handleFixGamesSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.FixConfirm.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.handleFixConfirmationJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.FixCancel.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () => this.handleFixCancelJob(interaction as APIMessageComponentButtonInteraction),
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
    const optionsChannel = options.get("channel") as string | undefined;
    let channel = optionsChannel ?? interaction.channel.id;
    const queue = options.get("queue") as number | undefined;

    const channelType = interaction.channel.type;

    if (
      optionsChannel == null &&
      (channelType === ChannelType.PublicThread ||
        channelType === ChannelType.PrivateThread ||
        channelType === ChannelType.AnnouncementThread)
    ) {
      if (queue == null) {
        return {
          response: {
            type: InteractionResponseType.DeferredChannelMessageWithSource,
          },
          jobToComplete: async () => this.neatQueueSubCommandInThreadJob(interaction),
        };
      }

      channel = interaction.channel.parent_id ?? interaction.channel.id;
    }

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
        embeds: seriesEmbed.embeds,
        components: seriesEmbed.components,
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
            `Queue #${queueData.queue.toString()} series stats (${haloService.getSeriesScore(series, locale, true)})`,
          );

      await this.postSeriesEmbedsToThread(thread.id, series, guildConfig, locale);
      await this.postGameStatsOrButton(thread.id, series, guildConfig, locale);

      await Promise.all([
        haloService.updateDiscordAssociations(),
        this.warmDiscordSeriesStatsRoute(guildId, queueData.queue),
      ]);
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

  private async neatQueueSubCommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
    const { databaseService, discordService, haloService, logService, neatQueueService } = this.services;
    let previousEndUserError: EndUserError | undefined;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");

      if (
        interaction.channel.type !== ChannelType.PublicThread &&
        interaction.channel.type !== ChannelType.PrivateThread &&
        interaction.channel.type !== ChannelType.AnnouncementThread
      ) {
        throw new EndUserError("This command must be run in a thread channel.");
      }
      const threadChannelId = interaction.channel.id;
      const [guildConfig, threadMessages] = await Promise.all([
        databaseService.getGuildConfig(guildId),
        this.services.discordService.getMessages(threadChannelId),
      ]);
      const firstMessage = threadMessages[threadMessages.length - 1];
      if (
        firstMessage?.referenced_message?.author.bot !== true ||
        firstMessage.referenced_message.author.id !== NEAT_QUEUE_BOT_USER_ID
      ) {
        throw new EndUserError("The first message in this thread is not from NeatQueue.");
      }
      const queueMessage = firstMessage.referenced_message;

      const guiltySparkMessages = threadMessages.filter(
        (message) =>
          message.author.id === this.env.DISCORD_APP_ID && (message.content !== "" || message.embeds.length > 0),
      );
      const errorMessages = guiltySparkMessages
        .map((message) => (message.embeds[0] ? EndUserError.fromDiscordEmbed(message.embeds[0]) : null))
        .filter((errorMessage) => errorMessage != null);

      try {
        await discordService.bulkDeleteMessages(
          threadChannelId,
          guiltySparkMessages.map((message) => message.id),
          "Cleaning up previous Guilty Spark messages before computing data",
        );
      } catch (error) {
        logService.error(error as Error, new Map([["threadChannelId", threadChannelId]]));
      }

      [previousEndUserError] = errorMessages;
      if (
        previousEndUserError?.data["Channel"] != null &&
        previousEndUserError.data["Queue"] != null &&
        previousEndUserError.data["Completed"] != null
      ) {
        await neatQueueService.handleRetry({
          errorEmbed: previousEndUserError,
          guildId,
          interaction,
        });
      } else {
        const queueData = await discordService.getTeamsFromMessage(guildId, queueMessage);
        const locale = interaction.guild_locale ?? interaction.locale;
        const startDateTime = subHours(queueData.timestamp, 6);
        const endDateTime = queueData.timestamp;
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
          guildId,
          channelId: queueMessage.channel_id,
          locale,
          queueData,
          series,
        });

        await discordService.updateDeferredReply(interaction.token, {
          embeds: seriesEmbed.embeds,
          components: seriesEmbed.components,
        });

        await this.postSeriesEmbedsToThread(threadChannelId, series, guildConfig, locale);
        await this.postGameStatsOrButton(threadChannelId, series, guildConfig, locale);

        await Promise.all([
          haloService.updateDiscordAssociations(),
          this.warmDiscordSeriesStatsRoute(guildId, queueData.queue),
        ]);
      }
    } catch (error) {
      if (error instanceof EndUserError) {
        error.appendData(previousEndUserError?.data ?? {});
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

  private async retryJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { discordService } = this.services;
    try {
      if (interaction.message.embeds[0] == null) {
        throw new Error("No embed found in the message");
      }

      const [embed] = interaction.message.embeds;
      const endUserError = EndUserError.fromDiscordEmbed(embed);
      if (endUserError == null) {
        throw new Error("No end user error found in the embed");
      }

      await this.services.neatQueueService.handleRetry({
        errorEmbed: endUserError,
        guildId: Preconditions.checkExists(interaction.guild_id),
        interaction,
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

      let statsOverviewEmbeds: APIEmbed[] = [];

      if (parentMessage.author.id === this.env.DISCORD_APP_ID) {
        // this is our series stats queue message - collect all embeds
        statsOverviewEmbeds = parentMessage.embeds;
      } else if (parentMessage.author.id === NEAT_QUEUE_BOT_USER_ID) {
        // stats overview embed has been posted as a thread created from neat queue bot
        const threadMessages = await this.services.discordService.getMessages(channel.id);
        const guiltySparkMessages = threadMessages.filter((message) => {
          const [firstEmbed] = message.embeds;
          if (message.author.id !== this.env.DISCORD_APP_ID || firstEmbed?.type !== EmbedType.Rich) {
            return false;
          }
          return (
            firstEmbed.title?.match(/Series stats for queue #/) != null ||
            firstEmbed.fields?.some((field) => field.name === "Game") === true
          );
        });

        // Collect all embeds from all Guilty Spark series stats messages
        statsOverviewEmbeds = guiltySparkMessages.flatMap((message) => message.embeds);
      } else {
        throw new Error("Unexpected parent message author");
      }

      if (statsOverviewEmbeds.length === 0) {
        throw new Error("No series stats embeds found");
      }

      // Collect all game data from all embeds
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

  private async postSeriesEmbedsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
  ): Promise<void> {
    const { discordService, haloService } = this.services;

    const seriesTeamsEmbed = new SeriesTeamsEmbed({
      discordService,
      haloService,
      guildConfig,
      locale,
    });
    const seriesTeamsEmbedOutput = await seriesTeamsEmbed.getSeriesEmbed(series);
    await discordService.createMessage(threadId, {
      embeds: [seriesTeamsEmbedOutput],
    });

    const seriesPlayersEmbed = new SeriesPlayersEmbed({ discordService, haloService, guildConfig, locale });
    const seriesPlayers = await haloService.getPlayerXuidsToGametags(series);
    const seriesPlayersEmbedsOutput = await seriesPlayersEmbed.getSeriesEmbed(series, seriesPlayers, locale);
    for (const seriesPlayersEmbedOutput of seriesPlayersEmbedsOutput) {
      await discordService.createMessage(threadId, {
        embeds: [seriesPlayersEmbedOutput],
      });
    }
  }

  private async postGameStatsOrButton(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
  ): Promise<void> {
    const { discordService, haloService } = this.services;

    if (guildConfig.StatsReturn === StatsReturnType.SERIES_ONLY) {
      await discordService.createMessage(threadId, {
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

        await discordService.createMessage(threadId, { embeds: [embed] });
      }
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
  }): Promise<SeriesOverviewEmbedOutput> {
    const { discordService, haloService } = this.services;
    const seriesOverview = new SeriesOverviewEmbed({ discordService, haloService });
    const seriesEmbed = await seriesOverview.getEmbed({
      guildId,
      channelId,
      messageId: queueData.message.id,
      pagesUrl: this.env.PAGES_URL,
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

  private async warmDiscordSeriesStatsRoute(guildId: string, queueNumber: number): Promise<void> {
    const { logService } = this.services;
    const url = `${this.env.HOST_URL}/api/stats/discord/${guildId}/${queueNumber.toString()}`;

    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }

      logService.warn(
        `Discord series stats warm request returned non-OK status: ${response.status.toString()}`,
        new Map([
          ["guildId", guildId],
          ["queueNumber", queueNumber.toString()],
          ["status", response.status.toString()],
        ]),
      );
    } catch (error) {
      logService.warn(
        error as Error,
        new Map([
          ["guildId", guildId],
          ["queueNumber", queueNumber.toString()],
        ]),
      );
    }
  }

  private handleFixSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const queueNumber = options.get("queue_number") as number | undefined;
    const isThreadChannel = this.isThreadChannel(interaction.channel.type);

    if (!isThreadChannel && queueNumber == null) {
      throw new EndUserError("queue_number is required when running /stats fix outside a thread.");
    }

    if (isThreadChannel && queueNumber == null) {
      return {
        response: {
          type: InteractionResponseType.DeferredChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
          },
        },
        jobToComplete: async () => this.fixSubCommandInThreadJob(interaction),
      };
    }

    const parentChannelId = "parent_id" in interaction.channel ? interaction.channel.parent_id : undefined;
    const channelId = isThreadChannel ? (parentChannelId ?? interaction.channel.id) : interaction.channel.id;

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: {
          flags: MessageFlags.Ephemeral,
        },
      },
      jobToComplete: async () => this.fixSubCommandJob(interaction, channelId, Preconditions.checkExists(queueNumber)),
    };
  }

  private async fixSubCommandJob(
    interaction: APIApplicationCommandInteraction,
    channelId: string,
    queueNumber: number,
  ): Promise<void> {
    const { discordService } = this.services;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const queueData = await discordService.getTeamsFromQueueResult(guildId, channelId, queueNumber);

      await this.fixCommandStartFlow(interaction, channelId, queueData);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async fixSubCommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      if (!this.isThreadChannel(interaction.channel.type)) {
        throw new EndUserError("This command must be run in a thread channel.");
      }

      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const threadMessages = await discordService.getMessages(interaction.channel.id);
      const firstMessage = threadMessages[threadMessages.length - 1];

      if (
        firstMessage?.referenced_message?.author.bot !== true ||
        firstMessage.referenced_message.author.id !== NEAT_QUEUE_BOT_USER_ID
      ) {
        throw new EndUserError("The first message in this thread is not from NeatQueue.");
      }

      const queueData = await discordService.getTeamsFromMessage(guildId, firstMessage.referenced_message);
      const parentChannelId = "parent_id" in interaction.channel ? interaction.channel.parent_id : undefined;
      const channelId = parentChannelId ?? interaction.channel.id;

      await this.fixCommandStartFlow(interaction, channelId, queueData);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async fixCommandStartFlow(
    interaction: APIApplicationCommandInteraction,
    channelId: string,
    queueData: QueueData,
  ): Promise<void> {
    const { discordService } = this.services;

    const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
    const userId = discordService.getDiscordUserId(interaction);
    const permissions = await discordService.computeMemberPermissions(guildId, userId);
    const isAdmin = (permissions & PermissionFlagsBits.Administrator) !== 0n;
    const queuePlayerIds = new Set(queueData.teams.flatMap((team) => team.players.map((player) => player.user.id)));

    if (!isAdmin && !queuePlayerIds.has(userId)) {
      throw new EndUserError("Only players from that queue (or admins) can run /stats fix.");
    }

    const selectOptions = queueData.teams.flatMap((team) =>
      team.players.map((player) => {
        const label = player.nick ?? player.user.global_name ?? player.user.username;

        return {
          label: label.slice(0, 100),
          value: player.user.id,
          description: team.name.slice(0, 100),
        };
      }),
    );

    await discordService.updateDeferredReply(interaction.token, {
      content: "Select a player from the queue to load candidate custom games.",
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.FixPlayerSelect,
              min_values: 1,
              max_values: 1,
              options: selectOptions,
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.FixCancel,
              label: "Cancel",
              style: 2,
            },
          ],
        },
      ],
    });

    const message = await discordService.getMessageFromInteractionToken(interaction.token);
    await this.setFixMetadata(message.id, {
      guildId,
      channelId,
      queueData,
    });
  }

  private async handleFixPlayerSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const selectedPlayerId = Preconditions.checkExists(interaction.data.values[0], "No player selected");
      const metadata = await this.getFixMetadata(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const association = (await databaseService.getDiscordAssociations([selectedPlayerId]))[0];
      if (association?.XboxId == null || association.XboxId === "") {
        throw new EndUserError("That player does not have a linked Xbox account.");
      }

      const games = await haloService.getPlayerCustomGames(association.XboxId, 25);
      if (games.length === 0) {
        throw new EndUserError("No recent custom games were found for that player.");
      }

      const gameOptions = games.map((game, index) => {
        const startTime = new Date(game.MatchInfo.StartTime).toISOString().replace("T", " ").slice(0, 16);
        const label = `${(index + 1).toString()}. ${startTime}`;

        return {
          label: label.slice(0, 100),
          value: game.MatchId,
          description: game.MatchId.slice(0, 100),
          default: true,
        };
      });

      const selectedMatchIds = gameOptions.map((option) => option.value);
      await this.setFixMetadata(interaction.message.id, {
        ...metadata,
        selectedPlayerId,
        selectedMatchIds,
      });

      await discordService.updateDeferredReply(interaction.token, {
        content: "Select the custom games that belong to this series.",
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionButton.FixGamesSelect,
                min_values: 1,
                max_values: Math.min(gameOptions.length, 25),
                options: gameOptions,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.FixCancel,
                label: "Cancel",
                style: 2,
              },
            ],
          },
        ],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleFixGamesSelectJob(_interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService, haloService } = this.services;

    try {
      const selectedMatchIds = _interaction.data.values;
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("Select at least one game.");
      }

      const metadata = await this.getFixMetadata(_interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const series = await haloService.getMatchDetails(selectedMatchIds);
      if (series.length === 0) {
        throw new EndUserError("No match details found for the selected games.");
      }

      const seriesEmbed = await this.createSeriesEmbed({
        guildId: metadata.guildId,
        channelId: metadata.channelId,
        locale: _interaction.guild_locale ?? _interaction.locale,
        queueData: metadata.queueData,
        series,
      });

      await this.setFixMetadata(_interaction.message.id, {
        ...metadata,
        selectedMatchIds,
      });

      await discordService.updateDeferredReply(_interaction.token, {
        content: "Preview generated. Confirm to replace the previous series stats.",
        embeds: seriesEmbed.embeds,
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.FixConfirm,
                label: "Confirm",
                style: 3,
              },
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.FixCancel,
                label: "Cancel",
                style: 2,
              },
            ],
          },
        ],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(_interaction.token, error);
    }
  }

  private async handleFixConfirmationJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const metadata = await this.getFixMetadata(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const selectedMatchIds = metadata.selectedMatchIds ?? [];
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("No games were selected. Please run /stats fix again.");
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const [guildConfig, series] = await Promise.all([
        databaseService.getGuildConfig(metadata.guildId),
        haloService.getMatchDetails(selectedMatchIds),
      ]);
      if (series.length === 0) {
        throw new EndUserError("No match details found for selected games.");
      }

      const amendedSeriesEmbed = await this.createSeriesEmbed({
        guildId: metadata.guildId,
        channelId: metadata.channelId,
        locale,
        queueData: metadata.queueData,
        series,
      });
      const amendedByUserId = discordService.getDiscordUserId(interaction);
      const amendedField = {
        name: "Amended by",
        value: `<@${amendedByUserId}> on ${discordService.getTimestamp(new Date().toISOString())}`,
        inline: false,
      };
      const amendedOverviewEmbed = Preconditions.checkExists(amendedSeriesEmbed.embeds[0]);
      if (amendedOverviewEmbed.fields == null) {
        amendedOverviewEmbed.fields = [];
      }
      amendedOverviewEmbed.fields.push(amendedField);

      const activeThreads = await discordService.getThreads(metadata.channelId);
      const relatedThread = activeThreads.find(
        (thread) => "parent_id" in thread && thread.parent_id === metadata.queueData.message.id,
      );

      let destinationThreadId: string;
      if (relatedThread != null) {
        destinationThreadId = relatedThread.id;
        const existingThreadMessages = await discordService.getMessages(destinationThreadId);
        await this.deleteMessagesInChunks(
          destinationThreadId,
          existingThreadMessages.map((message) => message.id),
          "Replacing amended series stats",
        );
      } else {
        const seriesOverviewMessage = await discordService.createMessage(metadata.channelId, {
          embeds: amendedSeriesEmbed.embeds,
          components: amendedSeriesEmbed.components,
        });
        const createdThread = await discordService.startThreadFromMessage(
          metadata.channelId,
          seriesOverviewMessage.id,
          `Queue #${metadata.queueData.queue.toString()} series stats (${haloService.getSeriesScore(series, locale, true)})`,
        );
        destinationThreadId = createdThread.id;
      }

      await discordService.createMessage(destinationThreadId, {
        embeds: amendedSeriesEmbed.embeds,
        components: amendedSeriesEmbed.components,
      });
      await this.postSeriesEmbedsToThread(destinationThreadId, series, guildConfig, locale);
      await this.postGameStatsOrButton(destinationThreadId, series, guildConfig, locale);
      await this.warmDiscordSeriesStatsRoute(metadata.guildId, metadata.queueData.queue);

      await discordService.updateDeferredReply(interaction.token, {
        content: "Series stats were amended successfully.",
        embeds: [],
        components: [],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleFixCancelJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      await discordService.updateDeferredReply(interaction.token, {
        content: "Cancelled.",
        components: [],
        embeds: [],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private isThreadChannel(channelType: ChannelType): boolean {
    return (
      channelType === ChannelType.PublicThread ||
      channelType === ChannelType.PrivateThread ||
      channelType === ChannelType.AnnouncementThread
    );
  }

  private async setFixMetadata(messageId: string, metadata: FixFlowMetadata): Promise<void> {
    await this.services.discordService.setInteractionMetadata(this.fixMetadataKey(messageId), metadata);
  }

  private async getFixMetadata(messageId: string): Promise<FixFlowMetadata | null> {
    const metadata = await this.services.discordService.getInteractionMetadata<FixFlowMetadata>(
      this.fixMetadataKey(messageId),
    );

    return metadata;
  }

  private fixMetadataKey(messageId: string): string {
    return `statsFix:${messageId}`;
  }

  private async deleteMessagesInChunks(channelId: string, messageIds: string[], reason: string): Promise<void> {
    const { discordService } = this.services;

    for (let start = 0; start < messageIds.length; start += 100) {
      const chunk = messageIds.slice(start, start + 100);
      if (chunk.length === 0) {
        continue;
      }
      if (chunk.length === 1) {
        await discordService.deleteMessage(channelId, Preconditions.checkExists(chunk[0]), reason);
        continue;
      }
      await discordService.bulkDeleteMessages(channelId, chunk, reason);
    }
  }
}
