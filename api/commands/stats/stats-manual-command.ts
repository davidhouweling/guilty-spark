import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIButtonComponentWithCustomId,
  APIEmbed,
  APIInteractionResponse,
  APIModalInteractionResponseCallbackData,
  APIModalSubmitInteraction,
  APIMessage,
  APIMessageComponentButtonInteraction,
  APIMessageComponentInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIMessageTopLevelComponent,
  APISelectMenuOption,
} from "discord-api-types/v10";
import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  PermissionFlagsBits,
  SelectMenuDefaultValueType,
  TextInputStyle,
} from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import type { MatchHistoryEntry } from "../../services/halo/types";
import type { ManualSeriesTeamMappings } from "../../services/halo/manual-series-team-mapping";
import {
  mapManualSeriesToStableTeams,
  resolveManualSeriesTeamMappings,
} from "../../services/halo/manual-series-team-mapping";
import { SeriesOverviewEmbed } from "../../embeds/stats/series-overview-embed";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import { toMissingPermissionsError } from "../../base/missing-permissions-error";
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
import { getQueueChannelNames, getQueueOptionLabel } from "./stats-command-helpers";
import type { StatsHandlerContext } from "./stats-handler-context";
import { InteractionButton } from "./stats-interaction-button";
import type { FixSeriesOutcome, ManualFlowMetadata } from "./stats-flow-types";

export interface StatsManualCapabilities {
  createStatusEmbed(description: string): APIEmbed;
  createFixCancelActionRow(): APIMessageTopLevelComponent;
  getManualMetadataWithRetry(messageId: string): Promise<ManualFlowMetadata>;
  setManualMetadata(messageId: string, metadata: ManualFlowMetadata): Promise<void>;
  deriveFixSeriesOutcome(series: MatchStats[]): FixSeriesOutcome;
  parseFixSeriesOutcome(value: string): FixSeriesOutcome;
  getFixSeriesOutcomeLabel(outcome: FixSeriesOutcome, teams: readonly { name: string }[]): string;
  getFixSeriesOutcomeOptions(
    teams: readonly { name: string }[],
    selectedOutcome: FixSeriesOutcome | undefined,
  ): APISelectMenuOption[];
  isThreadChannel(channelType: ChannelType): boolean;
  postSeriesStatsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
    allowLoadGamesButton?: boolean,
    postedMessageIds?: string[],
    teamMappings?: ManualSeriesTeamMappings,
  ): Promise<void>;
  cacheDiscordSeriesStats(
    guildId: string,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
    isManualSeries?: boolean,
    seriesScore?: string,
  ): Promise<void>;
  getRecentCustomGames(discordUserId: string, locale: string): Promise<MatchHistoryEntry[]>;
  toGameSelectOptions(
    matches: readonly MatchHistoryEntry[],
    preselectedMatchIds: ReadonlySet<string>,
  ): APISelectMenuOption[];
}

const MANUAL_QUEUE_SELECT_PAGE_SIZE = 25;
const MANUAL_COMPONENT_IDS = new Set<string>([
  InteractionButton.ManualQueueSelect.toString(),
  InteractionButton.ManualQueuePreviousPage.toString(),
  InteractionButton.ManualQueueNextPage.toString(),
  InteractionButton.ManualPlayerSelect.toString(),
  InteractionButton.ManualGamesSelect.toString(),
  InteractionButton.ManualOutcomeSelect.toString(),
  InteractionButton.ManualConfirm.toString(),
  InteractionButton.ManualSetQueueNumber.toString(),
  InteractionButton.ManualAdjustScore.toString(),
]);

export class StatsManualHandler {
  constructor(
    private readonly context: StatsHandlerContext,
    private readonly capabilities: StatsManualCapabilities,
  ) {}

  private get services(): StatsHandlerContext["services"] {
    return this.context.services;
  }

  private get env(): StatsHandlerContext["env"] {
    return this.context.env;
  }

  private get handlerContext(): StatsHandlerContext {
    return this.context;
  }

  public handleSubcommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    return this.handleManualSubCommand(interaction, options);
  }

  public handlesComponent(customId: string): boolean {
    return MANUAL_COMPONENT_IDS.has(customId);
  }

  public handleComponent(interaction: APIMessageComponentInteraction): ExecuteResponse {
    switch (interaction.data.custom_id) {
      case InteractionButton.ManualQueueSelect.toString(): {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: { embeds: [this.createStatusEmbed("Loading recent custom games...")], components: [] },
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
            data: { embeds: [this.createStatusEmbed("Loading queue selection...")], components: [] },
          },
          jobToComplete: async () => this.handleManualQueuePageJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionButton.ManualPlayerSelect.toString(): {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: { embeds: [this.createStatusEmbed("Fetching recent custom games...")], components: [] },
          },
          jobToComplete: async () =>
            this.handleManualPlayerSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
        };
      }
      case InteractionButton.ManualGamesSelect.toString(): {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: { embeds: [this.createStatusEmbed("Generating series preview...")], components: [] },
          },
          jobToComplete: async () =>
            this.handleManualGamesSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
        };
      }
      case InteractionButton.ManualOutcomeSelect.toString(): {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: { embeds: [this.createStatusEmbed("Updating series preview...")], components: [] },
          },
          jobToComplete: async () =>
            this.handleManualOutcomeSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
        };
      }
      case InteractionButton.ManualConfirm.toString(): {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: { embeds: [this.createStatusEmbed("Posting series stats...")], components: [] },
          },
          jobToComplete: async () => this.handleManualConfirmJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionButton.ManualSetQueueNumber.toString(): {
        return { response: this.createManualQueueNumberModal() };
      }
      case InteractionButton.ManualAdjustScore.toString(): {
        return { response: this.createManualScoreModal() };
      }
      default: {
        throw new Error(`Unknown manual interaction: ${interaction.data.custom_id}`);
      }
    }
  }

  public handlesModal(customId: string): boolean {
    return (
      customId === InteractionButton.ManualQueueNumberModal.toString() ||
      customId === InteractionButton.ManualScoreModal.toString()
    );
  }

  public handleModal(interaction: APIModalSubmitInteraction): ExecuteResponse {
    switch (interaction.data.custom_id) {
      case InteractionButton.ManualQueueNumberModal.toString(): {
        return this.handleManualQueueNumberModal(interaction);
      }
      case InteractionButton.ManualScoreModal.toString(): {
        return this.handleManualScoreModal(interaction);
      }
      default: {
        throw new Error(`Unknown manual modal: ${interaction.data.custom_id}`);
      }
    }
  }

  private createStatusEmbed(description: string): APIEmbed {
    return this.capabilities.createStatusEmbed(description);
  }

  private createFixCancelActionRow(): APIMessageTopLevelComponent {
    return this.capabilities.createFixCancelActionRow();
  }

  private async getManualMetadataWithRetry(messageId: string): Promise<ManualFlowMetadata> {
    return await this.capabilities.getManualMetadataWithRetry(messageId);
  }

  private async setManualMetadata(messageId: string, metadata: ManualFlowMetadata): Promise<void> {
    await this.capabilities.setManualMetadata(messageId, metadata);
  }

  private deriveFixSeriesOutcome(series: MatchStats[]): FixSeriesOutcome {
    return this.capabilities.deriveFixSeriesOutcome(series);
  }

  private parseFixSeriesOutcome(value: string): FixSeriesOutcome {
    return this.capabilities.parseFixSeriesOutcome(value);
  }

  private getFixSeriesOutcomeLabel(outcome: FixSeriesOutcome, teams: readonly { name: string }[]): string {
    return this.capabilities.getFixSeriesOutcomeLabel(outcome, teams);
  }

  private getFixSeriesOutcomeOptions(
    teams: readonly { name: string }[],
    selectedOutcome: FixSeriesOutcome | undefined,
  ): APISelectMenuOption[] {
    return this.capabilities.getFixSeriesOutcomeOptions(teams, selectedOutcome);
  }

  private isThreadChannel(channelType: ChannelType): boolean {
    return this.capabilities.isThreadChannel(channelType);
  }

  private async postSeriesStatsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
    allowLoadGamesButton?: boolean,
    postedMessageIds?: string[],
    teamMappings?: ManualSeriesTeamMappings,
  ): Promise<void> {
    await this.capabilities.postSeriesStatsToThread(
      threadId,
      series,
      guildConfig,
      locale,
      allowLoadGamesButton,
      postedMessageIds,
      teamMappings,
    );
  }

  private async cacheDiscordSeriesStats(
    guildId: string,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
    isManualSeries?: boolean,
    seriesScore?: string,
  ): Promise<void> {
    await this.capabilities.cacheDiscordSeriesStats(guildId, queueNumber, series, locale, isManualSeries, seriesScore);
  }

  private async getRecentCustomGames(discordUserId: string, locale: string): Promise<MatchHistoryEntry[]> {
    return await this.capabilities.getRecentCustomGames(discordUserId, locale);
  }

  private toGameSelectOptions(
    matches: readonly MatchHistoryEntry[],
    preselectedMatchIds: ReadonlySet<string>,
  ): APISelectMenuOption[] {
    return this.capabilities.toGameSelectOptions(matches, preselectedMatchIds);
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
    const queueChannelNames = await getQueueChannelNames(this.handlerContext, metadata.guildId, sortedQueues);
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
                label: getQueueOptionLabel(queue.ChannelId, queueChannelNames),
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
}
