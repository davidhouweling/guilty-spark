import type {
  APIApplicationCommandInteraction,
  APIButtonComponentWithCustomId,
  APIInteractionResponse,
  APIModalInteractionResponseCallbackData,
  APIModalSubmitInteraction,
  APIApplicationCommandInteractionDataBasicOption,
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
  MessageFlags,
  InteractionContextType,
  PermissionFlagsBits,
  ButtonStyle,
  SelectMenuDefaultValueType,
  TextInputStyle,
} from "discord-api-types/v10";
import { MatchType } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { formatDistanceToNowStrict, subHours } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { computeSeriesTeamWins } from "@guilty-spark/shared/halo/series-score";
import { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { BaseInteraction, ExecuteResponse, ApplicationCommandData, CommandData } from "../base/base-command";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import type {
  ExistingSeriesStatsThreadLocation,
  PreservedMessageContent,
  QueueData,
} from "../../services/discord/discord";
import { SeriesPlayersEmbed } from "../../embeds/stats/series-players-embed";
import { SeriesOverviewEmbed } from "../../embeds/stats/series-overview-embed";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import { SeriesTeamsEmbed } from "../../embeds/stats/series-teams-embed";
import {
  mapManualSeriesToStableTeams,
  resolveManualSeriesTeamMappings,
} from "../../services/halo/manual-series-team-mapping";
import type { ManualSeriesTeamMappings } from "../../services/halo/manual-series-team-mapping";
import {
  buildDiscordSeriesRenderDataFromMatches,
  extractDiscordSeriesMatchIdsFromEmbeds,
  extractQueueNumberFromSeriesOverviewEmbed,
} from "../../services/discord/discord-series-stats";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import { StatsReturnType } from "../../services/database/types/guild_config";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import { NeatQueuePostSeriesDisplayMode } from "../../services/database/types/neat_queue_config";
import { EmbedColors } from "../../embeds/colors";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import { toMissingPermissionsError } from "../../base/missing-permissions-error";
import {
  ALL_QUEUES_VALUE,
  PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
  PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
} from "../../embeds/stats/player-stats-embed";
import {
  PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_COMPARE_HEAD_TO_HEAD_VALUE,
  PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
  PLAYER_COMPARE_TEMPORARY_ERROR_FOOTER,
  PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID,
  createPlayerCompareLoadingResponse,
  createPlayerCompareNoQualifyingGamesResponse,
  getPlayerCompareControlIdBase,
  getPlayerCompareStateFromMessage,
  parsePlayerCompareAggregation,
} from "../../embeds/stats/player-compare-embed";
import type { PlayerCompareViewState } from "../../embeds/stats/player-compare-embed";
import type { MatchHistoryEntry } from "../../services/halo/types";
import { StatsCompareEntryCommand } from "./stats-compare-entry-command";
import {
  MANUAL_QUEUE_NUMBER_MIN,
  allocateManualQueueNumber,
  deriveManualSeriesTeams,
  findGuildMemberIdForGamertag,
  formatManualSeriesScore,
  getManualSeriesFinalMatch,
  getManualSeriesPlayerXuids,
  getOutcomeForManualSeriesScore,
  parseManualSeriesGamesWon,
  toSeriesOverviewTeams,
} from "./manual-series";
import type { ManualSeriesScore, ManualSeriesTeam } from "./manual-series";

interface FixFlowMetadata extends Record<string, unknown> {
  guildId: string;
  channelId: string;
  sourceKind?: FixSeriesSourceKind | undefined;
  isManualSeries?: boolean | undefined;
  // timestamp is a Date at fetch time but becomes a string after the JSON round-trip through KV, so it's omitted here
  queueData: Omit<QueueData, "timestamp">;
  selectedPlayerId?: string;
  selectedMatchIds?: string[];
  selectedSeriesOutcome?: FixSeriesOutcome;
}

type FixSeriesSourceKind = "neatqueue-result" | "series-overview";

interface FixSeriesSource {
  queueData: QueueData;
  channelId: string;
  sourceKind: FixSeriesSourceKind;
  isManualSeries: boolean;
}

type FixSeriesOutcome = "TEAM_0" | "TEAM_1" | "TIE";

function isManualSeriesOverview(message: APIMessage): boolean {
  return message.embeds.some((embed) => embed.fields?.some((field) => field.name === "Created manually by") === true);
}

interface ManualFlowMetadata extends Record<string, unknown> {
  guildId: string;
  channelId: string;
  queueNumber: number;
  queueChannelId: string | null;
  queuePage?: number | undefined;
  selectedPlayerId?: string | undefined;
  selectedMatchIds?: string[] | undefined;
  teams?: ManualSeriesTeam[] | undefined;
  selectedSeriesOutcome?: FixSeriesOutcome | undefined;
  seriesScore?: ManualSeriesScore | undefined;
}

const FIX_METADATA_RETRY_BASE_DELAY_MS = 150;
const FIX_METADATA_MAX_RETRIES = 3;
const MANUAL_QUEUE_SELECT_PAGE_SIZE = 25;
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

export enum InteractionButton {
  Retry = "btn_stats_retry",
  LoadGames = "btn_stats_load_games",
  FixPlayerSelect = "btn_stats_fix_player_select",
  FixGamesSelect = "btn_stats_fix_games_select",
  FixOutcomeSelect = "btn_stats_fix_outcome_select",
  FixConfirm = "btn_stats_fix_confirm",
  FixCancel = "btn_stats_fix_cancel",
  ManualQueueSelect = "btn_stats_manual_queue_select",
  ManualQueuePreviousPage = "btn_stats_manual_queue_previous_page",
  ManualQueueNextPage = "btn_stats_manual_queue_next_page",
  ManualPlayerSelect = "btn_stats_manual_player_select",
  ManualGamesSelect = "btn_stats_manual_games_select",
  ManualOutcomeSelect = "btn_stats_manual_outcome_select",
  ManualConfirm = "btn_stats_manual_confirm",
  ManualSetQueueNumber = "btn_stats_manual_set_queue_number",
  ManualQueueNumberModal = "btn_stats_manual_queue_number_modal",
  ManualAdjustScore = "btn_stats_manual_adjust_score",
  ManualScoreModal = "btn_stats_manual_score_modal",
}

export class StatsCommand extends StatsCompareEntryCommand {
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
          return this.handlePlayerStatsUserCommand(interaction);
        }

        if (isCompareStatsUserCommand(interaction)) {
          return this.handleCompareStatsUserCommand(interaction);
        }

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
          case "manual": {
            return this.handleManualSubCommand(interaction, subcommand.mappedOptions);
          }
          case "player": {
            return this.handlePlayerSubCommand(interaction, subcommand.mappedOptions);
          }
          case "compare": {
            return this.handleCompareSubCommand(interaction, subcommand.mappedOptions);
          }
          default: {
            throw new Error("Unknown subcommand");
          }
        }
      }
      case InteractionType.MessageComponent: {
        const { custom_id } = interaction.data;
        const compareCustomId = getPlayerCompareControlIdBase(custom_id);
        if (
          compareCustomId === PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID ||
          compareCustomId === PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID ||
          compareCustomId === PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID
        ) {
          return this.handleCompareSelect(interaction as APIMessageComponentSelectMenuInteraction);
        }

        switch (custom_id) {
          case PLAYER_STATS_QUEUE_SELECT_CONTROL_ID: {
            return this.handlePlayerStatsSelect(interaction as APIMessageComponentSelectMenuInteraction);
          }
          case PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID: {
            return this.handlePlayerStatsSelect(interaction as APIMessageComponentSelectMenuInteraction);
          }
          case PLAYER_STATS_WINDOW_SELECT_CONTROL_ID: {
            return this.handlePlayerStatsSelect(interaction as APIMessageComponentSelectMenuInteraction);
          }
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
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Fetching recent custom games...")],
                  components: [],
                },
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
          case InteractionButton.FixOutcomeSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () =>
                this.handleFixOutcomeSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
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
          case InteractionButton.ManualQueueSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Loading recent custom games...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualQueueSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.ManualQueuePreviousPage.toString():
          case InteractionButton.ManualQueueNextPage.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Loading queue selection...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualQueuePageJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.ManualPlayerSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Fetching recent custom games...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualPlayerSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.ManualGamesSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Generating series preview...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualGamesSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.ManualOutcomeSelect.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Updating series preview...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualOutcomeSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
            };
          }
          case InteractionButton.ManualConfirm.toString(): {
            return {
              response: {
                type: InteractionResponseType.UpdateMessage,
                data: {
                  embeds: [this.createStatusEmbed("Posting series stats...")],
                  components: [],
                },
              },
              jobToComplete: async () =>
                this.handleManualConfirmJob(interaction as APIMessageComponentButtonInteraction),
            };
          }
          case InteractionButton.ManualSetQueueNumber.toString(): {
            return { response: this.createManualQueueNumberModal() };
          }
          case InteractionButton.ManualAdjustScore.toString(): {
            return { response: this.createManualScoreModal() };
          }
          default: {
            throw new Error(`Unknown interaction: ${custom_id}`);
          }
        }
      }
      case InteractionType.ModalSubmit: {
        if (interaction.data.custom_id === InteractionButton.ManualQueueNumberModal.toString()) {
          return this.handleManualQueueNumberModal(interaction);
        }

        if (interaction.data.custom_id === InteractionButton.ManualScoreModal.toString()) {
          return this.handleManualScoreModal(interaction);
        }

        throw new Error(`Unknown modal: ${interaction.data.custom_id}`);
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private handleCompareSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    if (!this.isPlayerStatsCommandInvoker(interaction)) {
      const warning = new EndUserError("Only the person who called the command can use this stats embed.", {
        title: "Stats embed locked",
        errorType: EndUserErrorType.WARNING,
      });
      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            embeds: [warning.discordEmbed],
            flags: MessageFlags.Ephemeral,
          },
        },
      };
    }

    switch (getPlayerCompareControlIdBase(interaction.data.custom_id)) {
      case PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID: {
        return this.handleCompareQueueSelect(interaction);
      }
      case PLAYER_COMPARE_AGGREGATION_SELECT_CONTROL_ID: {
        return this.handleCompareAggregationSelect(interaction);
      }
      case PLAYER_COMPARE_WINDOW_SELECT_CONTROL_ID: {
        return this.handleCompareWindowSelect(interaction);
      }
      default: {
        throw new Error(`Unexpected compare stats control: ${interaction.data.custom_id}`);
      }
    }
  }

  private handleCompareQueueSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createCompareSelectResponse(interaction, (state) => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A queue must be selected.");
      }

      return { ...state, queueChannelId: selectedValue === ALL_QUEUES_VALUE ? null : selectedValue };
    });
  }

  private handleCompareAggregationSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createCompareSelectResponse(interaction, (state): PlayerCompareViewState => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A stats type must be selected.");
      }

      if (selectedValue === PLAYER_COMPARE_HEAD_TO_HEAD_VALUE) {
        return { ...state, aggregation: null, headToHead: true };
      }

      const aggregation = parsePlayerCompareAggregation(selectedValue);
      if (aggregation == null) {
        throw new EndUserError("The selected stats type is invalid.");
      }

      return { ...state, aggregation, headToHead: false };
    });
  }

  private handleCompareWindowSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    return this.createCompareSelectResponse(interaction, (state) => {
      const [selectedValue] = interaction.data.values;
      if (selectedValue == null) {
        throw new EndUserError("A window must be selected.");
      }

      return { ...state, window: this.parsePlayerWindow(selectedValue) };
    });
  }

  private createCompareSelectResponse(
    interaction: APIMessageComponentSelectMenuInteraction,
    stateUpdater: (state: PlayerCompareViewState) => PlayerCompareViewState,
  ): ExecuteResponse {
    const pendingState = this.tryResolveComparePendingState(interaction, stateUpdater);

    if (pendingState == null) {
      return {
        response: { type: InteractionResponseType.DeferredMessageUpdate },
        jobToComplete: async (): Promise<void> => {
          await this.executeCompareStateInteraction(interaction, () => {
            const currentState = getPlayerCompareStateFromMessage(interaction.message);
            if (currentState == null) {
              throw new EndUserError("This stats view has expired. Run /stats compare again.");
            }

            return stateUpdater(currentState);
          });
        },
      };
    }

    const resolvedState = pendingState;
    return {
      response: { type: InteractionResponseType.DeferredMessageUpdate },
      jobToComplete: async (): Promise<void> => {
        await this.showLoadingState(
          interaction,
          createPlayerCompareLoadingResponse(
            interaction.message,
            resolvedState,
            this.services.discordService.getLoadingEmoji(),
          ),
        );
        await this.executeCompareStateInteraction(interaction, () => resolvedState);
      },
    };
  }

  private tryResolveComparePendingState(
    interaction: APIMessageComponentSelectMenuInteraction,
    stateUpdater: (state: PlayerCompareViewState) => PlayerCompareViewState,
  ): PlayerCompareViewState | null {
    try {
      const currentState = getPlayerCompareStateFromMessage(interaction.message);
      return currentState == null ? null : stateUpdater(currentState);
    } catch {
      return null;
    }
  }

  private async executeCompareStateInteraction(
    interaction: APIMessageComponentSelectMenuInteraction,
    resolveState: () => PlayerCompareViewState,
  ): Promise<void> {
    try {
      const state = resolveState();
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: guildId });
      const response = await this.createPlayerCompareResponse({
        guildId,
        xboxXuid1: state.xboxXuid1,
        xboxXuid2: state.xboxXuid2,
        queueChannelId: state.queueChannelId,
        configuredQueues,
        aggregation: state.aggregation,
        headToHead: state.headToHead,
        window: state.window,
        locale: interaction.guild_locale ?? interaction.locale,
      });

      if (response == null) {
        await this.services.discordService.updateDeferredReply(
          interaction.token,
          createPlayerCompareNoQualifyingGamesResponse(interaction.message, state),
        );
        return;
      }

      await this.services.discordService.updateDeferredReply(interaction.token, response);
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error, {
        preserveMessage: interaction.message,
        errorEmbedFooter: PLAYER_COMPARE_TEMPORARY_ERROR_FOOTER,
      });
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
    let seriesOverviewContent: PreservedMessageContent | undefined;

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
      seriesOverviewContent = seriesEmbed;

      await this.cacheDiscordSeriesStats(guildId, queueData.queue, series, locale);

      const seriesOverviewMessage = await discordService.getMessageFromInteractionToken(interaction.token);
      const thread = await this.resolveSeriesThread(seriesOverviewMessage, queueData.queue, series, locale);

      await this.postSeriesStatsToThread(thread.id, series, guildConfig, locale);

      await haloService.updateDiscordAssociations();
    } catch (error) {
      if (error instanceof EndUserError && computedQueue != null && endDateTime != null) {
        error.appendData({
          Channel: `<#${channelId}>`,
          Queue: computedQueue.toString(),
          Completed: discordService.getTimestamp(endDateTime.toISOString()),
        });
      }
      await discordService.updateDeferredReplyWithError(interaction.token, error, {
        preserveMessage: seriesOverviewContent,
      });
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

  private async neatQueueSubCommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
    const { databaseService, discordService, haloService, logService, neatQueueService } = this.services;
    let previousEndUserError: EndUserError | undefined;
    let seriesOverviewContent: PreservedMessageContent | undefined;

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
        logService.error(error, new Map([["threadChannelId", threadChannelId]]));
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
        seriesOverviewContent = seriesEmbed;

        await this.cacheDiscordSeriesStats(guildId, queueData.queue, series, locale);

        await this.postSeriesStatsToThread(threadChannelId, series, guildConfig, locale);

        await haloService.updateDiscordAssociations();
      }
    } catch (error) {
      if (error instanceof EndUserError) {
        error.appendData(previousEndUserError?.data ?? {});
      }
      await discordService.updateDeferredReplyWithError(interaction.token, error, {
        preserveMessage: seriesOverviewContent,
      });
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
        const matchEmbed = this.getMatchEmbed(guildConfig, match, locale);
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

  private handleManualSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const queueNumber = options.get("queue_number");

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral },
      },
      jobToComplete: async () =>
        this.manualSubCommandJob(interaction, typeof queueNumber === "number" ? queueNumber : undefined),
    };
  }

  private async manualSubCommandJob(
    interaction: APIApplicationCommandInteraction,
    queueNumber: number | undefined,
  ): Promise<void> {
    const { databaseService, discordService } = this.services;

    try {
      const guildId = interaction.guild_id;
      if (guildId == null) {
        throw new EndUserError("This command can only be used inside a server.");
      }

      const metadata: ManualFlowMetadata = {
        guildId,
        channelId: interaction.channel.id,
        queueNumber: queueNumber ?? allocateManualQueueNumber(),
        queueChannelId: null,
        queuePage: 0,
      };

      if (queueNumber != null) {
        const configuredQueues = await databaseService.findNeatQueueConfig({ GuildId: guildId });
        if (configuredQueues.length > 1) {
          await this.showManualQueueSelect(interaction.token, metadata, configuredQueues);
          return;
        }

        metadata.queueChannelId = configuredQueues[0]?.ChannelId ?? null;
      }

      await this.showManualGamesForPlayer(
        interaction.token,
        interaction.guild_locale ?? interaction.locale,
        metadata,
        discordService.getDiscordUserId(interaction),
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async showManualQueueSelect(
    interactionToken: string,
    metadata: ManualFlowMetadata,
    configuredQueues: readonly NeatQueueConfigRow[],
  ): Promise<void> {
    const sortedQueues = [...configuredQueues].sort((left, right) => left.ChannelId.localeCompare(right.ChannelId));
    const pageCount = Math.ceil(sortedQueues.length / MANUAL_QUEUE_SELECT_PAGE_SIZE);
    const page = Math.min(metadata.queuePage ?? 0, pageCount - 1);
    const pageStart = page * MANUAL_QUEUE_SELECT_PAGE_SIZE;
    const queueChannelNames = await this.getQueueChannelNames(metadata.guildId, sortedQueues);
    const queueNavigationRow: APIMessageTopLevelComponent | null =
      pageCount > 1
        ? {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.ManualQueuePreviousPage,
                label: "Previous page",
                style: ButtonStyle.Secondary,
                disabled: page === 0,
              },
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.ManualQueueNextPage,
                label: "Next page",
                style: ButtonStyle.Secondary,
                disabled: page === pageCount - 1,
              },
            ],
          }
        : null;
    const message = await this.services.discordService.updateDeferredReply(interactionToken, {
      embeds: [
        this.createStatusEmbed(
          `Select which queue channel queue #${metadata.queueNumber.toString()} was from.${
            pageCount > 1 ? ` (page ${(page + 1).toString()} of ${pageCount.toString()})` : ""
          }`,
        ),
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.ManualQueueSelect,
              min_values: 1,
              max_values: 1,
              options: sortedQueues.slice(pageStart, pageStart + MANUAL_QUEUE_SELECT_PAGE_SIZE).map((queue) => ({
                label: this.getQueueOptionLabel(queue.ChannelId, queueChannelNames),
                value: queue.ChannelId,
              })),
            },
          ],
        },
        ...(queueNavigationRow == null ? [] : [queueNavigationRow]),
        this.createFixCancelActionRow(),
      ],
    });

    await this.setManualMetadata(message.id, { ...metadata, queuePage: page });
  }

  private async handleManualQueuePageJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService } = this.services;

    try {
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      const configuredQueues = await databaseService.findNeatQueueConfig({ GuildId: metadata.guildId });
      if (configuredQueues.length < 2) {
        throw new EndUserError("The configured queues have changed. Please run /stats manual again.");
      }

      const pageCount = Math.ceil(configuredQueues.length / MANUAL_QUEUE_SELECT_PAGE_SIZE);
      const pageDelta = interaction.data.custom_id === InteractionButton.ManualQueueNextPage.toString() ? 1 : -1;
      const queuePage = Math.max(0, Math.min((metadata.queuePage ?? 0) + pageDelta, pageCount - 1));

      await this.showManualQueueSelect(interaction.token, { ...metadata, queuePage }, configuredQueues);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleManualQueueSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { databaseService, discordService } = this.services;

    try {
      const queueChannelId = Preconditions.checkExists(interaction.data.values[0], "No queue selected");
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      const configuredQueues = await databaseService.findNeatQueueConfig({ GuildId: metadata.guildId });
      if (!configuredQueues.some((queue) => queue.ChannelId === queueChannelId)) {
        throw new EndUserError("The selected channel is not a configured NeatQueue channel.");
      }

      await this.showManualFlowStep(
        interaction.token,
        interaction.guild_locale ?? interaction.locale,
        { ...metadata, queueChannelId },
        discordService.getDiscordUserId(interaction),
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  /**
   * Returns to the preview when games were already chosen, otherwise to the games screen.
   */
  private async showManualFlowStep(
    interactionToken: string,
    locale: string,
    metadata: ManualFlowMetadata,
    fallbackPlayerId: string,
  ): Promise<void> {
    if (metadata.teams == null || metadata.selectedMatchIds == null) {
      await this.showManualGamesForPlayer(
        interactionToken,
        locale,
        metadata,
        metadata.selectedPlayerId ?? fallbackPlayerId,
      );
      return;
    }

    const series = await this.getManualSeriesMatches(metadata.selectedMatchIds);
    await this.showManualSeriesPreview(interactionToken, locale, {
      metadata,
      series,
      derivedSeriesOutcome: this.deriveManualSeriesOutcome(series),
    });
  }

  private createManualQueueNumberModal(): APIInteractionResponse {
    return {
      type: InteractionResponseType.Modal,
      data: {
        title: "Set queue number",
        custom_id: InteractionButton.ManualQueueNumberModal,
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.TextInput,
                custom_id: "queue_number",
                label: "Queue number",
                style: TextInputStyle.Short,
                min_length: 1,
                max_length: 9,
                placeholder: "e.g. 1234",
                required: true,
              },
            ],
          },
        ],
      },
    };
  }

  private handleManualQueueNumberModal(interaction: APIModalSubmitInteraction): ExecuteResponse {
    const rawQueueNumber = this.services.discordService.extractModalSubmitData(interaction).get("queue_number") ?? "";
    const queueNumber = /^\d+$/.test(rawQueueNumber.trim()) ? Number(rawQueueNumber.trim()) : Number.NaN;
    if (!Number.isInteger(queueNumber) || queueNumber < 1 || queueNumber >= MANUAL_QUEUE_NUMBER_MIN) {
      const warning = new EndUserError("The queue number must be a whole number between 1 and 999,999,999.", {
        title: "Invalid queue number",
        errorType: EndUserErrorType.WARNING,
      });
      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { embeds: [warning.discordEmbed], flags: MessageFlags.Ephemeral },
        },
      };
    }

    return {
      response: { type: InteractionResponseType.DeferredMessageUpdate },
      jobToComplete: async () => this.handleManualQueueNumberSubmitJob(interaction, queueNumber),
    };
  }

  private async handleManualQueueNumberSubmitJob(
    interaction: APIModalSubmitInteraction,
    queueNumber: number,
  ): Promise<void> {
    const { databaseService, discordService } = this.services;

    try {
      const messageId = Preconditions.checkExists(interaction.message, "Expected modal to come from a message").id;
      const metadata = await this.getManualMetadataWithRetry(messageId);
      const configuredQueues = await databaseService.findNeatQueueConfig({ GuildId: metadata.guildId });
      const updatedMetadata: ManualFlowMetadata = {
        ...metadata,
        queueNumber,
        queueChannelId: configuredQueues.length === 1 ? (configuredQueues[0]?.ChannelId ?? null) : null,
        queuePage: 0,
      };

      if (configuredQueues.length > 1) {
        await this.showManualQueueSelect(interaction.token, updatedMetadata, configuredQueues);
        return;
      }

      await this.showManualFlowStep(
        interaction.token,
        interaction.guild_locale ?? interaction.locale,
        updatedMetadata,
        discordService.getDiscordUserId(interaction),
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleManualPlayerSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      const playerId = Preconditions.checkExists(interaction.data.values[0], "No player selected");
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);

      await this.showManualGamesForPlayer(
        interaction.token,
        interaction.guild_locale ?? interaction.locale,
        metadata,
        playerId,
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  /**
   * Lookup problems (unlinked player, no custom games) keep the player picker visible so another player can be tried.
   */
  private async showManualGamesForPlayer(
    interactionToken: string,
    locale: string,
    metadata: ManualFlowMetadata,
    playerId: string,
  ): Promise<void> {
    let gameOptions: APISelectMenuOption[] = [];
    let status = `Select the custom games for this series from <@${playerId}>'s recent games, or pick a different player.`;
    try {
      gameOptions = this.toGameSelectOptions(await this.getRecentCustomGames(playerId, locale), new Set());
    } catch (error) {
      if (!(error instanceof EndUserError)) {
        throw error;
      }

      status = `${error.endUserMessage} Pick a different player.`;
    }

    const gamesSelectRow: APIMessageTopLevelComponent = {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: InteractionButton.ManualGamesSelect,
          min_values: 1,
          max_values: Math.min(gameOptions.length, 25),
          options: gameOptions,
        },
      ],
    };
    const message = await this.services.discordService.updateDeferredReply(interactionToken, {
      embeds: [this.createStatusEmbed(status)],
      components: [
        ...(gameOptions.length > 0 ? [gamesSelectRow] : []),
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.UserSelect,
              custom_id: InteractionButton.ManualPlayerSelect,
              placeholder: "Load games from a different player",
              min_values: 1,
              max_values: 1,
              default_values: [{ id: playerId, type: SelectMenuDefaultValueType.User }],
            },
          ],
        },
        this.createManualActionRow(metadata, []),
      ],
    });

    await this.setManualMetadata(message.id, { ...metadata, selectedPlayerId: playerId });
  }

  private async handleManualGamesSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      const selectedMatchIds = interaction.data.values;
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("Select at least one game.");
      }

      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      const series = await this.getManualSeriesMatches(selectedMatchIds);
      if (series.some((match) => match.Teams.length !== 2)) {
        throw new EndUserError("Manual series stats only support games between two teams.");
      }

      const teams = await this.resolveManualSeriesTeams(metadata.guildId, series);
      const derivedSeriesOutcome = this.deriveManualSeriesOutcome(series);
      await this.showManualSeriesPreview(interaction.token, interaction.guild_locale ?? interaction.locale, {
        metadata: { ...metadata, selectedMatchIds, teams, selectedSeriesOutcome: derivedSeriesOutcome ?? undefined },
        series,
        derivedSeriesOutcome,
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleManualOutcomeSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      const selectedSeriesOutcome = this.parseFixSeriesOutcome(
        Preconditions.checkExists(interaction.data.values[0], "No series outcome selected"),
      );
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      const series = await this.getManualSeriesMatches(metadata.selectedMatchIds ?? []);
      const seriesScore =
        metadata.seriesScore != null && getOutcomeForManualSeriesScore(metadata.seriesScore) === selectedSeriesOutcome
          ? metadata.seriesScore
          : undefined;

      await this.showManualSeriesPreview(interaction.token, interaction.guild_locale ?? interaction.locale, {
        metadata: { ...metadata, selectedSeriesOutcome, seriesScore },
        series,
        derivedSeriesOutcome: this.deriveManualSeriesOutcome(series),
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private createManualScoreModal(): APIInteractionResponse {
    const gamesWonInput = (
      customId: string,
      label: string,
    ): APIModalInteractionResponseCallbackData["components"][number] => ({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.TextInput,
          custom_id: customId,
          label,
          style: TextInputStyle.Short,
          min_length: 1,
          max_length: 2,
          placeholder: "e.g. 3",
          required: true,
        },
      ],
    });

    return {
      type: InteractionResponseType.Modal,
      data: {
        title: "Adjust final score",
        custom_id: InteractionButton.ManualScoreModal,
        components: [
          gamesWonInput("team0_wins", "🦅 Eagle games won"),
          gamesWonInput("team1_wins", "🐍 Cobra games won"),
        ],
      },
    };
  }

  private handleManualScoreModal(interaction: APIModalSubmitInteraction): ExecuteResponse {
    const values = this.services.discordService.extractModalSubmitData(interaction);
    const team0 = parseManualSeriesGamesWon(values.get("team0_wins") ?? "");
    const team1 = parseManualSeriesGamesWon(values.get("team1_wins") ?? "");
    if (team0 == null || team1 == null) {
      const warning = new EndUserError("Each team's games won must be a whole number between 0 and 99.", {
        title: "Invalid score",
        errorType: EndUserErrorType.WARNING,
      });
      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { embeds: [warning.discordEmbed], flags: MessageFlags.Ephemeral },
        },
      };
    }

    return {
      response: { type: InteractionResponseType.DeferredMessageUpdate },
      jobToComplete: async () => this.handleManualScoreSubmitJob(interaction, { team0, team1 }),
    };
  }

  private async handleManualScoreSubmitJob(
    interaction: APIModalSubmitInteraction,
    seriesScore: ManualSeriesScore,
  ): Promise<void> {
    const { discordService } = this.services;

    try {
      const messageId = Preconditions.checkExists(interaction.message, "Expected modal to come from a message").id;
      const metadata = await this.getManualMetadataWithRetry(messageId);
      const series = await this.getManualSeriesMatches(metadata.selectedMatchIds ?? []);

      await this.showManualSeriesPreview(interaction.token, interaction.guild_locale ?? interaction.locale, {
        metadata: { ...metadata, seriesScore, selectedSeriesOutcome: getOutcomeForManualSeriesScore(seriesScore) },
        series,
        derivedSeriesOutcome: this.deriveManualSeriesOutcome(series),
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private getManualSeriesScoreOverride(
    metadata: ManualFlowMetadata,
    locale: string,
    includeEmojis: boolean,
  ): string | undefined {
    return metadata.seriesScore == null
      ? undefined
      : formatManualSeriesScore(metadata.seriesScore, locale, includeEmojis);
  }

  /**
   * Best-effort mapping of the final game's players to Discord users: stored links first, then an exact guild member
   * name match, otherwise the gamertag is shown as-is.
   */
  private async resolveManualSeriesTeams(guildId: string, series: MatchStats[]): Promise<ManualSeriesTeam[]> {
    const { databaseService, haloService } = this.services;
    const mappings = resolveManualSeriesTeamMappings(series);
    const displaySeries = mappings == null ? series : mapManualSeriesToStableTeams(series, mappings);
    const finalMatch = Preconditions.checkExists(getManualSeriesFinalMatch(displaySeries), "Expected a final match");
    const xuids = getManualSeriesPlayerXuids(finalMatch);
    const [associations, xuidToGamertag] = await Promise.all([
      databaseService.getDiscordAssociationsByXboxId(xuids),
      haloService.getPlayerXuidsToGametags(finalMatch),
    ]);

    const xuidToDiscordId = new Map(associations.map((association) => [association.XboxId, association.DiscordId]));
    const assignedDiscordIds = new Set(xuidToDiscordId.values());
    const fallbackCandidates = new Map<string, string>();
    const candidateXuidsByDiscordId = new Map<string, Set<string>>();
    for (const xuid of xuids) {
      const gamertag = xuidToGamertag.get(xuid);
      if (xuidToDiscordId.has(xuid) || gamertag == null) {
        continue;
      }

      const discordId = await this.findGuildMemberIdForGamertag(guildId, gamertag);
      if (discordId == null) {
        continue;
      }

      fallbackCandidates.set(xuid, discordId);
      const candidateXuids = candidateXuidsByDiscordId.get(discordId) ?? new Set<string>();
      candidateXuids.add(xuid);
      candidateXuidsByDiscordId.set(discordId, candidateXuids);
    }

    for (const [xuid, discordId] of fallbackCandidates) {
      if (candidateXuidsByDiscordId.get(discordId)?.size !== 1 || assignedDiscordIds.has(discordId)) {
        continue;
      }

      xuidToDiscordId.set(xuid, discordId);
      assignedDiscordIds.add(discordId);
    }

    return deriveManualSeriesTeams(finalMatch, xuidToGamertag, xuidToDiscordId);
  }

  private async findGuildMemberIdForGamertag(guildId: string, gamertag: string): Promise<string | undefined> {
    try {
      const queries = [...new Set([gamertag, gamertag.replace(/\s/g, "")])];
      const searchResults = await Promise.all(
        queries.map(async (query) => this.services.discordService.searchGuildMembers(guildId, query)),
      );
      return findGuildMemberIdForGamertag(gamertag, searchResults.flat());
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["guildId", guildId],
          ["reason", "Failed to search guild members for manual series gamertag"],
        ]),
      );
    }

    return undefined;
  }

  private async getManualSeriesMatches(matchIds: readonly string[]): Promise<MatchStats[]> {
    if (matchIds.length === 0) {
      throw new EndUserError("No games were selected. Please run /stats manual again.");
    }

    const series = await this.services.haloService.getMatchDetails([...matchIds]);
    if (series.length === 0) {
      throw new EndUserError("No match details found for the selected games.");
    }

    return series;
  }

  private deriveManualSeriesOutcome(series: MatchStats[]): FixSeriesOutcome | null {
    const orderedSeries = [...series].sort((left, right) =>
      left.MatchInfo.StartTime.localeCompare(right.MatchInfo.StartTime),
    );
    const mappings = resolveManualSeriesTeamMappings(orderedSeries);
    if (mappings == null) {
      return null;
    }
    return this.deriveFixSeriesOutcome(mapManualSeriesToStableTeams(orderedSeries, mappings));
  }

  private async showManualSeriesPreview(
    interactionToken: string,
    locale: string,
    {
      metadata,
      series,
      derivedSeriesOutcome,
    }: { metadata: ManualFlowMetadata; series: MatchStats[]; derivedSeriesOutcome: FixSeriesOutcome | null },
  ): Promise<void> {
    const { discordService, haloService } = this.services;
    const teams = Preconditions.checkExists(metadata.teams, "Expected manual series teams");
    const selectedSeriesOutcome = metadata.selectedSeriesOutcome ?? derivedSeriesOutcome ?? undefined;
    const derivedResultLabel =
      derivedSeriesOutcome == null
        ? "Could not determine automatically"
        : this.getFixSeriesOutcomeLabel(derivedSeriesOutcome, teams);
    const selectedResultLabel =
      selectedSeriesOutcome == null
        ? "Select a final result"
        : this.getFixSeriesOutcomeLabel(selectedSeriesOutcome, teams);
    const teamMappings = resolveManualSeriesTeamMappings(series);
    const displaySeries = teamMappings == null ? series : mapManualSeriesToStableTeams(series, teamMappings);
    const seriesEmbed = await this.createManualSeriesEmbed(metadata, displaySeries, locale);
    const derivedScore = haloService.getSeriesScore(displaySeries, locale, true);
    const finalScore = this.getManualSeriesScoreOverride(metadata, locale, true) ?? derivedScore;

    const message = await discordService.updateDeferredReply(interactionToken, {
      embeds: [
        this.createStatusEmbed(
          `Preview generated. Adjust the final result or score if needed, then confirm to post the series stats.\nDerived result: ${derivedResultLabel} (${derivedScore})\nFinal result: ${selectedResultLabel} (${finalScore})`,
        ),
        ...seriesEmbed.embeds,
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.ManualOutcomeSelect,
              min_values: 1,
              max_values: 1,
              options: this.getFixSeriesOutcomeOptions(teams, selectedSeriesOutcome),
            },
          ],
        },
        this.createManualActionRow(metadata, [
          {
            type: ComponentType.Button,
            custom_id: InteractionButton.ManualConfirm,
            label: "Confirm",
            style: ButtonStyle.Success,
          },
          {
            type: ComponentType.Button,
            custom_id: InteractionButton.ManualAdjustScore,
            label: "Adjust score",
            style: ButtonStyle.Primary,
          },
        ]),
      ],
    });

    await this.setManualMetadata(message.id, { ...metadata, selectedSeriesOutcome });
  }

  private async createManualSeriesEmbed(
    metadata: ManualFlowMetadata,
    series: MatchStats[],
    locale: string,
    queueChannelId?: string,
  ): Promise<SeriesOverviewEmbedOutput> {
    const { discordService, haloService } = this.services;
    return new SeriesOverviewEmbed({ discordService, haloService }).getEmbed({
      guildId: metadata.guildId,
      channelId: metadata.channelId,
      ...(queueChannelId == null
        ? {}
        : { sourceUrl: `https://discord.com/channels/${metadata.guildId}/${queueChannelId}` }),
      pagesUrl: this.env.PAGES_URL,
      locale,
      queue: metadata.queueNumber,
      series,
      finalTeams: toSeriesOverviewTeams(Preconditions.checkExists(metadata.teams, "Expected manual series teams")),
      substitutions: [],
      hideTeamsDescription: false,
      seriesScore: this.getManualSeriesScoreOverride(metadata, locale, true),
    });
  }

  private async handleManualConfirmJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const metadata = await this.getManualMetadataWithRetry(interaction.message.id);
      if (metadata.selectedSeriesOutcome == null) {
        throw new EndUserError("No final series result was selected. Please run /stats manual again.");
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const [guildConfig, series, queueConfig] = await Promise.all([
        databaseService.getGuildConfig(metadata.guildId),
        this.getManualSeriesMatches(metadata.selectedMatchIds ?? []),
        this.findManualQueueConfig(metadata),
      ]);
      const teamMappings = resolveManualSeriesTeamMappings(series);
      const displaySeries = teamMappings == null ? series : mapManualSeriesToStableTeams(series, teamMappings);

      await discordService.cacheDiscordSeriesMatchIds(
        metadata.guildId,
        metadata.queueNumber,
        series.map((match) => match.MatchId),
      );

      const seriesEmbed = await this.createManualSeriesEmbed(metadata, displaySeries, locale, queueConfig?.ChannelId);
      const overviewEmbed = Preconditions.checkExists(seriesEmbed.embeds[0]);
      overviewEmbed.fields ??= [];
      overviewEmbed.fields.push({
        name: "Final series result",
        value: this.getFixSeriesOutcomeLabel(metadata.selectedSeriesOutcome, Preconditions.checkExists(metadata.teams)),
        inline: false,
      });
      overviewEmbed.fields.push({
        name: "Created manually by",
        value: `<@${discordService.getDiscordUserId(interaction)}> on ${discordService.getTimestamp(new Date().toISOString())}`,
        inline: false,
      });

      const publication = await this.postManualSeriesOverview({
        postChannelId: this.isThreadChannel((await discordService.getChannel(metadata.channelId)).type)
          ? metadata.channelId
          : (queueConfig?.PostSeriesChannelId ?? queueConfig?.ResultsChannelId ?? metadata.channelId),
        seriesEmbed,
        threadName: `Queue #${metadata.queueNumber.toString()} series stats (${this.getManualSeriesScoreOverride(metadata, locale, true) ?? haloService.getSeriesScore(displaySeries, locale, true)})`,
      });
      try {
        await this.postSeriesStatsToThread(
          publication.threadId,
          series,
          guildConfig,
          locale,
          publication.allowLoadGamesButton,
          publication.messageIds,
          teamMappings ?? undefined,
        );
      } catch (error) {
        await this.rollbackManualSeriesPublication(publication, error);
      }

      await this.cacheDiscordSeriesStats(
        metadata.guildId,
        metadata.queueNumber,
        series,
        locale,
        true,
        this.getManualSeriesScoreOverride(metadata, locale, false),
      );
      if (queueConfig != null) {
        await this.persistManualSeriesToLeaderboard(metadata, queueConfig, series, locale);
      }

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed(`Series stats were posted in <#${publication.threadId}>.`)],
        components: [],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async findManualQueueConfig(metadata: ManualFlowMetadata): Promise<NeatQueueConfigRow | undefined> {
    if (metadata.queueChannelId == null) {
      return undefined;
    }

    const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: metadata.guildId });
    return configuredQueues.find((queue) => queue.ChannelId === metadata.queueChannelId);
  }

  /**
   * Manual series have no NeatQueue message to thread from, so the overview is posted and threaded from directly,
   * unless the post channel is already a thread.
   */
  private async postManualSeriesOverview({
    postChannelId,
    seriesEmbed,
    threadName,
  }: {
    postChannelId: string;
    seriesEmbed: SeriesOverviewEmbedOutput;
    threadName: string;
  }): Promise<{
    threadId: string;
    allowLoadGamesButton: boolean;
    messageIds: string[];
    overviewChannelId: string;
    overviewMessageId?: string | undefined;
    createdThread: boolean;
  }> {
    const { discordService } = this.services;
    const content = { embeds: seriesEmbed.embeds, components: seriesEmbed.components };
    const postChannel = await discordService.getChannel(postChannelId);
    if (this.isThreadChannel(postChannel.type)) {
      const overviewMessage = await discordService.createMessage(postChannelId, content);
      return {
        threadId: postChannelId,
        allowLoadGamesButton: false,
        messageIds: [overviewMessage.id],
        overviewChannelId: postChannelId,
        createdThread: false,
      };
    }

    let overviewMessage: APIMessage | undefined;
    try {
      overviewMessage = await discordService.createMessage(postChannelId, content);
      const thread = await discordService.startThreadFromMessage(postChannelId, overviewMessage.id, threadName);
      return {
        threadId: thread.id,
        allowLoadGamesButton: thread.type === ChannelType.PublicThread,
        messageIds: [],
        overviewChannelId: postChannelId,
        overviewMessageId: overviewMessage.id,
        createdThread: true,
      };
    } catch (error) {
      if (overviewMessage != null) {
        try {
          await discordService.deleteMessage(
            postChannelId,
            overviewMessage.id,
            "Removing manual series overview after thread creation failed",
          );
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Failed to create a manual series thread and clean up its overview message",
            { cause: cleanupError },
          );
        }
      }

      throw (
        toMissingPermissionsError(error, {
          action: "post the series stats",
          permissions: [
            discordService.permissionToString(PermissionFlagsBits.SendMessages),
            discordService.permissionToString(PermissionFlagsBits.CreatePublicThreads),
          ],
        }) ?? error
      );
    }
  }

  private async rollbackManualSeriesPublication(
    publication: {
      threadId: string;
      messageIds: string[];
      overviewChannelId: string;
      overviewMessageId?: string | undefined;
      createdThread: boolean;
    },
    originalError: unknown,
  ): Promise<never> {
    const { discordService } = this.services;
    const cleanupErrors: unknown[] = [];
    let threadDeleted = false;

    if (publication.createdThread) {
      try {
        await discordService.deleteChannel(publication.threadId, "Removing incomplete manual series thread");
        threadDeleted = true;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if ((!publication.createdThread || !threadDeleted) && publication.messageIds.length > 0) {
      for (const messageId of publication.messageIds) {
        try {
          await discordService.deleteMessage(
            publication.threadId,
            messageId,
            "Removing incomplete manual series stats",
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }

    if (publication.overviewMessageId != null) {
      try {
        await discordService.deleteMessage(
          publication.overviewChannelId,
          publication.overviewMessageId,
          "Removing manual series overview after stats publication failed",
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [originalError, ...cleanupErrors],
        "Failed to publish manual series stats and clean up the partial publication",
        { cause: originalError },
      );
    }

    throw originalError;
  }

  private async persistManualSeriesToLeaderboard(
    metadata: ManualFlowMetadata,
    queueConfig: NeatQueueConfigRow,
    series: MatchStats[],
    locale: string,
  ): Promise<void> {
    try {
      const mappings = Preconditions.checkExists(
        resolveManualSeriesTeamMappings(series),
        "Cannot resolve stable team identities from the manual series rosters",
      );
      await this.services.leaderboardService.persistReconciledSeriesData({
        guildId: metadata.guildId,
        channelId: queueConfig.ChannelId,
        queueNumber: metadata.queueNumber,
        neatQueueConfig: queueConfig,
        series,
        winnerTeamIndex: this.getManualWinnerTeamId(series, metadata.selectedSeriesOutcome),
        seriesTeamIdByXuid: mappings.playerToSeriesTeamId,
        seriesScore:
          this.getManualSeriesScoreOverride(metadata, locale, false) ??
          this.services.haloService.getSeriesScore(mapManualSeriesToStableTeams(series, mappings), locale),
        locale,
      });
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["context", "Manual stats leaderboard persistence failed"],
          ["guildId", metadata.guildId],
          ["queue", metadata.queueNumber.toString()],
        ]),
      );
    }
  }

  private getManualWinnerTeamId(series: MatchStats[], selectedSeriesOutcome: FixSeriesOutcome | undefined): number {
    if (selectedSeriesOutcome === "TIE") {
      return -1;
    }

    const [firstMatch] = [...series].sort((left, right) =>
      left.MatchInfo.StartTime.localeCompare(right.MatchInfo.StartTime),
    );
    const sortedTeams = [...Preconditions.checkExists(firstMatch).Teams].sort(
      (left, right) => left.TeamId - right.TeamId,
    );
    const winningTeam = sortedTeams[selectedSeriesOutcome === "TEAM_0" ? 0 : 1];
    return Preconditions.checkExists(winningTeam, "Expected winning team in first match").TeamId;
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

  /**
   * Series without a user-provided queue number (timestamp IDs) offer a button to set one.
   */
  private createManualActionRow(
    metadata: ManualFlowMetadata,
    leadingButtons: APIButtonComponentWithCustomId[],
  ): APIMessageTopLevelComponent {
    const setQueueNumberButton: APIButtonComponentWithCustomId = {
      type: ComponentType.Button,
      custom_id: InteractionButton.ManualSetQueueNumber,
      label: "Set queue number",
      style: ButtonStyle.Primary,
    };

    return {
      type: ComponentType.ActionRow,
      components: [
        ...leadingButtons,
        ...(metadata.queueNumber >= MANUAL_QUEUE_NUMBER_MIN ? [setQueueNumberButton] : []),
        {
          type: ComponentType.Button,
          custom_id: InteractionButton.FixCancel,
          label: "Cancel",
          style: ButtonStyle.Secondary,
        },
      ],
    };
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
      const fixSource = await this.getFixQueueData(guildId, channelId, queueNumber);

      await this.fixCommandStartFlow(interaction, fixSource);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  /**
   * Manual series (and series whose NeatQueue result is gone) are rebuilt from the Guilty Spark overview instead.
   */
  private async getFixQueueData(guildId: string, channelId: string, queueNumber: number): Promise<FixSeriesSource> {
    if (queueNumber >= MANUAL_QUEUE_NUMBER_MIN) {
      const fromOverview = await this.getQueueDataFromSeriesOverview(guildId, queueNumber);
      if (fromOverview == null) {
        throw new EndUserError(`Could not find series stats for queue #${queueNumber.toString()}.`);
      }

      return fromOverview;
    }

    try {
      return {
        queueData: await this.services.discordService.getTeamsFromQueueResult(guildId, channelId, queueNumber),
        channelId,
        sourceKind: "neatqueue-result",
        isManualSeries: false,
      };
    } catch (error) {
      if (!(error instanceof EndUserError)) {
        throw error;
      }

      const fromOverview = await this.getQueueDataFromSeriesOverview(guildId, queueNumber);
      if (fromOverview == null) {
        throw error;
      }

      return fromOverview;
    }
  }

  private async getQueueDataFromSeriesOverview(
    guildId: string,
    queueNumber: number,
  ): Promise<FixSeriesSource | undefined> {
    const { discordService } = this.services;
    const overviewMessage = await discordService.findSeriesOverviewMessage(guildId, queueNumber);
    if (overviewMessage == null) {
      return undefined;
    }

    return {
      queueData: await discordService.getTeamsFromSeriesOverview(guildId, overviewMessage, queueNumber),
      channelId: overviewMessage.channel_id,
      sourceKind: "series-overview",
      isManualSeries: queueNumber >= MANUAL_QUEUE_NUMBER_MIN || isManualSeriesOverview(overviewMessage),
    };
  }

  private async fixSubCommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      if (!this.isThreadChannel(interaction.channel.type)) {
        throw new EndUserError("This command must be run in a thread channel.");
      }

      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const threadId = interaction.channel.id;
      const parentChannelId = "parent_id" in interaction.channel ? interaction.channel.parent_id : undefined;
      const channelId = parentChannelId ?? threadId;
      const queueNumber = await discordService.findQueueNumberForThread(guildId, threadId);
      const fixSource =
        queueNumber != null
          ? await this.getFixQueueData(guildId, channelId, queueNumber)
          : await this.getQueueDataFromThreadStarterMessage(guildId, channelId, threadId);

      await this.fixCommandStartFlow(interaction, fixSource);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  /**
   * Threads started from a message share its ID, so a thread can be traced back to the NeatQueue result or
   * Guilty Spark series overview it hangs off.
   */
  private async getQueueDataFromThreadStarterMessage(
    guildId: string,
    channelId: string,
    threadId: string,
  ): Promise<FixSeriesSource> {
    const { discordService } = this.services;
    const notFoundError = new EndUserError(
      "Could not determine which queue this thread's stats are for. Try running /stats fix queue_number:<queue> from the parent channel instead.",
    );

    let starterMessage: APIMessage;
    try {
      starterMessage = await discordService.getMessage(channelId, threadId);
    } catch {
      throw notFoundError;
    }

    if (starterMessage.author.id === NEAT_QUEUE_BOT_USER_ID) {
      return {
        queueData: await discordService.getTeamsFromMessage(guildId, starterMessage),
        channelId,
        sourceKind: "neatqueue-result",
        isManualSeries: false,
      };
    }

    const overviewQueueNumber =
      starterMessage.author.id === this.env.DISCORD_APP_ID
        ? extractQueueNumberFromSeriesOverviewEmbed(starterMessage)
        : undefined;
    if (overviewQueueNumber == null) {
      throw notFoundError;
    }

    return {
      queueData: await discordService.getTeamsFromSeriesOverview(guildId, starterMessage, overviewQueueNumber),
      channelId,
      sourceKind: "series-overview",
      isManualSeries: overviewQueueNumber >= MANUAL_QUEUE_NUMBER_MIN || isManualSeriesOverview(starterMessage),
    };
  }

  private async fixCommandStartFlow(
    interaction: APIApplicationCommandInteraction,
    fixSource: FixSeriesSource,
  ): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    const { channelId, queueData } = fixSource;
    const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
    const userId = discordService.getDiscordUserId(interaction);
    const permissions = await discordService.computeMemberPermissions(guildId, userId);
    const isAdmin = (permissions & PermissionFlagsBits.Administrator) !== 0n;
    const queuePlayers = queueData.teams.flatMap((team) => team.players);
    const queuePlayerIds = new Set(queuePlayers.map((player) => player.user.id));

    if (!isAdmin && !queuePlayerIds.has(userId)) {
      throw new EndUserError("Only players from that queue (or admins) can run /stats fix.");
    }

    const discordAssociations = await databaseService.getDiscordAssociations([...queuePlayerIds]);
    const xboxIds = discordAssociations.flatMap((association) =>
      association.XboxId !== "" ? [association.XboxId] : [],
    );
    const usersByXuid = xboxIds.length > 0 ? await haloService.getUsersByXuids(xboxIds) : [];
    const xuidToGamertag = new Map(usersByXuid.map((user) => [user.xuid, user.gamertag]));
    const discordIdToGamertag = new Map<string, string>();
    for (const association of discordAssociations) {
      if (association.XboxId === "") {
        continue;
      }

      const gamertag = xuidToGamertag.get(association.XboxId);
      if (gamertag == null || gamertag === "") {
        continue;
      }

      discordIdToGamertag.set(association.DiscordId, gamertag);
    }

    const selectOptions = queueData.teams
      .flatMap((team) =>
        team.players
          .filter((player) => discordIdToGamertag.has(player.user.id))
          .map((player) => {
            const label = player.nick ?? player.user.global_name ?? player.user.username;
            const gamertag = Preconditions.checkExists(discordIdToGamertag.get(player.user.id));

            return {
              label: label.slice(0, 100),
              value: player.user.id,
              description: `Gamertag: ${gamertag}`.slice(0, 100),
            };
          }),
      )
      .slice(0, 25); // Discord select menu has a max of 25 options

    if (selectOptions.length === 0) {
      throw new EndUserError(
        "No players in that queue have a connected Halo account. Ask a player to run /connect first.",
      );
    }

    const message = await discordService.updateDeferredReply(interaction.token, {
      embeds: [this.createStatusEmbed("Select a player from the queue to load candidate custom games.")],
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

    const queueDataWithoutTimestamp: Omit<QueueData, "timestamp"> = {
      message: queueData.message,
      queue: queueData.queue,
      teams: queueData.teams,
    };
    await this.setFixMetadata(message.id, {
      guildId,
      channelId,
      sourceKind: fixSource.sourceKind,
      isManualSeries: fixSource.isManualSeries,
      queueData: queueDataWithoutTimestamp,
    });
  }

  private async handleFixPlayerSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      const selectedPlayerId = Preconditions.checkExists(interaction.data.values[0], "No player selected");
      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const recentGames = await this.getRecentCustomGames(selectedPlayerId, locale);
      const preselectedMatchIds = await this.getPreselectedFixMatchIds(metadata, interaction);
      const gameOptions = this.toGameSelectOptions(recentGames, preselectedMatchIds);

      const selectedMatchIds = gameOptions.filter((option) => Boolean(option.default)).map((option) => option.value);
      await this.setFixMetadata(interaction.message.id, {
        ...metadata,
        selectedPlayerId,
        selectedMatchIds,
      });

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed("Select the custom games that belong to this series.")],
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

  private async getPreselectedFixMatchIds(
    metadata: FixFlowMetadata,
    interaction: APIMessageComponentSelectMenuInteraction,
  ): Promise<Set<string>> {
    const { discordService, logService } = this.services;
    const preselectedMatchIds = new Set<string>();

    try {
      if (this.isThreadChannel(interaction.channel.type)) {
        const threadMessages = await discordService.findBotMessagesInThread(metadata.guildId, interaction.channel.id);
        for (const threadMessage of threadMessages) {
          const matchIds = extractDiscordSeriesMatchIdsFromEmbeds(threadMessage.embeds);
          for (const matchId of matchIds) {
            preselectedMatchIds.add(matchId);
          }
        }

        if (preselectedMatchIds.size > 0) {
          return preselectedMatchIds;
        }
      }

      const existingLocation = await discordService.findExistingSeriesStatsThreadLocation(
        metadata.guildId,
        metadata.queueData.queue,
      );

      if (existingLocation?.parentOverviewMessage != null) {
        const overviewMessage = await discordService.getMessage(
          existingLocation.parentOverviewMessage.channelId,
          existingLocation.parentOverviewMessage.messageId,
        );
        const matchIds = extractDiscordSeriesMatchIdsFromEmbeds(overviewMessage.embeds);
        for (const matchId of matchIds) {
          preselectedMatchIds.add(matchId);
        }
      }

      if (preselectedMatchIds.size === 0 && existingLocation?.threadId != null) {
        const threadMessages = await discordService.findBotMessagesInThread(
          metadata.guildId,
          existingLocation.threadId,
        );
        for (const threadMessage of threadMessages) {
          const matchIds = extractDiscordSeriesMatchIdsFromEmbeds(threadMessage.embeds);
          for (const matchId of matchIds) {
            preselectedMatchIds.add(matchId);
          }
        }
      }
    } catch (error) {
      logService.warn(
        error,
        new Map([
          ["guildId", metadata.guildId],
          ["queueNumber", metadata.queueData.queue.toString()],
          ["reason", "Failed to discover existing series match IDs for /stats fix preselection"],
        ]),
      );
    }

    return preselectedMatchIds;
  }

  private async handleFixGamesSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService, haloService } = this.services;

    try {
      const selectedMatchIds = interaction.data.values;
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("Select at least one game.");
      }

      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const series = await haloService.getMatchDetails(selectedMatchIds);
      if (series.length === 0) {
        throw new EndUserError("No match details found for the selected games.");
      }

      const derivedSeriesOutcome = this.deriveFixSeriesOutcome(series);
      const selectedSeriesOutcome = derivedSeriesOutcome;

      await this.setFixMetadata(interaction.message.id, {
        ...metadata,
        selectedMatchIds,
        selectedSeriesOutcome,
      });

      await this.updateFixOutcomePreview(interaction, metadata, series, derivedSeriesOutcome, selectedSeriesOutcome);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleFixOutcomeSelectJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService, haloService } = this.services;

    try {
      const [selectedSeriesOutcomeRaw] = interaction.data.values;
      if (selectedSeriesOutcomeRaw == null) {
        throw new EndUserError("No series outcome selected. Please run /stats fix again.");
      }
      const selectedSeriesOutcome = this.parseFixSeriesOutcome(selectedSeriesOutcomeRaw);
      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const selectedMatchIds = metadata.selectedMatchIds ?? [];
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("No games were selected. Please run /stats fix again.");
      }

      const series = await haloService.getMatchDetails(selectedMatchIds);
      if (series.length === 0) {
        throw new EndUserError("No match details found for the selected games.");
      }

      const derivedSeriesOutcome = this.deriveFixSeriesOutcome(series);
      await this.setFixMetadata(interaction.message.id, { ...metadata, selectedSeriesOutcome });
      await this.updateFixOutcomePreview(interaction, metadata, series, derivedSeriesOutcome, selectedSeriesOutcome);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async updateFixOutcomePreview(
    interaction: APIMessageComponentSelectMenuInteraction,
    metadata: FixFlowMetadata,
    series: MatchStats[],
    derivedSeriesOutcome: FixSeriesOutcome,
    selectedSeriesOutcome: FixSeriesOutcome,
  ): Promise<void> {
    const { discordService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;
    const seriesEmbed = await this.createSeriesEmbed({
      guildId: metadata.guildId,
      channelId: metadata.channelId,
      locale,
      queueData: metadata.queueData,
      series,
    });
    const derivedResultLabel = this.getFixSeriesOutcomeLabel(derivedSeriesOutcome, metadata.queueData.teams);
    const selectedResultLabel = this.getFixSeriesOutcomeLabel(selectedSeriesOutcome, metadata.queueData.teams);

    await discordService.updateDeferredReply(interaction.token, {
      embeds: [
        this.createStatusEmbed(
          `Preview generated. Confirm to replace the previous series stats.\nDerived result: ${derivedResultLabel}\nFinal result: ${selectedResultLabel}`,
        ),
        ...seriesEmbed.embeds,
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.FixOutcomeSelect,
              min_values: 1,
              max_values: 1,
              options: this.getFixSeriesOutcomeOptions(metadata.queueData.teams, selectedSeriesOutcome),
            },
          ],
        },
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

  private async handleFixConfirmationJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const metadata = await this.getFixMetadataWithRetry(interaction.message.id);
      if (metadata == null) {
        throw new EndUserError("Could not find fix-flow state. Please run /stats fix again.");
      }

      const selectedMatchIds = metadata.selectedMatchIds ?? [];
      if (selectedMatchIds.length === 0) {
        throw new EndUserError("No games were selected. Please run /stats fix again.");
      }
      if (metadata.selectedSeriesOutcome == null) {
        throw new EndUserError("No final series result was selected. Please run /stats fix again.");
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
      amendedOverviewEmbed.fields ??= [];
      const createdManuallyByField = metadata.queueData.message.embeds
        .flatMap((embed) => embed.fields ?? [])
        .find((field) => field.name === "Created manually by");
      if (metadata.isManualSeries === true) {
        amendedOverviewEmbed.fields.push({
          name: "Final series result",
          value: this.getFixSeriesOutcomeLabel(metadata.selectedSeriesOutcome, metadata.queueData.teams),
          inline: false,
        });
      }
      if (metadata.isManualSeries === true && createdManuallyByField != null) {
        amendedOverviewEmbed.fields.push(createdManuallyByField);
      }
      amendedOverviewEmbed.fields.push(amendedField);

      const isManualSeries = metadata.isManualSeries ?? metadata.queueData.queue >= MANUAL_QUEUE_NUMBER_MIN;
      const linkedQueueSource =
        metadata.sourceKind === "series-overview"
          ? this.getLinkedQueueSourceFromOverview(metadata.queueData.message, metadata.guildId)
          : undefined;
      const hasKnownManualQueueChannel = linkedQueueSource != null && linkedQueueSource.messageId == null;
      const neatQueueConfig =
        isManualSeries && metadata.queueData.queue >= MANUAL_QUEUE_NUMBER_MIN && !hasKnownManualQueueChannel
          ? undefined
          : await this.tryResolveNeatQueueConfigForResultsChannel(
              metadata.guildId,
              metadata.channelId,
              metadata.sourceKind ?? "neatqueue-result",
              metadata.queueData.message,
            );
      const existingLocation =
        (await discordService.findExistingSeriesStatsThreadLocation(metadata.guildId, metadata.queueData.queue)) ??
        this.getNeatQueueResultThreadLocation(metadata.queueData.message);
      await this.deletePreviousSeriesErrorMessages(metadata, neatQueueConfig);

      let destinationThreadId: string;
      let shouldPostOverviewInThread = false;
      if (existingLocation != null) {
        const existingThreadMessages = await discordService.findBotMessagesInThread(
          metadata.guildId,
          existingLocation.threadId,
        );
        const existingGuiltySparkMessageIds = existingThreadMessages
          .filter((message) => message.content !== "" || message.embeds.length > 0)
          .map((message) => message.id);
        await this.deleteMessagesInChunks(
          existingLocation.threadId,
          existingGuiltySparkMessageIds,
          "Replacing amended series stats",
        );

        if (existingLocation.parentOverviewMessage != null) {
          await discordService.editMessage(
            existingLocation.parentOverviewMessage.channelId,
            existingLocation.parentOverviewMessage.messageId,
            {
              embeds: amendedSeriesEmbed.embeds,
              components: amendedSeriesEmbed.components,
            },
          );
          destinationThreadId = existingLocation.threadId;
        } else {
          destinationThreadId = existingLocation.threadId;
          shouldPostOverviewInThread = true;
        }
      } else {
        const destination = await this.createFixSeriesStatsThread({
          metadata,
          neatQueueConfig,
          seriesEmbed: amendedSeriesEmbed,
          threadName: `Queue #${metadata.queueData.queue.toString()} series stats (${haloService.getSeriesScore(series, locale, true)})`,
        });
        ({ threadId: destinationThreadId, shouldPostOverviewInThread } = destination);
      }

      if (shouldPostOverviewInThread) {
        await discordService.createMessage(destinationThreadId, {
          embeds: amendedSeriesEmbed.embeds,
          components: amendedSeriesEmbed.components,
        });
      }
      await this.postSeriesEmbedsToThread(destinationThreadId, series, guildConfig, locale);
      await this.postGameStatsOrButton(destinationThreadId, series, guildConfig, locale);
      if (isManualSeries) {
        await discordService.cacheDiscordSeriesMatchIds(
          metadata.guildId,
          metadata.queueData.queue,
          series.map((match) => match.MatchId),
        );
      }
      await this.cacheDiscordSeriesStats(metadata.guildId, metadata.queueData.queue, series, locale, isManualSeries);
      if (neatQueueConfig != null && metadata.queueData.queue < MANUAL_QUEUE_NUMBER_MIN) {
        await this.persistFixedSeriesToLeaderboard(metadata, neatQueueConfig, series, locale);
      }

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed("Series stats were amended successfully.")],
        components: [],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private getNeatQueueResultThreadLocation(
    neatQueueMessage: APIMessage,
  ): ExistingSeriesStatsThreadLocation | undefined {
    return neatQueueMessage.thread != null ? { threadId: neatQueueMessage.thread.id } : undefined;
  }

  /**
   * Mirrors NeatQueue series posting, falling back to a channel post if the result thread can't be started.
   */
  private async createFixSeriesStatsThread({
    metadata,
    neatQueueConfig,
    seriesEmbed,
    threadName,
  }: {
    metadata: FixFlowMetadata;
    neatQueueConfig: NeatQueueConfigRow | undefined;
    seriesEmbed: SeriesOverviewEmbedOutput;
    threadName: string;
  }): Promise<{ threadId: string; shouldPostOverviewInThread: boolean }> {
    const { discordService, logService } = this.services;

    if (neatQueueConfig?.PostSeriesMode === NeatQueuePostSeriesDisplayMode.THREAD) {
      try {
        const thread = await discordService.startThreadFromMessage(
          metadata.channelId,
          metadata.queueData.message.id,
          threadName,
        );
        return { threadId: thread.id, shouldPostOverviewInThread: true };
      } catch (error) {
        logService.warn(
          error,
          new Map([
            ["guildId", metadata.guildId],
            ["channelId", metadata.channelId],
            ["queue", metadata.queueData.queue.toString()],
            ["reason", "Failed to start thread from NeatQueue result, falling back to channel post"],
          ]),
        );
      }
    }

    const postChannelId =
      neatQueueConfig?.PostSeriesChannelId ?? neatQueueConfig?.ResultsChannelId ?? metadata.channelId;
    const seriesOverviewMessage = await discordService.createMessage(postChannelId, {
      embeds: seriesEmbed.embeds,
      components: seriesEmbed.components,
    });
    const thread = await discordService.startThreadFromMessage(postChannelId, seriesOverviewMessage.id, threadName);
    return { threadId: thread.id, shouldPostOverviewInThread: false };
  }

  /**
   * Channel-mode failures post the error straight into the post channel rather than a thread.
   */
  private async deletePreviousSeriesErrorMessages(
    metadata: FixFlowMetadata,
    neatQueueConfig: NeatQueueConfigRow | undefined,
  ): Promise<void> {
    const { discordService, logService } = this.services;
    const resultsChannelId = neatQueueConfig?.ResultsChannelId ?? metadata.channelId;
    const postChannelId = neatQueueConfig?.PostSeriesChannelId ?? resultsChannelId;

    try {
      const errorMessages = await discordService.findSeriesErrorMessagesInChannel(metadata.guildId, postChannelId, {
        queueNumber: metadata.queueData.queue,
        resultsChannelId,
        afterMessageId: metadata.queueData.message.id,
      });
      await this.deleteMessagesInChunks(
        postChannelId,
        errorMessages.map((message) => message.id),
        "Replacing amended series stats",
      );
    } catch (error) {
      logService.warn(
        error,
        new Map([
          ["guildId", metadata.guildId],
          ["channelId", postChannelId],
          ["queue", metadata.queueData.queue.toString()],
          ["reason", "Failed to clean up previous series error messages"],
        ]),
      );
    }
  }

  private async persistFixedSeriesToLeaderboard(
    metadata: FixFlowMetadata,
    neatQueueConfig: NeatQueueConfigRow,
    series: MatchStats[],
    locale: string,
  ): Promise<void> {
    try {
      await this.services.leaderboardService.persistReconciledSeriesData({
        guildId: metadata.guildId,
        channelId: neatQueueConfig.ChannelId,
        queueNumber: metadata.queueData.queue,
        neatQueueConfig,
        series,
        winnerTeamIndex:
          metadata.selectedSeriesOutcome === "TEAM_0" ? 0 : metadata.selectedSeriesOutcome === "TEAM_1" ? 1 : -1,
        locale,
      });
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["context", "Stats fix leaderboard reconciliation failed"],
          ["guildId", metadata.guildId],
          ["channelId", metadata.channelId],
          ["queue", metadata.queueData.queue.toString()],
        ]),
      );
    }
  }

  private async tryResolveNeatQueueConfigForResultsChannel(
    guildId: string,
    resultsChannelId: string,
    sourceKind: FixSeriesSourceKind,
    sourceMessage: APIMessage,
  ): Promise<NeatQueueConfigRow | undefined> {
    try {
      return await this.resolveNeatQueueConfigForResultsChannel(guildId, resultsChannelId, sourceKind, sourceMessage);
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["context", "Stats fix queue config resolution failed"],
          ["guildId", guildId],
          ["channelId", resultsChannelId],
        ]),
      );
      return undefined;
    }
  }

  private async resolveNeatQueueConfigForResultsChannel(
    guildId: string,
    resultsChannelId: string,
    sourceKind: FixSeriesSourceKind,
    sourceMessage: APIMessage,
  ): Promise<NeatQueueConfigRow> {
    const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: guildId });
    const linkedSource =
      sourceKind === "series-overview" ? this.getLinkedQueueSourceFromOverview(sourceMessage, guildId) : undefined;
    const isSelfLink =
      linkedSource?.channelId === sourceMessage.channel_id && linkedSource.messageId === sourceMessage.id;
    if (linkedSource != null && !isSelfLink && linkedSource.messageId == null) {
      const linkedQueueMatches = this.findNeatQueueConfigs(configuredQueues, linkedSource.channelId, "ChannelId");
      if (linkedQueueMatches.length === 1) {
        return Preconditions.checkExists(linkedQueueMatches[0]);
      }
    } else if (linkedSource != null && !isSelfLink) {
      const linkedResultsMatches = this.findNeatQueueConfigs(
        configuredQueues,
        linkedSource.channelId,
        "ResultsChannelId",
      );
      if (linkedResultsMatches.length === 1) {
        return Preconditions.checkExists(linkedResultsMatches[0]);
      }
    }

    return this.resolveNeatQueueConfigForChannelRole(configuredQueues, resultsChannelId, sourceKind);
  }

  private resolveNeatQueueConfigForChannelRole(
    configuredQueues: NeatQueueConfigRow[],
    channelId: string,
    sourceKind: FixSeriesSourceKind,
  ): NeatQueueConfigRow {
    const channelRoles: ("PostSeriesChannelId" | "ResultsChannelId" | "ChannelId")[] =
      sourceKind === "series-overview"
        ? ["PostSeriesChannelId", "ResultsChannelId", "ChannelId"]
        : ["ChannelId", "ResultsChannelId", "PostSeriesChannelId"];
    for (const channelRole of channelRoles) {
      const matches = this.findNeatQueueConfigs(configuredQueues, channelId, channelRole);
      if (matches.length === 1) {
        return Preconditions.checkExists(matches[0]);
      }
      if (matches.length > 1) {
        throw new Error(`Expected exactly one NeatQueue config for ${channelRole} ${channelId}`);
      }
    }

    throw new Error(`Could not find a NeatQueue config for channel ${channelId}`);
  }

  private findNeatQueueConfigs(
    configuredQueues: NeatQueueConfigRow[],
    channelId: string,
    channelRole: "PostSeriesChannelId" | "ResultsChannelId" | "ChannelId",
  ): NeatQueueConfigRow[] {
    return configuredQueues.filter((queue) => queue[channelRole] === channelId);
  }

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

  private async handleFixCancelJob(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      await discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createStatusEmbed("Cancelled.")],
        components: [],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
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
