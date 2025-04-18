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
import type { MatchStats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";
import { subHours } from "date-fns";
import type { BaseInteraction, CommandData, ExecuteResponse } from "../base/base.mjs";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { NEAT_QUEUE_BOT_USER_ID, type QueueData } from "../../services/discord/discord.mjs";
import type { BaseMatchEmbed } from "../../embeds/base-match-embed.mjs";
import { AttritionMatchEmbed } from "../../embeds/attrition-match-embed.mjs";
import { CtfMatchEmbed } from "../../embeds/ctf-match-embed.mjs";
import { EliminationMatchEmbed } from "../../embeds/elimination-match-embed.mjs";
import { EscalationMatchEmbed } from "../../embeds/escalation-match-embed.mjs";
import { ExtractionMatchEmbed } from "../../embeds/extraction-match-embed.mjs";
import { FiestaMatchEmbed } from "../../embeds/fiesta-match-embed.mjs";
import { FirefightMatchEmbed } from "../../embeds/firefight-match-embed.mjs";
import { GrifballMatchEmbed } from "../../embeds/grifball-match-embed.mjs";
import { InfectionMatchEmbed } from "../../embeds/infection-match-embed.mjs";
import { KOTHMatchEmbed } from "../../embeds/koth-match-embed.mjs";
import { LandGrabMatchEmbed } from "../../embeds/land-grab-match-embed.mjs";
import { MinigameMatchEmbed } from "../../embeds/minigame-match-embed.mjs";
import { OddballMatchEmbed } from "../../embeds/oddball-match-embed.mjs";
import { SlayerMatchEmbed } from "../../embeds/slayer-match-embed.mjs";
import { StockpileMatchEmbed } from "../../embeds/stockpile-match-embed.mjs";
import { StrongholdsMatchEmbed } from "../../embeds/strongholds-match-embed.mjs";
import { TotalControlMatchEmbed } from "../../embeds/total-control-match-embed.mjs";
import { UnknownMatchEmbed } from "../../embeds/unknown-match-embed.mjs";
import { VIPMatchEmbed } from "../../embeds/vip-match-embed.mjs";
import { SeriesPlayersEmbed } from "../../embeds/series-players-embed.mjs";
import { SeriesOverviewEmbed } from "../../embeds/series-overview-embed.mjs";
import { SeriesTeamsEmbed } from "../../embeds/series-teams-embed.mjs";
import type { GuildConfigRow } from "../../services/database/types/guild_config.mjs";
import { StatsReturnType } from "../../services/database/types/guild_config.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";

export enum InteractionButton {
  LoadGames = "btn_stats_load_games",
}

export class StatsCommand extends BaseCommand {
  data: CommandData[] = [
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
              description: "The channel which has the NeatQueue result message",
              required: true,
              type: ApplicationCommandOptionType.Channel,
            },
            {
              type: ApplicationCommandOptionType.Integer,
              name: "queue",
              description: "The Queue number for the series",
              required: true,
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
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.LoadGames,
      },
    },
  ];

  execute(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    try {
      switch (type) {
        case InteractionType.ApplicationCommand: {
          const subcommand = this.services.discordService.extractSubcommand(interaction, "stats");

          if (subcommand.mappedOptions == null || subcommand.mappedOptions.size === 0) {
            throw new Error("Missing subcommand options");
          }
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
          if (custom_id === InteractionButton.LoadGames.toString()) {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.handleLoadGamesButton(interaction as APIMessageComponentButtonInteraction),
            };
          }
          throw new Error("Unknown interaction");
        }
        case InteractionType.ModalSubmit: {
          throw new Error("Modals not supported");
        }
        default: {
          throw new UnreachableError(type);
        }
      }
    } catch (error) {
      this.services.logService.error(error as Error);

      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `Error: ${error instanceof Error ? error.message : "unknown"}`,
            flags: MessageFlags.Ephemeral,
          },
        },
      };
    }
  }

  private handleNeatQueueSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const channel = Preconditions.checkExists(options.get("channel") as string, "Missing channel");
    const queue = Preconditions.checkExists(options.get("queue") as number, "Missing queue");
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
      jobToComplete: async () => this.neatQueueSubCommandJob(interaction, channel, queue),
    };
  }

  private async neatQueueSubCommandJob(
    interaction: APIApplicationCommandInteraction,
    channel: string,
    queue: number,
  ): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;

    try {
      const [guildConfig, queueData] = await Promise.all([
        databaseService.getGuildConfig(Preconditions.checkExists(interaction.guild_id)),
        discordService.getTeamsFromQueue(channel, queue),
      ]);
      if (!queueData) {
        throw new Error(
          `No queue found within the last 100 messages of <#${channel}>, with queue number ${queue.toLocaleString(locale)}`,
        );
      }

      const startDateTime = subHours(queueData.timestamp, 6);
      const endDateTime = queueData.timestamp;
      const series = await haloService.getSeriesFromDiscordQueue({
        teams: queueData.teams.map((team) =>
          team.players.map((player) => ({
            id: player.id,
            username: player.username,
            globalName: player.global_name,
          })),
        ),
        startDateTime,
        endDateTime,
      });
      const seriesEmbed = await this.createSeriesEmbed({
        guildId: Preconditions.checkExists(interaction.guild_id, "No guild id"),
        channel,
        locale,
        queue,
        queueData,
        series,
      });

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [seriesEmbed],
      });

      const message = await discordService.getMessageFromInteractionToken(interaction.token);
      const thread = await discordService.startThreadFromMessage(
        message.channel_id,
        message.id,
        `Queue #${queue.toString()} series stats`,
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
      const seriesPlayers = await haloService.getPlayerXuidsToGametags(Preconditions.checkExists(series[0]));
      const seriesPlayersEmbedOutput = await seriesPlayersEmbed.getSeriesEmbed(series, seriesPlayers, locale);
      await discordService.createMessage(thread.id, {
        embeds: [seriesPlayersEmbedOutput],
        components:
          guildConfig.StatsReturn === StatsReturnType.SERIES_ONLY
            ? [
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: InteractionButton.LoadGames.toString(),
                      label: "Load game stats",
                      style: 1,
                      emoji: {
                        name: "🎮",
                      },
                    },
                  ],
                },
              ]
            : [],
      });

      if (guildConfig.StatsReturn === StatsReturnType.SERIES_AND_GAMES) {
        for (const match of series) {
          const players = await haloService.getPlayerXuidsToGametags(match);
          const matchEmbed = this.getMatchEmbed(guildConfig, match, locale);
          const embed = await matchEmbed.getEmbed(match, players);

          await discordService.createMessage(thread.id, { embeds: [embed] });
        }
      }

      await haloService.updateDiscordAssociations();
    } catch (error) {
      this.services.logService.error(error as Error);

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to fetch (Channel: <#${channel}>, queue: ${queue.toLocaleString(locale)}): ${error instanceof Error ? error.message : "unknown"}`,
      });
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

      await discordService.updateDeferredReply(interaction.token, { embeds: [embed] });
    } catch (error) {
      this.services.logService.error(error as Error);

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to fetch (match id: ${matchId}}): ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  private async handleLoadGamesButton(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    try {
      const { databaseService, discordService, haloService } = this.services;
      const locale = interaction.guild_locale ?? interaction.locale;

      const { channel } = interaction;
      if (channel.type !== ChannelType.PublicThread) {
        throw new Error('Unexpected channel type, expected "PublicThread"');
      }

      const parentMessage = await discordService.getMessage(Preconditions.checkExists(channel.parent_id), channel.id);
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
      await this.services.discordService.updateDeferredReply(interaction.token, {
        content: "",
        components: [],
      });
    } catch (error) {
      this.services.logService.error(error as Error);

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await this.services.discordService.updateDeferredReply(interaction.token, {
        content: `Failed to fetch games: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  private async createSeriesEmbed({
    guildId,
    channel,
    locale,
    queue,
    queueData,
    series,
  }: {
    guildId: string;
    channel: string;
    locale: string;
    queue: number;
    queueData: QueueData;
    series: MatchStats[];
  }): Promise<APIEmbed> {
    const { discordService, haloService } = this.services;
    const seriesOverview = new SeriesOverviewEmbed({ discordService, haloService });
    const seriesEmbed = await seriesOverview.getEmbed({
      guildId,
      channel,
      messageId: queueData.message.id,
      locale,
      queue,
      series,
      finalTeams: queueData.teams.map((team) => ({
        name: team.name,
        playerIds: team.players.map(({ id }) => id),
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
    const opts = {
      discordService: this.services.discordService,
      haloService: this.services.haloService,
      guildConfig,
      locale,
    };

    switch (match.MatchInfo.GameVariantCategory) {
      case GameVariantCategory.MultiplayerAttrition:
        return new AttritionMatchEmbed(opts);
      case GameVariantCategory.MultiplayerCtf:
        return new CtfMatchEmbed(opts);
      case GameVariantCategory.MultiplayerElimination:
        return new EliminationMatchEmbed(opts);
      case GameVariantCategory.MultiplayerEscalation:
        return new EscalationMatchEmbed(opts);
      case GameVariantCategory.MultiplayerExtraction:
        return new ExtractionMatchEmbed(opts);
      case GameVariantCategory.MultiplayerFiesta:
        return new FiestaMatchEmbed(opts);
      case GameVariantCategory.MultiplayerFirefight:
        return new FirefightMatchEmbed(opts);
      case GameVariantCategory.MultiplayerGrifball:
        return new GrifballMatchEmbed(opts);
      case GameVariantCategory.MultiplayerInfection:
        return new InfectionMatchEmbed(opts);
      case GameVariantCategory.MultiplayerKingOfTheHill:
        return new KOTHMatchEmbed(opts);
      case GameVariantCategory.MultiplayerLandGrab:
        return new LandGrabMatchEmbed(opts);
      case GameVariantCategory.MultiplayerMinigame:
        return new MinigameMatchEmbed(opts);
      case GameVariantCategory.MultiplayerOddball:
        return new OddballMatchEmbed(opts);
      case GameVariantCategory.MultiplayerSlayer:
        return new SlayerMatchEmbed(opts);
      case GameVariantCategory.MultiplayerStockpile:
        return new StockpileMatchEmbed(opts);
      case GameVariantCategory.MultiplayerStrongholds:
        return new StrongholdsMatchEmbed(opts);
      case GameVariantCategory.MultiplayerTotalControl:
        return new TotalControlMatchEmbed(opts);
      case GameVariantCategory.MultiplayerVIP:
        return new VIPMatchEmbed(opts);
      default:
        return new UnknownMatchEmbed(opts);
    }
  }
}
