import type {
  APIChannel,
  APIEmbed,
  APIMessage,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIMessageTopLevelComponent,
  APISelectMenuOption,
  APIUserApplicationCommandGuildInteraction,
} from "discord-api-types/v10";
import {
  ChannelType,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  InteractionContextType,
  PermissionFlagsBits,
  ButtonStyle,
} from "discord-api-types/v10";
import { MatchType } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { formatDistanceToNowStrict } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { computeSeriesTeamWins } from "@guilty-spark/shared/halo/series-score";
import { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { BaseInteraction, ExecuteResponse, ApplicationCommandData, CommandData } from "../base/base-command";
import { BaseCommand } from "../base/base-command";
import type { Services } from "../../services/install";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import type { QueueData } from "../../services/discord/discord";
import { SeriesPlayersEmbed } from "../../embeds/stats/series-players-embed";
import { SeriesOverviewEmbed } from "../../embeds/stats/series-overview-embed";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import { SeriesTeamsEmbed } from "../../embeds/stats/series-teams-embed";
import { mapManualSeriesToStableTeams } from "../../services/halo/manual-series-team-mapping";
import type { ManualSeriesTeamMappings } from "../../services/halo/manual-series-team-mapping";
import { buildDiscordSeriesRenderDataFromMatches } from "../../services/discord/discord-series-stats";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import { StatsReturnType } from "../../services/database/types/guild_config";
import { EmbedColors } from "../../embeds/colors";
import { EndUserError } from "../../base/end-user-error";
import { toMissingPermissionsError } from "../../base/missing-permissions-error";
import {
  PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
  PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
} from "../../embeds/stats/player-stats-embed";
import {
  PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
  PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID,
  getPlayerCompareControlIdBase,
} from "../../embeds/stats/player-compare-embed";
import type { MatchHistoryEntry } from "../../services/halo/types";
import { StatsMatchHandler, createMatchEmbed } from "./stats-match-command";
import { StatsGamesHandler } from "./stats-games-command";
import { StatsPlayerHandler } from "./stats-player-handler";
import { StatsCompareHandler } from "./stats-compare-handler";
import { StatsNeatQueueHandler } from "./stats-neatqueue-handler";
import { StatsManualHandler } from "./stats-manual-command";
import { StatsFixHandler } from "./stats-fix-command";
import type { FixFlowMetadata, FixSeriesOutcome, ManualFlowMetadata } from "./stats-flow-types";
import type { StatsHandlerContext } from "./stats-handler-context";
import { InteractionButton } from "./stats-interaction-button";
import { MANUAL_QUEUE_NUMBER_MIN } from "./manual-series";

const FIX_METADATA_RETRY_BASE_DELAY_MS = 150;
const FIX_METADATA_MAX_RETRIES = 3;
function isPlayerStatsUserCommand(
  interaction: BaseInteraction,
): interaction is APIUserApplicationCommandGuildInteraction {
  return (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.data.type === ApplicationCommandType.User &&
    interaction.data.name === "Player stats" &&
    "guild_id" in interaction &&
    "member" in interaction
  );
}

function isCompareStatsUserCommand(
  interaction: BaseInteraction,
): interaction is APIUserApplicationCommandGuildInteraction {
  return (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.data.type === ApplicationCommandType.User &&
    interaction.data.name === "Compare stats" &&
    "guild_id" in interaction &&
    "member" in interaction
  );
}

export class StatsCommand extends BaseCommand {
  private readonly handlerContext: StatsHandlerContext;
  private readonly matchHandler: StatsMatchHandler;
  private readonly gamesHandler: StatsGamesHandler;
  private readonly playerHandler: StatsPlayerHandler;
  private readonly compareHandler: StatsCompareHandler;
  private readonly neatQueueHandler: StatsNeatQueueHandler;
  private readonly manualHandler: StatsManualHandler;
  private readonly fixHandler: StatsFixHandler;

  constructor(services: Services, env: Env) {
    super(services, env);
    this.handlerContext = { services, env };
    this.matchHandler = new StatsMatchHandler(this.handlerContext);
    this.gamesHandler = new StatsGamesHandler(this.handlerContext);
    this.playerHandler = new StatsPlayerHandler(this.handlerContext);
    this.compareHandler = new StatsCompareHandler(this.handlerContext);
    this.neatQueueHandler = new StatsNeatQueueHandler(this.handlerContext, {
      createSeriesEmbed: async (input): Promise<SeriesOverviewEmbedOutput> => this.createSeriesEmbed(input),
      cacheDiscordSeriesStats: async (guildId, queueNumber, series, locale): Promise<void> =>
        this.cacheDiscordSeriesStats(guildId, queueNumber, series, locale),
      resolveSeriesThread: async (message, queueNumber, series, locale): Promise<APIChannel> =>
        this.resolveSeriesThread(message, queueNumber, series, locale),
      postSeriesStatsToThread: async (threadId, series, guildConfig, locale): Promise<void> =>
        this.postSeriesStatsToThread(threadId, series, guildConfig, locale),
    });
    this.manualHandler = new StatsManualHandler(this.handlerContext, {
      createStatusEmbed: (description): APIEmbed => this.createStatusEmbed(description),
      createFixCancelActionRow: (): APIMessageTopLevelComponent => this.createFixCancelActionRow(),
      getManualMetadataWithRetry: async (messageId): Promise<ManualFlowMetadata> =>
        this.getManualMetadataWithRetry(messageId),
      setManualMetadata: async (messageId, metadata): Promise<void> => this.setManualMetadata(messageId, metadata),
      deriveFixSeriesOutcome: (series): FixSeriesOutcome => this.deriveFixSeriesOutcome(series),
      parseFixSeriesOutcome: (value): FixSeriesOutcome => this.parseFixSeriesOutcome(value),
      getFixSeriesOutcomeLabel: (outcome, teams): string => this.getFixSeriesOutcomeLabel(outcome, teams),
      getFixSeriesOutcomeOptions: (teams, selectedOutcome): APISelectMenuOption[] =>
        this.getFixSeriesOutcomeOptions(teams, selectedOutcome),
      isThreadChannel: (channelType): boolean => this.isThreadChannel(channelType),
      postSeriesStatsToThread: async (
        threadId,
        series,
        guildConfig,
        locale,
        allowLoadGamesButton,
        postedMessageIds,
        teamMappings,
      ): Promise<void> =>
        this.postSeriesStatsToThread(
          threadId,
          series,
          guildConfig,
          locale,
          allowLoadGamesButton,
          postedMessageIds,
          teamMappings,
        ),
      cacheDiscordSeriesStats: async (
        guildId,
        queueNumber,
        series,
        locale,
        isManualSeries,
        seriesScore,
      ): Promise<void> =>
        this.cacheDiscordSeriesStats(guildId, queueNumber, series, locale, isManualSeries, seriesScore),
      getRecentCustomGames: async (discordUserId, locale): Promise<MatchHistoryEntry[]> =>
        this.getRecentCustomGames(discordUserId, locale),
      toGameSelectOptions: (matches, selectedMatchIds): APISelectMenuOption[] =>
        this.toGameSelectOptions(matches, selectedMatchIds),
    });
    this.fixHandler = new StatsFixHandler(this.handlerContext, {
      createStatusEmbed: (description): APIEmbed => this.createStatusEmbed(description),
      isThreadChannel: (channelType): boolean => this.isThreadChannel(channelType),
      setFixMetadata: async (messageId, metadata): Promise<void> => this.setFixMetadata(messageId, metadata),
      getFixMetadataWithRetry: async (messageId): Promise<FixFlowMetadata | null> =>
        this.getFixMetadataWithRetry(messageId),
      getRecentCustomGames: async (discordUserId, locale): Promise<MatchHistoryEntry[]> =>
        this.getRecentCustomGames(discordUserId, locale),
      toGameSelectOptions: (matches, selectedMatchIds): APISelectMenuOption[] =>
        this.toGameSelectOptions(matches, selectedMatchIds),
      deriveFixSeriesOutcome: (series): FixSeriesOutcome => this.deriveFixSeriesOutcome(series),
      parseFixSeriesOutcome: (value): FixSeriesOutcome => this.parseFixSeriesOutcome(value),
      getFixSeriesOutcomeLabel: (outcome, teams): string => this.getFixSeriesOutcomeLabel(outcome, teams),
      getFixSeriesOutcomeOptions: (teams, selectedOutcome): APISelectMenuOption[] =>
        this.getFixSeriesOutcomeOptions(teams, selectedOutcome),
      createSeriesEmbed: async (input): Promise<SeriesOverviewEmbedOutput> => this.createSeriesEmbed(input),
      getLinkedQueueSourceFromOverview: (
        message,
        guildId,
      ): { channelId: string; messageId?: string | undefined; url: string } | undefined =>
        this.getLinkedQueueSourceFromOverview(message, guildId),
      postSeriesEmbedsToThread: async (threadId, series, guildConfig, locale): Promise<void> =>
        this.postSeriesEmbedsToThread(threadId, series, guildConfig, locale),
      postGameStatsOrButton: async (threadId, series, guildConfig, locale): Promise<void> =>
        this.postGameStatsOrButton(threadId, series, guildConfig, locale),
      cacheDiscordSeriesStats: async (guildId, queueNumber, series, locale, isManualSeries): Promise<void> =>
        this.cacheDiscordSeriesStats(guildId, queueNumber, series, locale, isManualSeries),
      deleteMessagesInChunks: async (channelId, messageIds, reason): Promise<void> =>
        this.deleteMessagesInChunks(channelId, messageIds, reason),
    });
  }

  readonly commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.User,
      name: "Player stats",
      description: "",
      contexts: [InteractionContextType.Guild],
      default_member_permissions: null,
    },
    {
      type: ApplicationCommandType.User,
      name: "Compare stats",
      description: "",
      contexts: [InteractionContextType.Guild],
      default_member_permissions: null,
    },
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
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "manual",
          description: "Manually create series stats when NeatQueue did not post a result",
          options: [
            {
              type: ApplicationCommandOptionType.Integer,
              name: "queue_number",
              description: "The queue number, if the series came from a queue",
              required: false,
              min_value: 1,
              max_value: MANUAL_QUEUE_NUMBER_MIN - 1,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "player",
          description: "Pulls accumulated leaderboard stats for a player",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "user",
              description: "The player to show (defaults to you)",
              required: false,
            },
            {
              type: ApplicationCommandOptionType.Channel,
              name: "queue",
              description: "Configured NeatQueue channel (defaults to all configured queues)",
              channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
              required: false,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "window",
              description: "Leaderboard window (defaults to 3 months)",
              choices: [
                { name: "1 week", value: LeaderboardWindow.OneWeek },
                { name: "1 month", value: LeaderboardWindow.OneMonth },
                { name: "3 months", value: LeaderboardWindow.ThreeMonths },
                { name: "6 months", value: LeaderboardWindow.SixMonths },
                { name: "12 months", value: LeaderboardWindow.TwelveMonths },
              ],
              required: false,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "visible",
              description: "Who can see the response (defaults to private)",
              choices: [
                { name: "Public", value: "public" },
                { name: "Private", value: "private" },
              ],
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "compare",
          description: "Compares accumulated leaderboard stats between two players",
          options: [
            {
              type: ApplicationCommandOptionType.User,
              name: "player1",
              description: "The first player to compare",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.User,
              name: "player2",
              description: "The second player to compare",
              required: true,
            },
            {
              type: ApplicationCommandOptionType.String,
              name: "visible",
              description: "Who can see the response (defaults to private)",
              choices: [
                { name: "Public", value: "public" },
                { name: "Private", value: "private" },
              ],
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
          custom_id: PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID,
          values: [],
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
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.FixOutcomeSelect,
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
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.ManualQueueSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualQueuePreviousPage,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualQueueNextPage,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.UserSelect,
          custom_id: InteractionButton.ManualPlayerSelect,
          values: [],
          resolved: { users: {} },
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.ManualGamesSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionButton.ManualOutcomeSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualConfirm,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualSetQueueNumber,
        },
      },
      {
        type: InteractionType.ModalSubmit,
        data: {
          components: [],
          custom_id: InteractionButton.ManualQueueNumberModal,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionButton.ManualAdjustScore,
        },
      },
      {
        type: InteractionType.ModalSubmit,
        data: {
          components: [],
          custom_id: InteractionButton.ManualScoreModal,
        },
      },
    ];
  }

  protected handleInteraction(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    switch (type) {
      case InteractionType.ApplicationCommand: {
        if (isPlayerStatsUserCommand(interaction)) {
          return this.playerHandler.handleUserCommand(interaction);
        }

        if (isCompareStatsUserCommand(interaction)) {
          return this.compareHandler.handleUserCommand(interaction);
        }

        const subcommand = this.services.discordService.extractSubcommand(interaction, "stats");

        switch (subcommand.name) {
          case "neatqueue": {
            return this.neatQueueHandler.handleSubcommand(interaction, subcommand.mappedOptions);
          }
          case "match": {
            return this.matchHandler.handleMatchSubCommand(interaction, subcommand.mappedOptions);
          }
          case "fix": {
            return this.fixHandler.handleSubcommand(interaction, subcommand.mappedOptions);
          }
          case "manual": {
            return this.manualHandler.handleSubcommand(interaction, subcommand.mappedOptions);
          }
          case "player": {
            return this.playerHandler.handleSubcommand(interaction, subcommand.mappedOptions);
          }
          case "compare": {
            return this.compareHandler.handleSubcommand(interaction, subcommand.mappedOptions);
          }
          default: {
            throw new Error("Unknown subcommand");
          }
        }
      }
      case InteractionType.MessageComponent: {
        const { custom_id } = interaction.data;
        if (this.manualHandler.handlesComponent(custom_id)) {
          return this.manualHandler.handleComponent(interaction);
        }
        if (this.fixHandler.handlesComponent(custom_id)) {
          return this.fixHandler.handleComponent(interaction);
        }

        const compareCustomId = getPlayerCompareControlIdBase(custom_id);
        if (
          compareCustomId === PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID ||
          compareCustomId === PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID ||
          compareCustomId === PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID
        ) {
          return this.compareHandler.handleSelect(interaction as APIMessageComponentSelectMenuInteraction);
        }

        switch (custom_id) {
          case PLAYER_STATS_QUEUE_SELECT_CONTROL_ID: {
            return this.playerHandler.handleSelect(interaction as APIMessageComponentSelectMenuInteraction);
          }
          case PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID: {
            return this.playerHandler.handleSelect(interaction as APIMessageComponentSelectMenuInteraction);
          }
          case PLAYER_STATS_WINDOW_SELECT_CONTROL_ID: {
            return this.playerHandler.handleSelect(interaction as APIMessageComponentSelectMenuInteraction);
          }
          case InteractionButton.Retry.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.gamesHandler.retryJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.LoadGames.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.gamesHandler.loadGamesJob(interaction as APIMessageComponentButtonInteraction),
            };
          }

          default: {
            throw new Error(`Unknown interaction: ${custom_id}`);
          }
        }
      }
      case InteractionType.ModalSubmit: {
        if (this.manualHandler.handlesModal(interaction.data.custom_id)) {
          return this.manualHandler.handleModal(interaction);
        }

        throw new Error(`Unknown modal: ${interaction.data.custom_id}`);
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private async resolveSeriesThread(
    message: APIMessage,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
  ): Promise<APIChannel> {
    const { discordService, haloService } = this.services;
    const messageChannel = await discordService.getChannel(message.channel_id);

    if (
      [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(
        messageChannel.type,
      )
    ) {
      return messageChannel;
    }

    try {
      return await discordService.startThreadFromMessage(
        message.channel_id,
        message.id,
        `Queue #${queueNumber.toString()} series stats (${haloService.getSeriesScore(series, locale, true)})`,
      );
    } catch (error) {
      throw (
        toMissingPermissionsError(error, {
          action: "create a thread for the series stats",
          permissions: [discordService.permissionToString(PermissionFlagsBits.CreatePublicThreads)],
        }) ?? error
      );
    }
  }

  private async postSeriesStatsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
    allowLoadGamesButton = true,
    postedMessageIds?: string[],
    teamMappings?: ManualSeriesTeamMappings,
  ): Promise<void> {
    const { discordService } = this.services;

    try {
      await this.postSeriesEmbedsToThread(threadId, series, guildConfig, locale, postedMessageIds, teamMappings);
      await this.postGameStatsOrButton(threadId, series, guildConfig, locale, allowLoadGamesButton, postedMessageIds);
    } catch (error) {
      throw (
        toMissingPermissionsError(error, {
          action: "post the series stats",
          permissions: [
            discordService.permissionToString(PermissionFlagsBits.SendMessages),
            discordService.permissionToString(PermissionFlagsBits.SendMessagesInThreads),
          ],
        }) ?? error
      );
    }
  }

  private async postSeriesEmbedsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
    postedMessageIds?: string[],
    teamMappings?: ManualSeriesTeamMappings,
  ): Promise<void> {
    const { discordService, haloService } = this.services;

    const seriesTeamsEmbed = new SeriesTeamsEmbed({
      discordService,
      haloService,
      guildConfig,
      locale,
    });
    const teamStatsSeries = teamMappings == null ? series : mapManualSeriesToStableTeams(series, teamMappings);
    const seriesTeamsEmbedOutput = await seriesTeamsEmbed.getSeriesEmbed(teamStatsSeries);
    const seriesTeamsMessage = await discordService.createMessage(threadId, {
      embeds: [seriesTeamsEmbedOutput],
    });
    postedMessageIds?.push(seriesTeamsMessage.id);

    const seriesPlayersEmbed = new SeriesPlayersEmbed({ discordService, haloService, guildConfig, locale });
    const seriesPlayers = await haloService.getPlayerXuidsToGametags(series, { presentAtBeginningOnly: true });
    const seriesPlayersEmbedsOutput = await seriesPlayersEmbed.getSeriesEmbed(teamStatsSeries, seriesPlayers, locale);
    for (const seriesPlayersEmbedOutput of seriesPlayersEmbedsOutput) {
      const seriesPlayersMessage = await discordService.createMessage(threadId, {
        embeds: [seriesPlayersEmbedOutput],
      });
      postedMessageIds?.push(seriesPlayersMessage.id);
    }
  }

  private async postGameStatsOrButton(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
    allowLoadGamesButton = true,
    postedMessageIds?: string[],
  ): Promise<void> {
    const { discordService, haloService } = this.services;

    if (guildConfig.StatsReturn === StatsReturnType.SERIES_ONLY && allowLoadGamesButton) {
      const loadGamesMessage = await discordService.createMessage(threadId, {
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
      postedMessageIds?.push(loadGamesMessage.id);
    } else {
      for (const match of series) {
        const players = await haloService.getPlayerXuidsToGametags(match, { presentAtBeginningOnly: true });
        const matchEmbed = createMatchEmbed(this.handlerContext, guildConfig, match, locale);
        const embed = await matchEmbed.getEmbed(match, players);

        const gameStatsMessage = await discordService.createMessage(threadId, { embeds: [embed] });
        postedMessageIds?.push(gameStatsMessage.id);
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
    queueData: Omit<QueueData, "timestamp">;
    series: MatchStats[];
  }): Promise<SeriesOverviewEmbedOutput> {
    const { discordService, haloService } = this.services;
    const seriesOverview = new SeriesOverviewEmbed({ discordService, haloService });
    const isNeatQueueResult = queueData.message.author.id === NEAT_QUEUE_BOT_USER_ID;
    const linkedSource = this.getLinkedQueueSourceFromOverview(queueData.message, guildId);
    const sourceUrl =
      linkedSource != null &&
      (linkedSource.channelId !== queueData.message.channel_id || linkedSource.messageId !== queueData.message.id)
        ? linkedSource.url
        : undefined;
    const seriesEmbed = await seriesOverview.getEmbed({
      guildId,
      channelId,
      ...(isNeatQueueResult ? { messageId: queueData.message.id } : { sourceUrl }),
      pagesUrl: this.env.PAGES_URL,
      locale,
      queue: queueData.queue,
      series,
      finalTeams: queueData.teams.map((team) => ({
        name: team.name,
        playerIds: team.players.map(({ user: { id } }) => id),
        unlinkedGamertags: team.unlinkedGamertags,
      })),
      substitutions: [],
      hideTeamsDescription: false,
    });

    return seriesEmbed;
  }

  private async cacheDiscordSeriesStats(
    guildId: string,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
    isManualSeries = false,
    seriesScore?: string,
  ): Promise<void> {
    const { discordService, haloService, logService } = this.services;

    try {
      const renderData = await buildDiscordSeriesRenderDataFromMatches({
        discordService,
        logService,
        haloService,
        guildId,
        queueNumber,
        matches: series,
        locale,
        isManualSeries,
        seriesScore,
      });

      await discordService.cacheResolvedDiscordSeriesStats({
        guildId,
        queueNumber,
        matchIds: renderData.matches.map((match) => match.matchId),
        renderData,
      });
    } catch (error) {
      logService.warn(
        error,
        new Map([
          ["guildId", guildId],
          ["queueNumber", queueNumber.toString()],
          ["reason", "Failed to cache discord series stats directly"],
        ]),
      );
    }
  }

  private createFixCancelActionRow(): APIMessageTopLevelComponent {
    return {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          custom_id: InteractionButton.FixCancel,
          label: "Cancel",
          style: ButtonStyle.Secondary,
        },
      ],
    };
  }

  private async getRecentCustomGames(discordUserId: string, locale: string): Promise<MatchHistoryEntry[]> {
    const { databaseService, haloService } = this.services;

    const [association] = await databaseService.getDiscordAssociations([discordUserId]);
    if (association?.XboxId == null || association.XboxId === "") {
      throw new EndUserError("That player does not have a linked Xbox account.");
    }

    const [user] = await haloService.getUsersByXuids([association.XboxId]);
    if (user == null) {
      throw new EndUserError("Could not find a Halo account for that player.");
    }

    const matchHistory = await haloService.getEnrichedMatchHistory(user.gamertag, locale, MatchType.Custom, 25);
    if (matchHistory.matches.length === 0) {
      throw new EndUserError("No recent custom games were found for that player.");
    }

    return matchHistory.matches;
  }

  private toGameSelectOptions(
    matches: readonly MatchHistoryEntry[],
    preselectedMatchIds: ReadonlySet<string>,
  ): APISelectMenuOption[] {
    return matches.map<APISelectMenuOption>((match) => {
      const label = this.getFixGameSelectionLabel(match.modeName, match.mapName, match.resultString);
      return {
        label: label.slice(0, 100),
        value: match.matchId,
        description: this.getFixGameSelectionDescription(match.endTime, match.endTimeIso).slice(0, 100),
        default: preselectedMatchIds.has(match.matchId),
      };
    });
  }

  private getFixGameSelectionLabel(modeName: string, mapName: string, result: string): string {
    return `${modeName} ${mapName} - ${result}`;
  }

  private getFixGameSelectionDescription(endTime: string, endTimeIso: string): string {
    if (endTimeIso === "") {
      return `Ended at ${endTime}`;
    }

    const endDate = new Date(endTimeIso);
    if (Number.isNaN(endDate.getTime())) {
      return `Ended at ${endTime}`;
    }

    const absoluteUtc = `${endDate.toISOString().replace("T", " ").slice(0, 16)} UTC`;
    if (endDate.getTime() > Date.now()) {
      return `Ended at ${absoluteUtc}`;
    }

    const relative = formatDistanceToNowStrict(endDate, { addSuffix: true });
    return `Ended ${relative} (${absoluteUtc})`;
  }

  private deriveFixSeriesOutcome(series: MatchStats[]): FixSeriesOutcome {
    const entries = series.map((match) => ({
      startTime: match.MatchInfo.StartTime,
      mapAssetId: match.MatchInfo.MapVariant.AssetId,
      mapVersionId: match.MatchInfo.MapVariant.VersionId,
      gameVariantCategory: match.MatchInfo.GameVariantCategory,
      teamOutcomes: match.Teams.map((team) => team.Outcome),
    }));
    const winsByTeam = computeSeriesTeamWins(entries);
    const team0Wins = winsByTeam[0] ?? 0;
    const team1Wins = winsByTeam[1] ?? 0;

    if (team0Wins === team1Wins) {
      return "TIE";
    }

    return team0Wins > team1Wins ? "TEAM_0" : "TEAM_1";
  }

  private parseFixSeriesOutcome(value: string): FixSeriesOutcome {
    switch (value) {
      case "TEAM_0":
      case "TEAM_1":
      case "TIE": {
        return value;
      }
      default: {
        throw new EndUserError("Invalid series outcome selection. Please run /stats fix again.");
      }
    }
  }

  private getFixSeriesOutcomeOptions(
    teams: readonly { name: string }[],
    selectedSeriesOutcome: FixSeriesOutcome | undefined,
  ): APISelectMenuOption[] {
    const firstTeamName = this.getFixSeriesOutcomeTeamName(teams, 0);
    const secondTeamName = this.getFixSeriesOutcomeTeamName(teams, 1);

    return [
      {
        label: `${firstTeamName} wins`.slice(0, 100),
        value: "TEAM_0",
        default: selectedSeriesOutcome === "TEAM_0",
      },
      {
        label: `${secondTeamName} wins`.slice(0, 100),
        value: "TEAM_1",
        default: selectedSeriesOutcome === "TEAM_1",
      },
      {
        label: "Tie",
        value: "TIE",
        default: selectedSeriesOutcome === "TIE",
      },
    ];
  }

  private getFixSeriesOutcomeLabel(seriesOutcome: FixSeriesOutcome, teams: readonly { name: string }[]): string {
    switch (seriesOutcome) {
      case "TEAM_0": {
        return `${this.getFixSeriesOutcomeTeamName(teams, 0)} wins`;
      }
      case "TEAM_1": {
        return `${this.getFixSeriesOutcomeTeamName(teams, 1)} wins`;
      }
      case "TIE": {
        return "Tie";
      }
      default: {
        throw new UnreachableError(seriesOutcome);
      }
    }
  }

  private getFixSeriesOutcomeTeamName(teams: readonly { name: string }[], teamIndex: 0 | 1): string {
    const teamName = Preconditions.checkExists(teams[teamIndex], "Expected series team").name;
    return teamName.replaceAll(/[*_~`|]/g, "");
  }

  /**
   * Mirrors NeatQueue series posting, falling back to a channel post if the result thread can't be started.
   */

  /**
   * Channel-mode failures post the error straight into the post channel rather than a thread.
   */

  private getLinkedQueueSourceFromOverview(
    message: APIMessage,
    guildId: string,
  ): { channelId: string; messageId?: string | undefined; url: string } | undefined {
    for (const embed of message.embeds) {
      const { url } = embed;
      const match = /^https:\/\/discord\.com\/channels\/(\d+)\/(\d+)(?:\/(\d+))?$/.exec(url ?? "");
      if (match?.[1] === guildId && match[2] != null) {
        return {
          channelId: match[2],
          ...(match[3] == null ? {} : { messageId: match[3] }),
          url: Preconditions.checkExists(url),
        };
      }
    }
    return undefined;
  }

  private createStatusEmbed(description: string): APIEmbed {
    return {
      color: EmbedColors.NEUTRAL,
      description,
    };
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

  private async getFixMetadataWithRetry(messageId: string): Promise<FixFlowMetadata | null> {
    return this.getInteractionMetadataWithRetry<FixFlowMetadata>(this.fixMetadataKey(messageId));
  }

  private async setManualMetadata(messageId: string, metadata: ManualFlowMetadata): Promise<void> {
    await this.services.discordService.setInteractionMetadata(this.manualMetadataKey(messageId), metadata);
  }

  private async getManualMetadataWithRetry(messageId: string): Promise<ManualFlowMetadata> {
    const metadata = await this.getInteractionMetadataWithRetry<ManualFlowMetadata>(this.manualMetadataKey(messageId));
    if (metadata == null) {
      throw new EndUserError("Could not find manual stats state. Please run /stats manual again.");
    }

    return metadata;
  }

  private async getInteractionMetadataWithRetry<T extends Record<string, unknown>>(key: string): Promise<T | null> {
    for (let attempt = 0; attempt <= FIX_METADATA_MAX_RETRIES; attempt += 1) {
      const metadata = await this.services.discordService.getInteractionMetadata<T>(key);
      if (metadata != null) {
        return metadata;
      }

      if (attempt === FIX_METADATA_MAX_RETRIES) {
        break;
      }

      const delayMilliseconds = FIX_METADATA_RETRY_BASE_DELAY_MS * (attempt + 1);
      await this.wait(delayMilliseconds);
    }

    return null;
  }

  private async wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  private fixMetadataKey(messageId: string): string {
    return `statsFix:${messageId}`;
  }

  private manualMetadataKey(messageId: string): string {
    return `statsManual:${messageId}`;
  }

  private async deleteMessagesInChunks(channelId: string, messageIds: string[], reason: string): Promise<void> {
    const { discordService, logService } = this.services;

    for (let start = 0; start < messageIds.length; start += 100) {
      const chunk = messageIds.slice(start, start + 100);
      if (chunk.length === 0) {
        continue;
      }
      if (chunk.length === 1) {
        await discordService.deleteMessage(channelId, Preconditions.checkExists(chunk[0]), reason);
        continue;
      }
      try {
        await discordService.bulkDeleteMessages(channelId, chunk, reason);
      } catch (error) {
        logService.warn(
          error,
          new Map([
            ["channelId", channelId],
            ["messageCount", chunk.length.toString()],
            ["reason", "Bulk delete failed, falling back to per-message delete"],
          ]),
        );
        for (const messageId of chunk) {
          await discordService.deleteMessage(channelId, messageId, reason);
        }
      }
    }
  }
}
