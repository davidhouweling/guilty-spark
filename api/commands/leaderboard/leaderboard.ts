import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIMessageTopLevelComponent,
} from "discord-api-types/v10";
import { isValid, parseISO } from "date-fns";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ButtonStyle,
  ChannelType,
  ComponentType,
  InteractionContextType,
  InteractionType,
  PermissionFlagsBits,
} from "discord-api-types/v10";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import {
  LEADERBOARD_METRIC_FAMILIES_IN_DISPLAY_ORDER,
  LeaderboardMetric,
  LeaderboardMetricAggregation,
  LeaderboardWindow,
  getLeaderboardFamilyAggregations,
  getLeaderboardMetricAggregation,
  getLeaderboardMetricFamiliesForAggregation,
  getLeaderboardMetricAggregationLabel,
  getLeaderboardMetricFamily,
  getLeaderboardMetricFamilyLabel,
  resolveLeaderboardMetric,
} from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardMetricFamily } from "@guilty-spark/shared/halo/leaderboard";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import { EmbedColors } from "../../embeds/colors";
import {
  createLeaderboardResponse,
  LEADERBOARD_FIRST_PAGE_CONTROL_ID,
  LEADERBOARD_LAST_PAGE_CONTROL_ID,
  LEADERBOARD_METRIC_AGGREGATION_SELECT_CONTROL_ID,
  LEADERBOARD_METRIC_FAMILY_SELECT_CONTROL_ID,
  LEADERBOARD_NEXT_PAGE_CONTROL_ID,
  LEADERBOARD_PREV_PAGE_CONTROL_ID,
  LEADERBOARD_REFRESH_CONTROL_ID,
  LEADERBOARD_WINDOW_SELECT_CONTROL_ID,
} from "../../services/leaderboard/leaderboard-response";
import type { ApplicationCommandData, BaseInteraction, CommandData, ExecuteResponse } from "../base/base-command";
import { BaseCommand } from "../base/base-command";

const DEFAULT_PAGE_SIZE = 10;
const LEGACY_LEADERBOARD_METRIC_SELECT_CONTROL_ID = "select_leaderboard_metric";
const LEADERBOARD_RESET_CONFIRM_CONTROL_ID = "btn_leaderboard_reset_confirm";
const LEADERBOARD_RESET_CANCEL_CONTROL_ID = "btn_leaderboard_reset_cancel";

const METRIC_AGGREGATIONS_IN_OPTION_ORDER: readonly LeaderboardMetricAggregation[] = [
  LeaderboardMetricAggregation.OverallPerformance,
  LeaderboardMetricAggregation.AvgPerSeries,
  LeaderboardMetricAggregation.AvgPerGame,
  LeaderboardMetricAggregation.Total,
];

const WINDOW_OPTIONS_BY_VALUE = new Map<string, LeaderboardWindow>([
  [LeaderboardWindow.LastReset, LeaderboardWindow.LastReset],
  [LeaderboardWindow.OneWeek, LeaderboardWindow.OneWeek],
  [LeaderboardWindow.OneMonth, LeaderboardWindow.OneMonth],
  [LeaderboardWindow.ThreeMonths, LeaderboardWindow.ThreeMonths],
  [LeaderboardWindow.SixMonths, LeaderboardWindow.SixMonths],
  [LeaderboardWindow.TwelveMonths, LeaderboardWindow.TwelveMonths],
]);
const METRIC_OPTIONS_BY_VALUE = new Map<string, LeaderboardMetric>(
  Object.values(LeaderboardMetric).map((metric) => [metric, metric]),
);
const METRIC_FAMILY_OPTIONS_BY_VALUE = new Map<string, LeaderboardMetricFamily>(
  LEADERBOARD_METRIC_FAMILIES_IN_DISPLAY_ORDER.map((family) => [family, family]),
);
const METRIC_AGGREGATION_OPTIONS_BY_VALUE = new Map<string, LeaderboardMetricAggregation>(
  METRIC_AGGREGATIONS_IN_OPTION_ORDER.map((aggregation) => [aggregation, aggregation]),
);

interface LeaderboardViewState {
  guildId: string;
  queueChannelId: string | null;
  window?: LeaderboardWindow;
  metric?: LeaderboardMetric;
  page: number;
  minGamesPlayed?: number;
  locked?: boolean;
}

interface ResolvedLeaderboardViewState extends LeaderboardViewState {
  window: LeaderboardWindow;
  metric: LeaderboardMetric;
  minGamesPlayed: number;
  locked: boolean;
}

export class LeaderboardCommand extends BaseCommand {
  override commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "leaderboard",
      description: "View leaderboard rankings for this server",
      contexts: [InteractionContextType.Guild],
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      options: [
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "show",
          description: "Show leaderboard rankings",
          options: [
            {
              name: "queue_channel",
              description: "Limit ranking scope to a single queue channel",
              type: ApplicationCommandOptionType.Channel,
              channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
              required: false,
            },
            {
              name: "window",
              description: "Rolling window for leaderboard facts",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                { name: "1 week", value: LeaderboardWindow.OneWeek },
                { name: "1 month", value: LeaderboardWindow.OneMonth },
                { name: "3 months", value: LeaderboardWindow.ThreeMonths },
                { name: "6 months", value: LeaderboardWindow.SixMonths },
                { name: "12 months", value: LeaderboardWindow.TwelveMonths },
              ],
            },
            {
              name: "metric_family",
              description: "Stat family to rank players by",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                ...LEADERBOARD_METRIC_FAMILIES_IN_DISPLAY_ORDER.map((family) => ({
                  name: getLeaderboardMetricFamilyLabel(family),
                  value: family,
                })),
              ],
            },
            {
              name: "aggregation",
              description: "How the stat is aggregated (only applies to some stat families)",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                ...METRIC_AGGREGATIONS_IN_OPTION_ORDER.map((aggregation) => ({
                  name: getLeaderboardMetricAggregationLabel(aggregation),
                  value: aggregation,
                })),
              ],
            },
            {
              name: "page",
              description: "Page number",
              type: ApplicationCommandOptionType.Integer,
              required: false,
              min_value: 1,
            },
            {
              name: "min_games_played",
              description: "Minimum games played to appear",
              type: ApplicationCommandOptionType.Integer,
              required: false,
              min_value: 0,
            },
            {
              name: "locked",
              description: "Post a static leaderboard without interactive controls",
              type: ApplicationCommandOptionType.Boolean,
              required: false,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.Subcommand,
          name: "reset",
          description: "Set a non-destructive leaderboard reset marker",
          options: [
            {
              name: "queue_channel",
              description: "Reset only this queue, or all server leaderboards when omitted",
              type: ApplicationCommandOptionType.Channel,
              channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
              required: false,
            },
            {
              name: "date",
              description: "UTC reset date in YYYY-MM-DD format; omitted means now",
              type: ApplicationCommandOptionType.String,
              required: false,
            },
            {
              name: "queue_number",
              description: "Use this completed queue as the reset boundary",
              type: ApplicationCommandOptionType.Integer,
              required: false,
              min_value: 1,
            },
          ],
        },
      ],
    },
  ];

  override get data(): CommandData[] {
    return [
      ...this.commands,
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: LEADERBOARD_FIRST_PAGE_CONTROL_ID,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: LEADERBOARD_PREV_PAGE_CONTROL_ID,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: LEADERBOARD_REFRESH_CONTROL_ID,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: LEADERBOARD_NEXT_PAGE_CONTROL_ID,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: LEADERBOARD_LAST_PAGE_CONTROL_ID,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: LEADERBOARD_METRIC_FAMILY_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: LEADERBOARD_RESET_CONFIRM_CONTROL_ID,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: LEADERBOARD_RESET_CANCEL_CONTROL_ID,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: LEGACY_LEADERBOARD_METRIC_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: LEADERBOARD_METRIC_AGGREGATION_SELECT_CONTROL_ID,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: LEADERBOARD_WINDOW_SELECT_CONTROL_ID,
          values: [],
        },
      },
    ];
  }

  protected override handleInteraction(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    switch (type) {
      case InteractionType.ApplicationCommand: {
        const subcommand = this.services.discordService.extractSubcommand(interaction, "leaderboard");
        switch (subcommand.name) {
          case "show": {
            return this.deferReply(async () => this.showLeaderboard(interaction, subcommand.mappedOptions));
          }
          case "reset": {
            return this.deferReply(async () => this.resetLeaderboard(interaction, subcommand.mappedOptions), true);
          }
          default: {
            throw new Error("Unknown subcommand");
          }
        }
      }
      case InteractionType.MessageComponent: {
        switch (this.getLeaderboardControlId(interaction.data.custom_id)) {
          case LEADERBOARD_FIRST_PAGE_CONTROL_ID: {
            return this.deferUpdate(async () => this.handleFirstPage(interaction));
          }
          case LEADERBOARD_PREV_PAGE_CONTROL_ID: {
            return this.deferUpdate(async () => this.handlePageChange(interaction, -1));
          }
          case LEADERBOARD_REFRESH_CONTROL_ID: {
            return this.deferUpdate(async () => this.handleRefresh(interaction));
          }
          case LEADERBOARD_NEXT_PAGE_CONTROL_ID: {
            return this.deferUpdate(async () => this.handlePageChange(interaction, 1));
          }
          case LEADERBOARD_LAST_PAGE_CONTROL_ID: {
            return this.deferUpdate(async () => this.handleLastPage(interaction));
          }
          case LEADERBOARD_METRIC_FAMILY_SELECT_CONTROL_ID: {
            return this.deferUpdate(async () => this.handleMetricFamilySelect(interaction));
          }
          case LEGACY_LEADERBOARD_METRIC_SELECT_CONTROL_ID: {
            return this.deferUpdate(async () => this.handleMetricFamilySelect(interaction));
          }
          case LEADERBOARD_METRIC_AGGREGATION_SELECT_CONTROL_ID: {
            return this.deferUpdate(async () => this.handleMetricAggregationSelect(interaction));
          }
          case LEADERBOARD_WINDOW_SELECT_CONTROL_ID: {
            return this.deferUpdate(async () => this.handleWindowSelect(interaction));
          }
          case LEADERBOARD_RESET_CONFIRM_CONTROL_ID: {
            return this.deferUpdate(async () => this.confirmResetLeaderboard(interaction));
          }
          case LEADERBOARD_RESET_CANCEL_CONTROL_ID: {
            return this.deferUpdate(async () => this.cancelResetLeaderboard(interaction));
          }
          default: {
            throw new Error(`Unknown interaction: ${interaction.data.custom_id}`);
          }
        }
      }
      case InteractionType.ModalSubmit: {
        throw new Error(`Unsupported interaction type: ${type.toString()}`);
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private async showLeaderboard(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): Promise<void> {
    try {
      const guildId = interaction.guild_id;
      if (guildId == null || guildId === "") {
        throw new EndUserError("Leaderboard can only be used inside a server.", {
          handled: true,
          errorType: EndUserErrorType.WARNING,
        });
      }

      const queueChannelId = this.getOptionalStringOption(options, "queue_channel") ?? null;
      const window = this.parseWindowOption(this.getOptionalStringOption(options, "window"));
      const metric = this.resolveMetricFromFamilyAndAggregationOptions(
        this.getOptionalStringOption(options, "metric_family"),
        this.getOptionalStringOption(options, "aggregation"),
      );
      const page = this.getOptionalNumberOption(options, "page") ?? 1;
      const minGamesPlayed = this.getOptionalNumberOption(options, "min_games_played");
      const locked = this.getOptionalBooleanOption(options, "locked") ?? false;
      const locale = this.getInteractionLocale(interaction);

      await this.refreshLeaderboard(interaction.token, locale, {
        guildId,
        queueChannelId,
        ...(window != null ? { window } : {}),
        ...(metric != null ? { metric } : {}),
        page,
        ...(minGamesPlayed != null ? { minGamesPlayed } : {}),
        locked,
      });
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async resetLeaderboard(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): Promise<void> {
    try {
      const guildId = interaction.guild_id;
      if (guildId == null || guildId === "") {
        throw new EndUserError("Leaderboard can only be reset inside a server.", {
          handled: true,
          errorType: EndUserErrorType.WARNING,
        });
      }

      const userId = this.services.discordService.getDiscordUserId(interaction);
      const permissions = await this.services.discordService.computeMemberPermissions(guildId, userId);
      if (!this.hasResetLeaderboardPermission(permissions)) {
        throw new EndUserError("You need the Manage Server or Administrator permission to reset leaderboards.", {
          handled: true,
          errorType: EndUserErrorType.WARNING,
        });
      }

      const queueChannelId = this.getOptionalStringOption(options, "queue_channel") ?? null;
      const resetAt = await this.resolveResetAt({
        guildId,
        queueChannelId,
        date: this.getOptionalStringOption(options, "date"),
        queueNumber: this.getOptionalNumberOption(options, "queue_number"),
      });
      const currentResetAt = await this.getCurrentResetAt(guildId, queueChannelId);
      await this.services.discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createResetPreviewEmbed(queueChannelId, currentResetAt, resetAt)],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                style: ButtonStyle.Danger,
                custom_id: this.createResetControlId(
                  LEADERBOARD_RESET_CONFIRM_CONTROL_ID,
                  guildId,
                  queueChannelId,
                  resetAt,
                ),
                label: "Confirm reset",
              },
              {
                type: ComponentType.Button,
                style: ButtonStyle.Secondary,
                custom_id: this.createResetControlId(
                  LEADERBOARD_RESET_CANCEL_CONTROL_ID,
                  guildId,
                  queueChannelId,
                  resetAt,
                ),
                label: "Cancel",
              },
            ],
          },
        ],
      });
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async confirmResetLeaderboard(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    try {
      this.assertButtonInteraction(interaction);
      const { guildId, queueChannelId, resetAt } = this.parseResetControlId(interaction.data.custom_id);
      this.assertResetInteractionGuild(interaction, guildId);
      await this.assertCanResetLeaderboard(interaction, guildId);
      const validatedResetAt = this.validateResetAtBoundary(resetAt);
      const now = Math.floor(Date.now() / 1000);
      await this.services.databaseService.upsertLeaderboardResetMarker({
        GuildId: guildId,
        QueueChannelId: queueChannelId,
        ResetAt: validatedResetAt,
        CreatedAt: now,
        UpdatedAt: now,
      });

      const scope = this.getResetScopeLabel(queueChannelId);
      await this.services.discordService.updateDeferredReply(interaction.token, {
        embeds: [
          this.createResetStatusEmbed(
            `Reset confirmed for ${scope} at <t:${validatedResetAt.toString()}:f>. Existing data was retained.`,
          ),
        ],
        components: [],
      });
      await this.services.leaderboardService.refreshPostsForReset(guildId, queueChannelId);
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async cancelResetLeaderboard(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    try {
      this.assertButtonInteraction(interaction);
      const { guildId } = this.parseResetControlId(interaction.data.custom_id);
      this.assertResetInteractionGuild(interaction, guildId);
      await this.services.discordService.updateDeferredReply(interaction.token, {
        embeds: [this.createResetStatusEmbed("Leaderboard reset cancelled.")],
        components: [],
      });
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async getCurrentResetAt(guildId: string, queueChannelId: string | null): Promise<number | null> {
    const queueMarker = await this.services.databaseService.getLeaderboardResetMarker(guildId, queueChannelId);
    if (queueMarker != null) {
      return queueMarker.ResetAt;
    }
    if (queueChannelId == null) {
      return null;
    }
    const serverMarker = await this.services.databaseService.getLeaderboardResetMarker(guildId, null);
    return serverMarker?.ResetAt ?? null;
  }

  private createResetPreviewEmbed(
    queueChannelId: string | null,
    currentResetAt: number | null,
    resetAt: number,
  ): { title: string; description: string; color: number } {
    const currentTimeframe =
      currentResetAt == null
        ? "Start of available leaderboard data"
        : this.services.discordService.getTimestamp(new Date(currentResetAt * 1000).toISOString(), "f");
    const resetTimeframe = this.services.discordService.getTimestamp(new Date(resetAt * 1000).toISOString(), "f");
    return {
      title: "Leaderboard reset",
      description: `Scope: ${this.getResetScopeLabel(queueChannelId)}\nCurrent timeframe: ${currentTimeframe}\nWill reset to: ${resetTimeframe}\n\nExisting leaderboard data will be retained.`,
      color: EmbedColors.GOLD,
    };
  }

  private createResetStatusEmbed(description: string): { title: string; description: string; color: number } {
    return { title: "Leaderboard reset", description, color: EmbedColors.GOLD };
  }

  private getResetScopeLabel(queueChannelId: string | null): string {
    return queueChannelId == null ? "All leaderboards in this server" : `Leaderboard for <#${queueChannelId}>`;
  }

  private createResetControlId(
    controlId: string,
    guildId: string,
    queueChannelId: string | null,
    resetAt: number,
  ): string {
    return [controlId, guildId, queueChannelId ?? "-", resetAt.toString(36)].join(":");
  }

  private parseResetControlId(customId: string): { guildId: string; queueChannelId: string | null; resetAt: number } {
    const customIdParts = customId.split(":");
    if (customIdParts.length !== 4) {
      throw this.createInvalidLeaderboardControlError();
    }
    const [controlId, guildId, rawQueueChannelId, rawResetAt] = customIdParts;
    if (
      (controlId !== LEADERBOARD_RESET_CONFIRM_CONTROL_ID && controlId !== LEADERBOARD_RESET_CANCEL_CONTROL_ID) ||
      guildId == null ||
      guildId === "" ||
      rawQueueChannelId == null ||
      rawQueueChannelId === "" ||
      rawResetAt == null
    ) {
      throw this.createInvalidLeaderboardControlError();
    }
    const resetAt = Number.parseInt(rawResetAt, 36);
    if (Number.isNaN(resetAt)) {
      throw this.createInvalidLeaderboardControlError();
    }
    return { guildId, queueChannelId: rawQueueChannelId === "-" ? null : rawQueueChannelId, resetAt };
  }

  private assertResetInteractionGuild(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    guildId: string,
  ): void {
    if (interaction.guild_id !== guildId) {
      throw new EndUserError("This reset confirmation does not belong to this server.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }
  }

  private async assertCanResetLeaderboard(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    guildId: string,
  ): Promise<void> {
    const userId = this.services.discordService.getDiscordUserId(interaction);
    const permissions = await this.services.discordService.computeMemberPermissions(guildId, userId);
    if (!this.hasResetLeaderboardPermission(permissions)) {
      throw new EndUserError("You need the Manage Server or Administrator permission to reset leaderboards.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }
  }

  private hasResetLeaderboardPermission(permissions: bigint): boolean {
    return (permissions & (PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)) !== 0n;
  }

  private parseResetDate(value: string | undefined): number {
    if (value == null) {
      return Math.floor(Date.now() / 1000);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new EndUserError("Reset date must use YYYY-MM-DD format.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }
    const parsed = parseISO(`${value}T00:00:00.000Z`);
    if (!isValid(parsed) || parsed.toISOString().slice(0, 10) !== value) {
      throw new EndUserError("Reset date is not a valid calendar date.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }
    const resetAt = Math.floor(parsed.getTime() / 1000);
    if (resetAt > Math.floor(Date.now() / 1000)) {
      throw new EndUserError("Reset date cannot be in the future.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }
    return resetAt;
  }

  private validateResetAtBoundary(resetAt: number): number {
    if (!Number.isInteger(resetAt) || resetAt < 0) {
      throw new EndUserError("Reset date is invalid.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    if (resetAt > Math.floor(Date.now() / 1000)) {
      throw new EndUserError("Reset date cannot be in the future.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    return resetAt;
  }

  private async resolveResetAt({
    guildId,
    queueChannelId,
    date,
    queueNumber,
  }: {
    guildId: string;
    queueChannelId: string | null;
    date: string | undefined;
    queueNumber: number | undefined;
  }): Promise<number> {
    if (date != null && queueNumber != null) {
      throw new EndUserError("Only one reset boundary can be used: date or queue number.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    if (queueNumber == null) {
      return this.parseResetDate(date);
    }

    const series = await this.services.databaseService.getLeaderboardSeriesByQueueNumber(guildId, queueNumber);
    if (series == null) {
      throw new EndUserError("No completed leaderboard series was found for that queue number.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    if (queueChannelId != null && series.QueueChannelId !== queueChannelId) {
      throw new EndUserError("That queue number belongs to a different queue channel.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    return series.CompletedAt;
  }

  private async handlePageChange(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    delta: number,
  ): Promise<void> {
    await this.executeStateInteraction(interaction, (state) => {
      this.assertButtonInteraction(interaction);

      return {
        ...state,
        page: Math.max(1, state.page + delta),
      };
    });
  }

  private async handleFirstPage(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    await this.executeStateInteraction(interaction, (state) => ({
      ...this.getFirstPageState(interaction, state),
    }));
  }

  private async handleRefresh(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    await this.executeStateInteraction(interaction, (state) => this.getRefreshState(interaction, state));
  }

  private async handleLastPage(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    try {
      this.assertButtonInteraction(interaction);
      this.assertCanUseLeaderboardControls(interaction);
      const state = this.getStateFromInteractionMessage(interaction);
      const locale = this.getInteractionLocale(interaction);
      const firstPage = await this.services.leaderboardService.getLeaderboard({
        guildId: state.guildId,
        ...(state.queueChannelId != null ? { queueChannelId: state.queueChannelId } : {}),
        ...(state.window != null ? { window: state.window } : {}),
        ...(state.metric != null ? { metric: state.metric } : {}),
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        ...(state.minGamesPlayed != null ? { minGamesPlayed: state.minGamesPlayed } : {}),
      });
      const lastPage = Math.max(1, Math.ceil(firstPage.total / firstPage.pageSize));

      await this.refreshLeaderboard(interaction.token, locale, {
        ...state,
        page: lastPage,
      });
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private getFirstPageState(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    state: LeaderboardViewState,
  ): LeaderboardViewState {
    this.assertButtonInteraction(interaction);
    return {
      ...state,
      page: 1,
    };
  }

  private getRefreshState(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    state: LeaderboardViewState,
  ): LeaderboardViewState {
    this.assertButtonInteraction(interaction);
    return state;
  }

  private async handleMetricFamilySelect(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    await this.executeStateInteraction(interaction, (state) => {
      if (interaction.data.component_type !== ComponentType.StringSelect) {
        throw this.createInvalidLeaderboardControlError();
      }

      const selectedFamily = this.parseMetricFamilyOption(interaction.data.values[0]);
      if (selectedFamily == null) {
        throw this.createInvalidLeaderboardControlError();
      }

      const currentAggregation = getLeaderboardMetricAggregation(state.metric ?? LeaderboardMetric.SeriesWinRate);
      const validFamilies = getLeaderboardMetricFamiliesForAggregation(currentAggregation);
      if (!validFamilies.includes(selectedFamily)) {
        throw this.createInvalidLeaderboardControlError();
      }

      return {
        ...state,
        metric: resolveLeaderboardMetric(selectedFamily, currentAggregation),
        page: 1,
      };
    });
  }

  private async handleMetricAggregationSelect(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    await this.executeStateInteraction(interaction, (state) => {
      if (interaction.data.component_type !== ComponentType.StringSelect) {
        throw this.createInvalidLeaderboardControlError();
      }

      const selectedAggregation = this.parseMetricAggregationOption(interaction.data.values[0]);
      if (selectedAggregation == null) {
        throw this.createInvalidLeaderboardControlError();
      }

      const currentFamily = getLeaderboardMetricFamily(state.metric ?? LeaderboardMetric.SeriesWinRate);
      const validFamilies = getLeaderboardMetricFamiliesForAggregation(selectedAggregation);
      const selectedFamily = validFamilies.includes(currentFamily) ? currentFamily : validFamilies[0];
      if (selectedFamily == null) {
        throw this.createInvalidLeaderboardControlError();
      }

      return {
        ...state,
        metric: resolveLeaderboardMetric(selectedFamily, selectedAggregation),
        page: 1,
      };
    });
  }

  private async handleWindowSelect(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    await this.executeStateInteraction(interaction, (state) => {
      if (interaction.data.component_type !== ComponentType.StringSelect) {
        throw this.createInvalidLeaderboardControlError();
      }

      const selectedWindow = this.parseWindowOption(interaction.data.values[0]);
      if (selectedWindow == null) {
        throw this.createInvalidLeaderboardControlError();
      }

      return {
        ...state,
        window: selectedWindow,
        page: 1,
      };
    });
  }

  private async executeStateInteraction(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    stateUpdater: (state: LeaderboardViewState) => LeaderboardViewState,
  ): Promise<void> {
    try {
      this.assertCanUseLeaderboardControls(interaction);
      const state = this.getStateFromInteractionMessage(interaction);
      const locale = this.getInteractionLocale(interaction);
      await this.refreshLeaderboard(interaction.token, locale, stateUpdater(state));
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private assertCanUseLeaderboardControls(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): void {
    const guildId = interaction.guild_id;
    if (guildId == null || guildId === "") {
      throw new EndUserError("Leaderboard controls can only be used inside a server.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    this.services.discordService.getDiscordUserId(interaction);
  }

  private async refreshLeaderboard(token: string, locale: string, state: LeaderboardViewState): Promise<void> {
    try {
      const leaderboard = await this.services.leaderboardService.getLeaderboardWithResolvedPage({
        guildId: state.guildId,
        ...(state.queueChannelId != null ? { queueChannelId: state.queueChannelId } : {}),
        ...(state.window != null ? { window: state.window } : {}),
        ...(state.metric != null ? { metric: state.metric } : {}),
        page: state.page,
        pageSize: DEFAULT_PAGE_SIZE,
        ...(state.minGamesPlayed != null ? { minGamesPlayed: state.minGamesPlayed } : {}),
      });

      const response = createLeaderboardResponse(
        locale,
        leaderboard,
        this.services.discordService.getTimestamp(new Date().toISOString(), "R"),
        state.locked ?? false,
        leaderboard.resetAt == null
          ? null
          : this.services.discordService.getTimestamp(new Date(leaderboard.resetAt * 1000).toISOString(), "f"),
      );
      const message = await this.services.discordService.updateDeferredReply(token, response);
      if (state.locked !== true) {
        await this.upsertLeaderboardPost({
          ChannelId: message.channel_id,
          MessageId: message.id,
          GuildId: leaderboard.guildId,
          QueueChannelId: leaderboard.queueChannelId,
        });
      }
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(token, error);
    }
  }

  private async upsertLeaderboardPost(post: {
    ChannelId: string;
    MessageId: string;
    GuildId: string;
    QueueChannelId: string | null;
  }): Promise<void> {
    try {
      await this.services.databaseService.upsertLeaderboardPost(post);
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["guildId", post.GuildId],
          ["queueChannelId", post.QueueChannelId],
          ["channelId", post.ChannelId],
          ["messageId", post.MessageId],
          ["reason", "Failed to register leaderboard post"],
        ]),
      );
    }
  }

  private getStateFromInteractionMessage(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): LeaderboardViewState {
    const encodedState = this.parseLeaderboardControlState(interaction.data.custom_id);
    if (encodedState != null) {
      return this.validateInteractionState(interaction, encodedState);
    }

    const { components } = interaction.message;
    if (components == null || components.length === 0) {
      throw new EndUserError(
        "This leaderboard message is missing its interaction context. Run /leaderboard show again.",
        {
          handled: true,
          errorType: EndUserErrorType.WARNING,
        },
      );
    }

    const stateUrl = this.getStateUrlFromComponents(components);
    const params = this.getStateQueryParams(stateUrl);
    const parsedWindow = this.parseWindowOption(params.get("window") ?? undefined);
    const parsedMetric = this.parseMetricOption(params.get("metric") ?? undefined);
    if (parsedWindow == null || parsedMetric == null) {
      throw new EndUserError("This leaderboard message is missing filter settings. Run /leaderboard show again.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    const parsedPage = Number.parseInt(params.get("page") ?? "1", 10);
    const parsedMinGamesPlayed = Number.parseInt(params.get("minGamesPlayed") ?? "0", 10);

    return this.validateInteractionState(interaction, {
      guildId: params.get("guildId") ?? "",
      queueChannelId: this.parseQueueChannelId(params.get("queueChannelId")),
      window: parsedWindow,
      metric: parsedMetric,
      page: Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage),
      minGamesPlayed: Number.isNaN(parsedMinGamesPlayed) ? 0 : Math.max(0, parsedMinGamesPlayed),
      locked: false,
    });
  }

  private validateInteractionState(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    state: ResolvedLeaderboardViewState,
  ): ResolvedLeaderboardViewState {
    const interactionGuildId = interaction.guild_id;

    if (interactionGuildId == null || interactionGuildId === "") {
      throw new EndUserError("Unable to determine the server for this leaderboard interaction.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    if (state.guildId !== interactionGuildId) {
      throw new EndUserError("This leaderboard interaction does not belong to this server.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    return {
      guildId: interactionGuildId,
      queueChannelId: state.queueChannelId,
      window: state.window,
      metric: state.metric,
      page: state.page,
      minGamesPlayed: state.minGamesPlayed,
      locked: state.locked,
    };
  }

  private getLeaderboardControlId(customId: string): string {
    return customId.split(":", 1)[0] ?? "";
  }

  private parseLeaderboardControlState(customId: string): ResolvedLeaderboardViewState | null {
    const [controlId, guildId, rawQueueChannelId, rawWindow, rawMetric, rawPage, rawMinGamesPlayed] =
      customId.split(":");
    if (
      controlId == null ||
      guildId == null ||
      rawQueueChannelId == null ||
      rawWindow == null ||
      rawMetric == null ||
      rawPage == null ||
      rawMinGamesPlayed == null
    ) {
      return null;
    }

    const window = this.parseWindowOption(rawWindow);
    const metric = this.parseMetricOption(rawMetric);
    const page = Number.parseInt(rawPage, 36);
    const minGamesPlayed = Number.parseInt(rawMinGamesPlayed, 36);

    if (window == null || metric == null || Number.isNaN(page) || Number.isNaN(minGamesPlayed)) {
      throw this.createInvalidLeaderboardControlError();
    }

    return {
      guildId,
      queueChannelId: rawQueueChannelId === "-" ? null : rawQueueChannelId,
      window,
      metric,
      page: Math.max(1, page),
      minGamesPlayed: Math.max(0, minGamesPlayed),
      locked: false,
    };
  }

  private parseQueueChannelId(value: string | null): string | null {
    if (value == null || value === "") {
      return null;
    }

    return value;
  }

  private getStateQueryParams(stateUrl: string): URLSearchParams {
    try {
      return new URL(stateUrl).searchParams;
    } catch {
      throw new EndUserError("This leaderboard message has invalid filter settings. Run /leaderboard show again.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }
  }

  private getStateUrlFromComponents(components: APIMessageTopLevelComponent[]): string {
    for (const actionRow of components) {
      if (actionRow.type !== ComponentType.ActionRow) {
        continue;
      }

      for (const component of actionRow.components) {
        if (component.type !== ComponentType.Button || component.style !== ButtonStyle.Link) {
          continue;
        }

        if (component.url === "") {
          continue;
        }

        if (component.url.includes("/leaderboard?")) {
          return component.url;
        }
      }
    }

    throw new EndUserError(
      "This leaderboard message is missing its interaction context. Run /leaderboard show again.",
      {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      },
    );
  }

  private parseWindowOption(value: string | undefined): LeaderboardWindow | undefined {
    if (value == null) {
      return undefined;
    }

    const parsedWindow = WINDOW_OPTIONS_BY_VALUE.get(value);
    if (parsedWindow == null) {
      throw new EndUserError("This leaderboard message has an invalid window filter. Run /leaderboard show again.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    return parsedWindow;
  }

  private parseMetricOption(value: string | undefined): LeaderboardMetric | undefined {
    if (value == null) {
      return undefined;
    }

    const parsedMetric = METRIC_OPTIONS_BY_VALUE.get(value);
    if (parsedMetric == null) {
      throw new EndUserError("This leaderboard message has an invalid metric filter. Run /leaderboard show again.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    return parsedMetric;
  }

  private parseMetricFamilyOption(value: string | undefined): LeaderboardMetricFamily | undefined {
    if (value == null) {
      return undefined;
    }

    const parsedFamily = METRIC_FAMILY_OPTIONS_BY_VALUE.get(value);
    if (parsedFamily == null) {
      throw new EndUserError(
        "This leaderboard request has an invalid stat family filter. Run /leaderboard show again.",
        {
          handled: true,
          errorType: EndUserErrorType.WARNING,
        },
      );
    }

    return parsedFamily;
  }

  private parseMetricAggregationOption(value: string | undefined): LeaderboardMetricAggregation | undefined {
    if (value == null) {
      return undefined;
    }

    const parsedAggregation = METRIC_AGGREGATION_OPTIONS_BY_VALUE.get(value);
    if (parsedAggregation == null) {
      throw new EndUserError(
        "This leaderboard request has an invalid aggregation filter. Run /leaderboard show again.",
        {
          handled: true,
          errorType: EndUserErrorType.WARNING,
        },
      );
    }

    return parsedAggregation;
  }

  private resolveMetricFromFamilyAndAggregationOptions(
    familyValue: string | undefined,
    aggregationValue: string | undefined,
  ): LeaderboardMetric | undefined {
    const family = this.parseMetricFamilyOption(familyValue);
    if (family == null) {
      return undefined;
    }

    const aggregation = this.parseMetricAggregationOption(aggregationValue) ?? null;
    const supportedAggregations = getLeaderboardFamilyAggregations(family);
    if (aggregation != null && (supportedAggregations.length === 0 || !supportedAggregations.includes(aggregation))) {
      throw new EndUserError("This aggregation is not valid for the selected stat family.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    return resolveLeaderboardMetric(family, aggregation);
  }

  private getOptionalStringOption(
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
    optionName: string,
  ): string | undefined {
    const value = options.get(optionName);
    if (value == null) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw new Error(`Expected string option: ${optionName}`);
    }

    return value;
  }

  private getOptionalNumberOption(
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
    optionName: string,
  ): number | undefined {
    const value = options.get(optionName);
    if (value == null) {
      return undefined;
    }

    if (typeof value !== "number") {
      throw new Error(`Expected numeric option: ${optionName}`);
    }

    return value;
  }

  private getOptionalBooleanOption(
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
    optionName: string,
  ): boolean | undefined {
    const value = options.get(optionName);
    if (value == null) {
      return undefined;
    }

    if (typeof value !== "boolean") {
      throw new Error(`Expected boolean option: ${optionName}`);
    }

    return value;
  }

  private getInteractionLocale(
    interaction:
      | APIApplicationCommandInteraction
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction,
  ): string {
    return interaction.guild_locale ?? interaction.locale;
  }

  private createInvalidLeaderboardControlError(): EndUserError {
    return new EndUserError("This leaderboard control interaction is invalid. Run /leaderboard show again.", {
      handled: true,
      errorType: EndUserErrorType.WARNING,
    });
  }

  private assertButtonInteraction(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): void {
    if (interaction.data.component_type !== ComponentType.Button) {
      throw this.createInvalidLeaderboardControlError();
    }
  }
}
