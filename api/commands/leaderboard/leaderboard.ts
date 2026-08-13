import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIMessageTopLevelComponent,
  APISelectMenuOption,
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
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import type { ApplicationCommandData, BaseInteraction, CommandData, ExecuteResponse } from "../base/base-command";
import { BaseCommand } from "../base/base-command";

const DEFAULT_PAGE_SIZE = 10;
const MAX_ROWS_IN_DISCORD_EMBED = 10;
const METRIC_SELECT_LIMIT = 25;
const INTERACTION_PREV_PAGE = "btn_leaderboard_prev";
const INTERACTION_NEXT_PAGE = "btn_leaderboard_next";
const INTERACTION_METRIC_SELECT = "select_leaderboard_metric";
const INTERACTION_WINDOW_SELECT = "select_leaderboard_window";

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
          custom_id: INTERACTION_PREV_PAGE,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: INTERACTION_NEXT_PAGE,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: INTERACTION_METRIC_SELECT,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: INTERACTION_WINDOW_SELECT,
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
        switch (interaction.data.custom_id) {
          case INTERACTION_PREV_PAGE: {
            return this.deferUpdate(async () => this.handlePageChange(interaction, -1));
          }
          case INTERACTION_NEXT_PAGE: {
            return this.deferUpdate(async () => this.handlePageChange(interaction, 1));
          }
          case INTERACTION_METRIC_SELECT: {
            return this.deferUpdate(async () => this.handleMetricSelect(interaction));
          }
          case INTERACTION_WINDOW_SELECT: {
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
      if (interaction.data.component_type !== ComponentType.Button) {
        throw this.createInvalidLeaderboardControlError();
      }

      return {
        ...state,
        page: Math.max(1, state.page + delta),
      };
    });
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
      const leaderboard = await this.getLeaderboardWithResolvedPage(state);

      const response = this.createLeaderboardResponse(locale, leaderboard);
      await this.services.discordService.updateDeferredReply(token, response);
    } catch (error) {
      await this.services.discordService.updateDeferredReplyWithError(token, error);
    }
  }

  private async getLeaderboardWithResolvedPage(state: LeaderboardViewState): Promise<LeaderboardResponse> {
    const leaderboard = await this.services.leaderboardService.getLeaderboard({
      guildId: state.guildId,
      ...(state.queueChannelId != null ? { queueChannelId: state.queueChannelId } : {}),
      ...(state.window != null ? { window: state.window } : {}),
      ...(state.metric != null ? { metric: state.metric } : {}),
      page: state.page,
      pageSize: DEFAULT_PAGE_SIZE,
      ...(state.minGamesPlayed != null ? { minGamesPlayed: state.minGamesPlayed } : {}),
    });

    const totalPages = Math.max(1, Math.ceil(leaderboard.total / leaderboard.pageSize));
    const requestedPageIsOutOfRange = leaderboard.page > totalPages;
    if (!requestedPageIsOutOfRange) {
      return leaderboard;
    }

    if (leaderboard.total === 0) {
      return {
        ...leaderboard,
        page: 1,
      };
    }

    return this.services.leaderboardService.getLeaderboard({
      guildId: state.guildId,
      ...(state.queueChannelId != null ? { queueChannelId: state.queueChannelId } : {}),
      ...(state.window != null ? { window: state.window } : {}),
      ...(state.metric != null ? { metric: state.metric } : {}),
      page: totalPages,
      pageSize: DEFAULT_PAGE_SIZE,
      ...(state.minGamesPlayed != null ? { minGamesPlayed: state.minGamesPlayed } : {}),
    });
  }

  private createLeaderboardResponse(
    locale: string,
    leaderboard: LeaderboardResponse,
  ): APIInteractionResponseCallbackData {
    const rankingLines = leaderboard.rows.slice(0, MAX_ROWS_IN_DISCORD_EMBED).map((row) => {
      const player = row.discordUserId != null ? `<@${row.discordUserId}> (${row.gamertag})` : row.gamertag;
      const metricValue = this.formatMetricValue(row.metricValue, leaderboard.metric, locale);
      return `${row.rank.toString()}. ${player} - ${metricValue}`;
    });

    const metricLabel = this.getMetricLabel(leaderboard.metric);
    const windowLabel = this.getWindowLabel(leaderboard.window);
    const scopeLabel =
      leaderboard.queueChannelId != null ? `Queue <#${leaderboard.queueChannelId}>` : "Server-wide (all queues)";

    const embed: APIEmbed = {
      title: `Leaderboard - ${scopeLabel}`,
      description:
        `Metric: ${metricLabel} | Window: ${windowLabel}\n` +
        `Page: ${leaderboard.page.toString()} | Min games: ${leaderboard.minGamesPlayed.toString()} | Total players: ${leaderboard.total.toString()}`,
      fields: [
        {
          name: "Rankings",
          value: this.getRankingContent(rankingLines, leaderboard.total),
          inline: false,
        },
      ],
    };

    const components = this.createComponents(leaderboard);

    return {
      embeds: [embed],
      components,
    };
  }

  private createComponents(leaderboard: LeaderboardResponse): APIMessageTopLevelComponent[] {
    const totalPages = Math.max(1, Math.ceil(leaderboard.total / leaderboard.pageSize));
    const metricOptions = this.getMetricSelectOptions(leaderboard.metric);
    const windowOptions = this.getWindowSelectOptions(leaderboard.window);

    const params = new URLSearchParams({
      guildId: leaderboard.guildId,
      window: leaderboard.window,
      metric: leaderboard.metric,
      page: leaderboard.page.toString(),
      minGamesPlayed: leaderboard.minGamesPlayed.toString(),
    });

    if (leaderboard.queueChannelId != null) {
      params.set("queueChannelId", leaderboard.queueChannelId);
    }

    const webUrl = `${this.env.PAGES_URL}/leaderboard?${params.toString()}`;

    return [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            custom_id: INTERACTION_PREV_PAGE,
            label: "Previous",
            disabled: leaderboard.page <= 1,
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            custom_id: INTERACTION_NEXT_PAGE,
            label: "Next",
            disabled: leaderboard.page >= totalPages,
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            label: "Open in browser",
            url: webUrl,
          },
        ],
      },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: INTERACTION_METRIC_SELECT,
            placeholder: "Select metric",
            min_values: 1,
            max_values: 1,
            options: metricOptions,
          },
        ],
      },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: INTERACTION_WINDOW_SELECT,
            placeholder: "Select window",
            min_values: 1,
            max_values: 1,
            options: windowOptions,
          },
        ],
      },
    ];
  }

  private getMetricSelectOptions(selectedMetric: LeaderboardMetric): APISelectMenuOption[] {
    const metricOptions = [
      { label: "Series win rate", value: LeaderboardMetric.SeriesWinRate },
      { label: "Kills", value: LeaderboardMetric.Kills },
      { label: "Deaths", value: LeaderboardMetric.Deaths },
      { label: "Assists", value: LeaderboardMetric.Assists },
      { label: "KDA", value: LeaderboardMetric.Kda },
      { label: "Accuracy", value: LeaderboardMetric.Accuracy },
      { label: "Damage dealt", value: LeaderboardMetric.DamageDealt },
      { label: "Damage taken", value: LeaderboardMetric.DamageTaken },
      { label: "Damage ratio", value: LeaderboardMetric.DamageRatio },
      { label: "Personal score", value: LeaderboardMetric.PersonalScore },
    ];

    return metricOptions.slice(0, METRIC_SELECT_LIMIT).map((option) => ({
      ...option,
      default: option.value === selectedMetric,
    }));
  }

  private getWindowSelectOptions(selectedWindow: LeaderboardWindow): APISelectMenuOption[] {
    const windowOptions = [
      { label: "1 week", value: LeaderboardWindow.OneWeek },
      { label: "1 month", value: LeaderboardWindow.OneMonth },
      { label: "3 months", value: LeaderboardWindow.ThreeMonths },
      { label: "6 months", value: LeaderboardWindow.SixMonths },
      { label: "12 months", value: LeaderboardWindow.TwelveMonths },
    ];

    return windowOptions.map((option) => ({
      ...option,
      default: option.value === selectedWindow,
    }));
  }

  private getStateFromInteractionMessage(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): LeaderboardViewState {
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
    const params = new URL(stateUrl).searchParams;
    const interactionGuildId = interaction.guild_id;

    if (interactionGuildId == null || interactionGuildId === "") {
      throw new EndUserError("Unable to determine the server for this leaderboard interaction.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    const stateGuildId = params.get("guildId");
    if (stateGuildId != null && stateGuildId !== "" && stateGuildId !== interactionGuildId) {
      throw new EndUserError("This leaderboard interaction does not belong to this server.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

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

    return {
      guildId: interactionGuildId,
      queueChannelId: this.parseQueueChannelId(params.get("queueChannelId")),
      window: parsedWindow,
      metric: parsedMetric,
      page: Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage),
      minGamesPlayed: Number.isNaN(parsedMinGamesPlayed) ? 0 : Math.max(0, parsedMinGamesPlayed),
    };
  }

  private parseQueueChannelId(value: string | null): string | null {
    if (value == null || value === "") {
      return null;
    }

    return value;
  }

  private getRankingContent(rankingLines: string[], totalPlayers: number): string {
    if (rankingLines.length > 0) {
      return rankingLines.join("\n");
    }

    if (totalPlayers === 0) {
      return "No players qualify for this filter yet.";
    }

    return "No players found on this page. Try a lower page number.";
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

  private getWindowLabel(window: LeaderboardWindow): string {
    switch (window) {
      case LeaderboardWindow.OneWeek: {
        return "1 week";
      }
      case LeaderboardWindow.OneMonth: {
        return "1 month";
      }
      case LeaderboardWindow.ThreeMonths: {
        return "3 months";
      }
      case LeaderboardWindow.SixMonths: {
        return "6 months";
      }
      case LeaderboardWindow.TwelveMonths: {
        return "12 months";
      }
      default: {
        throw new UnreachableError(window);
      }
    }
  }

  private getMetricLabel(metric: LeaderboardMetric): string {
    switch (metric) {
      case LeaderboardMetric.SeriesWinRate: {
        return "Series win rate";
      }
      case LeaderboardMetric.Kills: {
        return "Kills";
      }
      case LeaderboardMetric.Deaths: {
        return "Deaths";
      }
      case LeaderboardMetric.Assists: {
        return "Assists";
      }
      case LeaderboardMetric.Kda: {
        return "KDA";
      }
      case LeaderboardMetric.Accuracy: {
        return "Accuracy";
      }
      case LeaderboardMetric.DamageDealt: {
        return "Damage dealt";
      }
      case LeaderboardMetric.DamageTaken: {
        return "Damage taken";
      }
      case LeaderboardMetric.DamageRatio: {
        return "Damage ratio";
      }
      case LeaderboardMetric.PersonalScore: {
        return "Personal score";
      }
      default: {
        throw new UnreachableError(metric);
      }
    }
  }

  private formatMetricValue(metricValue: number, metric: LeaderboardMetric, locale: string): string {
    switch (metric) {
      case LeaderboardMetric.SeriesWinRate: {
        return `${(metricValue * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
      }
      case LeaderboardMetric.Accuracy: {
        return `${metricValue.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
      }
      case LeaderboardMetric.Kda:
      case LeaderboardMetric.DamageRatio: {
        if (metricValue === Number.MAX_VALUE) {
          return "∞";
        }

        return metricValue.toLocaleString(locale, { maximumFractionDigits: 2 });
      }
      case LeaderboardMetric.Kills:
      case LeaderboardMetric.Deaths:
      case LeaderboardMetric.Assists:
      case LeaderboardMetric.DamageDealt:
      case LeaderboardMetric.DamageTaken:
      case LeaderboardMetric.PersonalScore: {
        return Math.round(metricValue).toLocaleString(locale);
      }
      default: {
        throw new UnreachableError(metric);
      }
    }
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
}
