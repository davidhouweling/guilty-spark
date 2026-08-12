import type {
  APIApplicationCommandInteraction,
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageTopLevelComponent,
  APIApplicationCommandInteractionDataBasicOption,
} from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  InteractionType,
  PermissionFlagsBits,
} from "discord-api-types/v10";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import type { ApplicationCommandData, BaseInteraction, ExecuteResponse } from "../base/base-command";
import { BaseCommand } from "../base/base-command";

const DEFAULT_PAGE_SIZE = 10;
const MAX_ROWS_IN_DISCORD_EMBED = 10;
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
      case InteractionType.MessageComponent:
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
    const guildId = interaction.guild_id;
    if (guildId == null || guildId === "") {
      throw new EndUserError("Leaderboard can only be used inside a server.", {
        handled: true,
        errorType: EndUserErrorType.WARNING,
      });
    }

    const queueChannelId = this.getOptionalStringOption(options, "queue_channel");
    const window = this.parseWindowOption(this.getOptionalStringOption(options, "window"));
    const metric = this.parseMetricOption(this.getOptionalStringOption(options, "metric"));
    const page = this.getOptionalNumberOption(options, "page");
    const minGamesPlayed = this.getOptionalNumberOption(options, "min_games_played");

    const leaderboard = await this.services.leaderboardService.getLeaderboard({
      guildId,
      ...(queueChannelId != null ? { queueChannelId } : {}),
      ...(window != null ? { window } : {}),
      ...(metric != null ? { metric } : {}),
      ...(page != null ? { page } : {}),
      pageSize: DEFAULT_PAGE_SIZE,
      ...(minGamesPlayed != null ? { minGamesPlayed } : {}),
    });

    const response = this.createLeaderboardResponse(interaction, leaderboard);
    await this.services.discordService.updateDeferredReply(interaction.token, response);
  }

  private createLeaderboardResponse(
    interaction: APIApplicationCommandInteraction,
    leaderboard: LeaderboardResponse,
  ): APIInteractionResponseCallbackData {
    const rankingLines = leaderboard.rows.slice(0, MAX_ROWS_IN_DISCORD_EMBED).map((row) => {
      const player = row.discordUserId != null ? `<@${row.discordUserId}> (${row.gamertag})` : row.gamertag;
      const metricValue = this.formatMetricValue(row.metricValue, leaderboard.metric, interaction.locale);
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
          value: rankingLines.length > 0 ? rankingLines.join("\n") : "No players qualify for this filter yet.",
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
            style: ButtonStyle.Link,
            label: "Open in browser",
            url: webUrl,
          },
        ],
      },
    ];
  }

  private parseWindowOption(value: string | undefined): LeaderboardWindow | undefined {
    if (value == null) {
      return undefined;
    }

    const parsedWindow = WINDOW_OPTIONS_BY_VALUE.get(value);
    if (parsedWindow == null) {
      throw new Error(`Invalid leaderboard window option: ${value}`);
    }

    return parsedWindow;
  }

  private parseMetricOption(value: string | undefined): LeaderboardMetric | undefined {
    if (value == null) {
      return undefined;
    }

    const parsedMetric = METRIC_OPTIONS_BY_VALUE.get(value);
    if (parsedMetric == null) {
      throw new Error(`Invalid leaderboard metric option: ${value}`);
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
}
