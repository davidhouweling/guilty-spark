import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIEmbed,
  APIMessage,
  APIMessageComponentButtonInteraction,
  APIMessageComponentInteraction,
  APIMessageComponentSelectMenuInteraction,
  APISelectMenuOption,
  ChannelType,
} from "discord-api-types/v10";
import { ComponentType, InteractionResponseType, MessageFlags, PermissionFlagsBits } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import type { ExistingSeriesStatsThreadLocation, QueueData } from "../../services/discord/discord";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import {
  extractDiscordSeriesMatchIdsFromEmbeds,
  extractQueueNumberFromSeriesOverviewEmbed,
} from "../../services/discord/discord-series-stats";
import { NeatQueuePostSeriesDisplayMode } from "../../services/database/types/neat_queue_config";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import type { MatchHistoryEntry } from "../../services/halo/types";
import type { StatsHandlerContext } from "./stats-handler-context";
import { InteractionButton } from "./stats-interaction-button";
import type { FixFlowMetadata, FixSeriesOutcome, FixSeriesSource, FixSeriesSourceKind } from "./stats-flow-types";
import { MANUAL_QUEUE_NUMBER_MIN } from "./manual-series";

export interface StatsFixCapabilities {
  createStatusEmbed(description: string): APIEmbed;
  isThreadChannel(channelType: ChannelType): boolean;
  setFixMetadata(messageId: string, metadata: FixFlowMetadata): Promise<void>;
  getFixMetadataWithRetry(messageId: string): Promise<FixFlowMetadata | null>;
  getRecentCustomGames(discordUserId: string, locale: string): Promise<MatchHistoryEntry[]>;
  toGameSelectOptions(
    matches: readonly MatchHistoryEntry[],
    preselectedMatchIds: ReadonlySet<string>,
  ): APISelectMenuOption[];
  deriveFixSeriesOutcome(series: MatchStats[]): FixSeriesOutcome;
  parseFixSeriesOutcome(value: string): FixSeriesOutcome;
  getFixSeriesOutcomeLabel(outcome: FixSeriesOutcome, teams: readonly { name: string }[]): string;
  getFixSeriesOutcomeOptions(
    teams: readonly { name: string }[],
    selectedOutcome: FixSeriesOutcome | undefined,
  ): APISelectMenuOption[];
  createSeriesEmbed(input: {
    guildId: string;
    channelId: string;
    locale: string;
    queueData: Omit<QueueData, "timestamp">;
    series: MatchStats[];
  }): Promise<SeriesOverviewEmbedOutput>;
  getLinkedQueueSourceFromOverview(
    message: APIMessage,
    guildId: string,
  ): { channelId: string; messageId?: string | undefined; url: string } | undefined;
  postSeriesEmbedsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
  ): Promise<void>;
  postGameStatsOrButton(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
  ): Promise<void>;
  cacheDiscordSeriesStats(
    guildId: string,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
    isManualSeries?: boolean,
  ): Promise<void>;
  deleteMessagesInChunks(channelId: string, messageIds: string[], reason: string): Promise<void>;
}

function isManualSeriesOverview(message: APIMessage): boolean {
  return message.embeds.some((embed) => embed.fields?.some((field) => field.name === "Created manually by") === true);
}

const FIX_COMPONENT_IDS = new Set<string>([
  InteractionButton.FixPlayerSelect.toString(),
  InteractionButton.FixGamesSelect.toString(),
  InteractionButton.FixOutcomeSelect.toString(),
  InteractionButton.FixConfirm.toString(),
  InteractionButton.FixCancel.toString(),
]);

export class StatsFixHandler {
  constructor(
    private readonly context: StatsHandlerContext,
    private readonly capabilities: StatsFixCapabilities,
  ) {}

  private get services(): StatsHandlerContext["services"] {
    return this.context.services;
  }

  private get env(): StatsHandlerContext["env"] {
    return this.context.env;
  }

  public handleSubcommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    return this.handleFixSubCommand(interaction, options);
  }

  public handlesComponent(customId: string): boolean {
    return FIX_COMPONENT_IDS.has(customId);
  }

  public handleComponent(interaction: APIMessageComponentInteraction): ExecuteResponse {
    switch (interaction.data.custom_id) {
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
          response: { type: InteractionResponseType.DeferredMessageUpdate },
          jobToComplete: async () =>
            this.handleFixGamesSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
        };
      }
      case InteractionButton.FixOutcomeSelect.toString(): {
        return {
          response: { type: InteractionResponseType.DeferredMessageUpdate },
          jobToComplete: async () =>
            this.handleFixOutcomeSelectJob(interaction as APIMessageComponentSelectMenuInteraction),
        };
      }
      case InteractionButton.FixConfirm.toString(): {
        return {
          response: { type: InteractionResponseType.DeferredMessageUpdate },
          jobToComplete: async () => this.handleFixConfirmationJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionButton.FixCancel.toString(): {
        return {
          response: { type: InteractionResponseType.DeferredMessageUpdate },
          jobToComplete: async () => this.handleFixCancelJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      default: {
        throw new Error(`Unknown fix interaction: ${interaction.data.custom_id}`);
      }
    }
  }

  private createStatusEmbed(description: string): APIEmbed {
    return this.capabilities.createStatusEmbed(description);
  }

  private isThreadChannel(channelType: ChannelType): boolean {
    return this.capabilities.isThreadChannel(channelType);
  }

  private async setFixMetadata(messageId: string, metadata: FixFlowMetadata): Promise<void> {
    await this.capabilities.setFixMetadata(messageId, metadata);
  }

  private async getFixMetadataWithRetry(messageId: string): Promise<FixFlowMetadata | null> {
    return await this.capabilities.getFixMetadataWithRetry(messageId);
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

  private async createSeriesEmbed(input: {
    guildId: string;
    channelId: string;
    locale: string;
    queueData: Omit<QueueData, "timestamp">;
    series: MatchStats[];
  }): Promise<SeriesOverviewEmbedOutput> {
    return await this.capabilities.createSeriesEmbed(input);
  }

  private getLinkedQueueSourceFromOverview(
    message: APIMessage,
    guildId: string,
  ): { channelId: string; messageId?: string | undefined; url: string } | undefined {
    return this.capabilities.getLinkedQueueSourceFromOverview(message, guildId);
  }

  private async postSeriesEmbedsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
  ): Promise<void> {
    await this.capabilities.postSeriesEmbedsToThread(threadId, series, guildConfig, locale);
  }

  private async postGameStatsOrButton(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
  ): Promise<void> {
    await this.capabilities.postGameStatsOrButton(threadId, series, guildConfig, locale);
  }

  private async cacheDiscordSeriesStats(
    guildId: string,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
    isManualSeries?: boolean,
  ): Promise<void> {
    await this.capabilities.cacheDiscordSeriesStats(guildId, queueNumber, series, locale, isManualSeries);
  }

  private async deleteMessagesInChunks(channelId: string, messageIds: string[], reason: string): Promise<void> {
    await this.capabilities.deleteMessagesInChunks(channelId, messageIds, reason);
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
}
