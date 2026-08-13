import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIMessageTopLevelComponent,
} from "discord-api-types/v10";
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
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import {
  createLeaderboardResponse,
  LEADERBOARD_FIRST_PAGE_CONTROL_ID,
  LEADERBOARD_LAST_PAGE_CONTROL_ID,
  LEADERBOARD_METRIC_SELECT_CONTROL_ID,
  LEADERBOARD_NEXT_PAGE_CONTROL_ID,
  LEADERBOARD_PREV_PAGE_CONTROL_ID,
  LEADERBOARD_REFRESH_CONTROL_ID,
  LEADERBOARD_WINDOW_SELECT_CONTROL_ID,
} from "../../services/leaderboard/leaderboard-response";
import type { ApplicationCommandData, BaseInteraction, CommandData, ExecuteResponse } from "../base/base-command";
import { BaseCommand } from "../base/base-command";

const DEFAULT_PAGE_SIZE = 10;

const WINDOW_OPTIONS_BY_VALUE = new Map<string, LeaderboardWindow>([
  [LeaderboardWindow.OneWeek, LeaderboardWindow.OneWeek],
  [LeaderboardWindow.OneMonth, LeaderboardWindow.OneMonth],
  [LeaderboardWindow.ThreeMonths, LeaderboardWindow.ThreeMonths],
  [LeaderboardWindow.SixMonths, LeaderboardWindow.SixMonths],
  [LeaderboardWindow.TwelveMonths, LeaderboardWindow.TwelveMonths],
]);
const METRIC_OPTIONS_BY_VALUE = new Map<string, LeaderboardMetric>([
  [LeaderboardMetric.SeriesWinRate, LeaderboardMetric.SeriesWinRate],
  [LeaderboardMetric.Kills, LeaderboardMetric.Kills],
  [LeaderboardMetric.Deaths, LeaderboardMetric.Deaths],
  [LeaderboardMetric.Assists, LeaderboardMetric.Assists],
  [LeaderboardMetric.Kda, LeaderboardMetric.Kda],
  [LeaderboardMetric.Accuracy, LeaderboardMetric.Accuracy],
  [LeaderboardMetric.DamageDealt, LeaderboardMetric.DamageDealt],
  [LeaderboardMetric.DamageTaken, LeaderboardMetric.DamageTaken],
  [LeaderboardMetric.DamageRatio, LeaderboardMetric.DamageRatio],
  [LeaderboardMetric.PersonalScore, LeaderboardMetric.PersonalScore],
]);

interface LeaderboardViewState {
  guildId: string;
  queueChannelId: string | null;
  window?: LeaderboardWindow;
  metric?: LeaderboardMetric;
  page: number;
  minGamesPlayed?: number;
}

interface ResolvedLeaderboardViewState extends LeaderboardViewState {
  window: LeaderboardWindow;
  metric: LeaderboardMetric;
  minGamesPlayed: number;
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
              name: "metric",
              description: "Metric to rank players by",
              type: ApplicationCommandOptionType.String,
              required: false,
              choices: [
                { name: "Series win rate", value: LeaderboardMetric.SeriesWinRate },
                { name: "Kills", value: LeaderboardMetric.Kills },
                { name: "Deaths", value: LeaderboardMetric.Deaths },
                { name: "Assists", value: LeaderboardMetric.Assists },
                { name: "KDA", value: LeaderboardMetric.Kda },
                { name: "Accuracy", value: LeaderboardMetric.Accuracy },
                { name: "Damage dealt", value: LeaderboardMetric.DamageDealt },
                { name: "Damage taken", value: LeaderboardMetric.DamageTaken },
                { name: "Damage ratio", value: LeaderboardMetric.DamageRatio },
                { name: "Personal score", value: LeaderboardMetric.PersonalScore },
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
          custom_id: LEADERBOARD_METRIC_SELECT_CONTROL_ID,
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
          case LEADERBOARD_METRIC_SELECT_CONTROL_ID: {
            return this.deferUpdate(async () => this.handleMetricSelect(interaction));
          }
          case LEADERBOARD_WINDOW_SELECT_CONTROL_ID: {
            return this.deferUpdate(async () => this.handleWindowSelect(interaction));
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
      const metric = this.parseMetricOption(this.getOptionalStringOption(options, "metric"));
      const page = this.getOptionalNumberOption(options, "page") ?? 1;
      const minGamesPlayed = this.getOptionalNumberOption(options, "min_games_played");
      const locale = this.getInteractionLocale(interaction);

      await this.refreshLeaderboard(interaction.token, locale, {
        guildId,
        queueChannelId,
        ...(window != null ? { window } : {}),
        ...(metric != null ? { metric } : {}),
        page,
        ...(minGamesPlayed != null ? { minGamesPlayed } : {}),
      });
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
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
      await this.assertCanUseLeaderboardControls(interaction);
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

  private async handleMetricSelect(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    await this.executeStateInteraction(interaction, (state) => {
      if (interaction.data.component_type !== ComponentType.StringSelect) {
        throw this.createInvalidLeaderboardControlError();
      }

      const selectedMetric = this.parseMetricOption(interaction.data.values[0]);
      if (selectedMetric == null) {
        throw this.createInvalidLeaderboardControlError();
      }

      return {
        ...state,
        metric: selectedMetric,
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
      await this.assertCanUseLeaderboardControls(interaction);
      const state = this.getStateFromInteractionMessage(interaction);
      const locale = this.getInteractionLocale(interaction);
      await this.refreshLeaderboard(interaction.token, locale, stateUpdater(state));
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async assertCanUseLeaderboardControls(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    const guildId = interaction.guild_id;
    if (guildId == null || guildId === "") {
      throw new EndUserError("Leaderboard controls can only be used inside a server.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    const userId = this.services.discordService.getDiscordUserId(interaction);
    const permissions = await this.services.discordService.computeMemberPermissions(guildId, userId);
    const hasManageGuildPermission = (permissions & PermissionFlagsBits.ManageGuild) !== 0n;

    if (!hasManageGuildPermission) {
      throw new EndUserError("You need the Manage Server permission to use leaderboard controls.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }
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
      );
      const message = await this.services.discordService.updateDeferredReply(token, response);
      await this.upsertLeaderboardPost({
        ChannelId: message.channel_id,
        MessageId: message.id,
        GuildId: leaderboard.guildId,
        QueueChannelId: leaderboard.queueChannelId,
      });
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
