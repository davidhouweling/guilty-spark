import { createHmac } from "crypto";
import { inspect } from "util";
import type { MatchStats, GameVariantCategory } from "halo-infinite-api";
import type {
  RESTPostAPIChannelThreadsResult,
  APIEmbed,
  APIMessage,
  RESTPostAPIChannelMessageJSONBody,
  APIGuildMember,
  APIApplicationCommandInteraction,
  APIMessageComponentButtonInteraction,
} from "discord-api-types/v10";
import { ButtonStyle, ChannelType, ComponentType, PermissionFlagsBits } from "discord-api-types/v10";
import { sub, isAfter } from "date-fns";
import type { DatabaseService } from "../database/database.mjs";
import type { NeatQueueConfigRow } from "../database/types/neat_queue_config.mjs";
import { NeatQueuePostSeriesDisplayMode } from "../database/types/neat_queue_config.mjs";
import { NEAT_QUEUE_BOT_USER_ID, type DiscordService } from "../discord/discord.mjs";
import type { HaloService, MatchPlayer } from "../halo/halo.mjs";
import type { LiveTrackerService } from "../live-tracker/live-tracker.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import type {
  SeriesOverviewEmbedFinalTeams,
  SeriesOverviewEmbedSubstitution,
} from "../../embeds/stats/series-overview-embed.mjs";
import { SeriesOverviewEmbed } from "../../embeds/stats/series-overview-embed.mjs";
import { SeriesTeamsEmbed } from "../../embeds/stats/series-teams-embed.mjs";
import { SeriesPlayersEmbed } from "../../embeds/stats/series-players-embed.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import type { GuildConfigRow } from "../database/types/guild_config.mjs";
import { MapsPostType, StatsReturnType } from "../database/types/guild_config.mjs";
import { InteractionButton as StatsInteractionButton } from "../../commands/stats/stats.mjs";
import type { BaseMatchEmbed } from "../../embeds/stats/base-match-embed.mjs";
import type { LogService } from "../log/types.mjs";
import { EndUserError } from "../../base/end-user-error.mjs";
import { create } from "../../embeds/stats/create.mjs";
import { AssociationReason, GamesRetrievable } from "../database/types/discord_associations.mjs";
import { DiscordError } from "../discord/discord-error.mjs";
import { MapsEmbed } from "../../embeds/maps-embed.mjs";
import { isSuccessResponse } from "../../durable-objects/types.mjs";
import { NeatQueuePlayersEmbed } from "../../embeds/neatqueue/neatqueue-players-embed.mjs";
import type {
  VerifyNeatQueueResponse,
  NeatQueueRequest,
  NeatQueueMatchCompletedRequest,
  NeatQueueTeamsCreatedRequest,
  NeatQueueTimelineEvent,
  NeatQueueTimelineRequest,
  NeatQueueSubstitutionRequest,
  NeatQueuePlayer,
  NeatQueueMatchStartedRequest,
} from "./types.mjs";

export interface NeatQueueServiceOpts {
  env: Env;
  logService: LogService;
  databaseService: DatabaseService;
  discordService: DiscordService;
  haloService: HaloService;
  liveTrackerService: LiveTrackerService;
}

export class NeatQueueService {
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly databaseService: DatabaseService;
  private readonly discordService: DiscordService;
  private readonly haloService: HaloService;
  private readonly liveTrackerService: LiveTrackerService;
  private readonly locale = "en-US";

  constructor({
    env,
    logService,
    databaseService,
    discordService,
    haloService,
    liveTrackerService,
  }: NeatQueueServiceOpts) {
    this.env = env;
    this.logService = logService;
    this.databaseService = databaseService;
    this.discordService = discordService;
    this.haloService = haloService;
    this.liveTrackerService = liveTrackerService;
  }

  hashAuthorizationKey(key: string, guildId: string): string {
    const hmac = createHmac("sha256", guildId);
    hmac.update(key);
    return hmac.digest("hex");
  }

  async verifyRequest(request: Request): Promise<VerifyNeatQueueResponse> {
    const authorization = request.headers.get("authorization");
    let rawBody = "";
    try {
      rawBody = await request.text();

      if (authorization == null) {
        return { isValid: false, rawBody, error: "Missing Authorization header" };
      }

      const body = JSON.parse(rawBody) as NeatQueueRequest;

      const neatQueueConfig = await this.findNeatQueueConfig(body, authorization);
      if (neatQueueConfig == null) {
        return { isValid: false, rawBody };
      }

      return { isValid: true, rawBody, interaction: body, neatQueueConfig };
    } catch (error) {
      this.logService.error(error as Error);

      return { isValid: false, rawBody, error: "Invalid JSON" };
    }
  }

  handleRequest(
    request: NeatQueueRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): { response: Response; jobToComplete?: () => Promise<void> } {
    this.logService.info(
      inspect(request, {
        depth: null,
        colors: this.env.MODE === "development",
        compact: this.env.MODE !== "development",
      }),
    );

    switch (request.action) {
      case "JOIN_QUEUE":
      case "LEAVE_QUEUE":
      case "MATCH_CANCELLED": {
        return { response: new Response("OK") };
      }
      case "MATCH_STARTED": {
        return {
          response: new Response("OK"),
          jobToComplete: async (): Promise<void> => {
            await this.extendTimeline(request, neatQueueConfig);
            await this.matchStartedJob(request, neatQueueConfig);
          },
        };
      }
      case "TEAMS_CREATED": {
        return {
          response: new Response("OK"),
          jobToComplete: async (): Promise<void> => {
            await this.extendTimeline(request, neatQueueConfig);
            await this.teamsCreatedJob(request, neatQueueConfig);
          },
        };
      }
      case "SUBSTITUTION": {
        return {
          response: new Response("OK"),
          jobToComplete: async (): Promise<void> => {
            await this.extendTimeline(request, neatQueueConfig);
            await this.substitutionJob(request, neatQueueConfig);
          },
        };
      }
      case "MATCH_COMPLETED": {
        return {
          response: new Response("OK"),
          jobToComplete: async () => this.matchCompletedJob(request, neatQueueConfig),
        };
      }
      default: {
        this.logService.warn("Unknown action", new Map([["request", request]]));

        // whilst we could return proper status here, NeatQueue isn't concerned with it
        return { response: new Response("OK") };
      }
    }
  }

  async handleRetry({
    errorEmbed,
    guildId,
    message,
    interaction,
  }: {
    errorEmbed: EndUserError;
    guildId: string;
  } & (
    | {
        message: APIMessage;
        interaction?: never;
      }
    | {
        interaction: APIApplicationCommandInteraction | APIMessageComponentButtonInteraction;
        message?: never;
      }
  )): Promise<void> {
    const { discordService, haloService, logService } = this;
    const channelId = message != null ? message.channel_id : interaction.channel.id;
    const messageId = message != null ? message.id : interaction.id;

    try {
      const channel = await discordService.getChannel(channelId);

      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.PublicThread &&
        channel.type !== ChannelType.GuildAnnouncement &&
        channel.type !== ChannelType.AnnouncementThread
      ) {
        logService.warn("Expected channel for retry", new Map([["channel", channel.id]]));
        return;
      }

      const queueChannel = Preconditions.checkExists(
        errorEmbed.data["Channel"]?.substring(2, errorEmbed.data["Channel"].length - 1),
        "expected queue channel",
      );
      const queue = parseInt(Preconditions.checkExists(errorEmbed.data["Queue"], "expected queue number"), 10);
      const startedTimestamp =
        errorEmbed.data["Started"] != null
          ? discordService.getDateFromTimestamp(errorEmbed.data["Started"])
          : sub(new Date(), { hours: 6 });
      const completedTimestamp = discordService.getDateFromTimestamp(
        Preconditions.checkExists(errorEmbed.data["Completed"], "expected Completed timestamp"),
      );
      const substitutions =
        errorEmbed.data["Substitutions"]
          ?.split(", ")
          .map((substitution) => {
            const match = /<@(\d+)> subbed in for <@(\d+)> on (.+)/.exec(substitution);
            if (match == null) {
              logService.warn("Failed to parse substitution", new Map([["substitution", substitution]]));
              return null;
            }
            const [, playerInId, playerOutId, date] = match;
            return {
              playerInId: Preconditions.checkExists(playerInId, "expected playerInId for substitution"),
              playerOutId: Preconditions.checkExists(playerOutId, "expected playerOutId for substitution"),
              date: discordService.getDateFromTimestamp(
                Preconditions.checkExists(date, "expected date for substitution"),
              ),
            };
          })
          .filter((substitution) => substitution !== null)
          .reverse() ?? [];

      const queueMessage = await discordService.getTeamsFromQueueResult(guildId, queueChannel, queue);
      const series: MatchStats[] = [];
      const teams: MatchPlayer[][] = queueMessage.teams.map((team) =>
        team.players.map((player) => ({
          id: player.user.id,
          username: player.user.username,
          globalName: player.user.global_name,
          guildNickname: player.nick ?? null,
        })),
      );
      let endDateTime = completedTimestamp;
      const substitutionsEmbed: SeriesOverviewEmbedSubstitution[] = [];
      for (const substitution of substitutions) {
        const { playerInId, playerOutId, date: startDateTime } = substitution;
        try {
          const data = await haloService.getSeriesFromDiscordQueue({
            teams,
            startDateTime,
            endDateTime,
          });
          series.unshift(...data);
          endDateTime = startDateTime;

          for (const team of teams) {
            const playerIndex = team.findIndex((player) => player.id === playerOutId);
            const users = await discordService.getUsers(guildId, [playerInId]);
            const member = Preconditions.checkExists(users[0], "expected user for substitution");

            if (playerIndex !== -1) {
              team[playerIndex] = {
                id: playerInId,
                username: member.user.username,
                globalName: member.user.global_name,
                guildNickname: member.nick ?? null,
              };
              const teamIndex = queueMessage.teams.findIndex((t) => t.players.some((p) => p.user.id === playerOutId));
              substitutionsEmbed.push({
                playerIn: playerInId,
                playerOut: playerOutId,
                team: queueMessage.teams[teamIndex]?.name ?? `Team ${(teamIndex + 1).toLocaleString()}`,
                date: startDateTime,
              });
              break;
            }
          }
        } catch (error) {
          this.logService.error(error as Error, new Map([["reason", "Failed to process substitution"]]));
          if (series.length === 0) {
            throw error;
          }
        }
      }

      try {
        const startData = await haloService.getSeriesFromDiscordQueue({
          teams,
          startDateTime: startedTimestamp,
          endDateTime,
        });
        series.unshift(...startData);
      } catch (error) {
        this.logService.error(error as Error, new Map([["reason", "Failed to get series data from Discord queue"]]));
        if (series.length === 0) {
          throw error;
        }
      }

      const seriesOverviewEmbed = await this.getSeriesOverviewEmbed({
        guildId,
        channelId: queueMessage.message.channel_id,
        messageId: queueMessage.message.id,
        queue,
        series,
        finalTeams: queueMessage.teams.map((team) => ({
          name: team.name,
          playerIds: team.players.map((player) => player.user.id),
        })),
        substitutions: substitutionsEmbed,
      });

      let threadId = channelId;
      const data: RESTPostAPIChannelMessageJSONBody = {
        content: "",
        embeds: [seriesOverviewEmbed],
        components: [],
      };
      if (message != null) {
        await discordService.editMessage(channelId, message.id, data);
      } else {
        await discordService.updateDeferredReply(interaction.token, data);
      }

      if (channel.type !== ChannelType.PublicThread && channel.type !== ChannelType.AnnouncementThread) {
        const thread = await discordService.startThreadFromMessage(
          channelId,
          messageId,
          `Queue #${queue.toString()} series stats`,
        );
        threadId = thread.id;
      }

      await this.postSeriesDetailsToChannel(threadId, guildId, series);
    } catch (error) {
      if (error instanceof EndUserError) {
        if (error.handled) {
          this.logService.info("Handled end user error during retry", new Map([["error", error.message]]));
        } else {
          this.logService.error(error, new Map([["reason", "Unhandled end user error during retry"]]));
        }

        error.appendData({
          ...errorEmbed.data,
        });
        const data = {
          embeds: [error.discordEmbed],
          components: error.discordActions,
        };
        if (message != null) {
          await discordService.editMessage(channelId, messageId, data);
        } else {
          await discordService.updateDeferredReply(interaction.token, data);
        }
        return;
      }

      this.logService.error(error as Error, new Map([["reason", "Unhandled error during retry"]]));
      const endUserError = new EndUserError("An unexpected error occurred while retrying the neat queue job", {
        actions: ["retry"],
      });
      endUserError.appendData({
        ...errorEmbed.data,
      });

      const data = {
        embeds: [endUserError.discordEmbed],
        components: endUserError.discordActions,
      };
      if (message != null) {
        await discordService.editMessage(channelId, messageId, data);
      } else {
        await discordService.updateDeferredReply(interaction.token, data);
      }
    }
  }

  async updatePlayersEmbed(guildId: string, channelId: string, messageId: string): Promise<void> {
    try {
      const [config, kvList] = await Promise.all([
        this.databaseService.getGuildConfig(guildId),
        this.env.APP_DATA.list<null>({
          prefix: `neatqueue:${guildId}:`,
        }),
      ]);
      const key = kvList.keys.find((kv) => kv.name.endsWith(`:${channelId}`));
      if (!key) {
        throw new Error("Unable to update players embed, no key found for channel");
      }

      const timeline = await this.env.APP_DATA.get<NeatQueueTimelineEvent[]>(key.name, {
        type: "json",
      });
      if (!Array.isArray(timeline)) {
        throw new Error("Unable to update players embed, timeline is not an array");
      }

      const matchStartedEvent = timeline.find((event) => event.event.action === "MATCH_STARTED");
      if (!matchStartedEvent) {
        throw new Error("Unable to update players embed, no match started event found in timeline");
      }

      const request = matchStartedEvent.event as NeatQueueMatchStartedRequest;
      const playersPostMessage = await this.getPlayersPostMessage(config, request.players);
      if (!playersPostMessage) {
        throw new Error("Unable to update players embed, no players found in match started event");
      }

      await this.discordService.editMessage(channelId, messageId, playersPostMessage);
    } catch (error) {
      this.logService.error(error as Error, new Map([["reason", "Failed to update players embed"]]));
    }
  }

  private async findNeatQueueConfig(
    body: NeatQueueRequest,
    authorization: string,
  ): Promise<NeatQueueConfigRow | undefined> {
    const hashedKey = this.hashAuthorizationKey(authorization, body.guild);
    const [neatQueueConfig] = await this.databaseService.findNeatQueueConfig({
      GuildId: body.guild,
      WebhookSecret: hashedKey,
    });

    return neatQueueConfig;
  }

  private async matchStartedJob(
    request: NeatQueueMatchStartedRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<void> {
    const { databaseService, discordService, logService } = this;
    const insufficientPermissionsError = new Error("Insufficient permissions to post in the channel");

    try {
      const guildConfig = await databaseService.getGuildConfig(request.guild);
      if (
        guildConfig.NeatQueueInformerPlayerConnections !== "Y" &&
        guildConfig.NeatQueueInformerMapsPost === MapsPostType.OFF
      ) {
        logService.debug("Player connections are disabled and map posts are turned off, skipping players post message");
        return;
      }

      const [guild, channel] = await Promise.all([
        discordService.getGuild(request.guild),
        discordService.getChannel(request.channel),
      ]);
      const appInGuild = await discordService.getGuildMember(request.guild, this.env.DISCORD_APP_ID);
      const permissions = discordService.hasPermissions(guild, channel, appInGuild, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]);
      if (!permissions.hasAll) {
        throw insufficientPermissionsError;
      }

      if (guildConfig.NeatQueueInformerPlayerConnections === "Y") {
        const playersPostMessage = await this.getPlayersPostMessage(guildConfig, request.players);
        if (playersPostMessage) {
          const message = await discordService.createMessage(request.channel, playersPostMessage);
          await this.storePlayersMessageId(request, neatQueueConfig, message.id);
        }
      }

      if (guildConfig.NeatQueueInformerMapsPost === MapsPostType.AUTO) {
        const mapOpts = {
          playlist: guildConfig.NeatQueueInformerMapsPlaylist,
          format: guildConfig.NeatQueueInformerMapsFormat,
          count: guildConfig.NeatQueueInformerMapsCount,
        };
        const [maps, availableModes] = await Promise.all([
          this.haloService.generateMaps(mapOpts),
          this.haloService.getMapModesForPlaylist(mapOpts.playlist),
        ]);
        const embed = new MapsEmbed(
          { discordService },
          {
            userId: NEAT_QUEUE_BOT_USER_ID,
            maps,
            availableModes,
            ...mapOpts,
          },
        );
        await discordService.createMessage(request.channel, embed.toMessageData());
      } else if (
        guildConfig.NeatQueueInformerMapsPost === MapsPostType.BUTTON &&
        guildConfig.NeatQueueInformerPlayerConnections !== "Y"
      ) {
        await discordService.createMessage(request.channel, {
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  style: ButtonStyle.Secondary,
                  label: "Generate maps",
                  custom_id: "btn_maps_initiate", // TODO: work out how to share with connect command that doesn't create circular dependency
                  emoji: {
                    name: "🗺️",
                  },
                },
              ],
            },
          ],
        });
      }
    } catch (error) {
      logService.warn(error as Error, new Map([["reason", "Failed to post players message or maps button"]]));

      if ((error instanceof DiscordError && error.restError.code === 50001) || error === insufficientPermissionsError) {
        await databaseService.updateGuildConfig(request.guild, {
          NeatQueueInformerPlayerConnections: "N",
          NeatQueueInformerMapsPost: MapsPostType.OFF,
        });
      }
    }
  }

  private async teamsCreatedJob(
    request: NeatQueueTeamsCreatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _neatQueueConfig: NeatQueueConfigRow,
  ): Promise<void> {
    const { databaseService, discordService, logService } = this;

    try {
      const guildConfig = await databaseService.getGuildConfig(request.guild);
      if (guildConfig.NeatQueueInformerLiveTracking !== "Y") {
        logService.debug("Live tracking is disabled for this guild, skipping auto-start");
        return;
      }

      const [guild, channel] = await Promise.all([
        discordService.getGuild(request.guild),
        discordService.getChannel(request.channel),
      ]);

      const appInGuild = await discordService.getGuildMember(request.guild, this.env.DISCORD_APP_ID);
      const permissions = discordService.hasPermissions(guild, channel, appInGuild, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]);
      if (!permissions.hasAll) {
        logService.warn(
          "Insufficient permissions to start live tracking, disabling auto-start",
          new Map([
            ["guildId", request.guild],
            ["channelId", request.channel],
            ["missingPermissions", permissions.missing.join(", ")],
          ]),
        );

        await this.databaseService.updateGuildConfig(request.guild, {
          NeatQueueInformerLiveTracking: "N",
        });
        return;
      }

      const playerIds = request.teams.flatMap((players) => players.map((p) => p.id));
      const players = await discordService.getUsers(request.guild, playerIds);
      const teams = request.teams.map((team, teamIndex) => ({
        name: team[0]?.team_name ?? `Team ${(teamIndex + 1).toLocaleString()}`,
        playerIds: team.map((player) => player.id),
      }));

      // Start the live tracker using the service
      const context = {
        userId: this.env.DISCORD_APP_ID, // Use the bot's ID for auto-started trackers
        guildId: request.guild,
        channelId: request.channel,
        queueNumber: request.match_number,
      };

      const playersRecord = players.reduce<Record<string, APIGuildMember>>((acc, player) => {
        acc[player.user.id] = player;
        return acc;
      }, {});

      const result = await this.liveTrackerService.startTracker({
        userId: context.userId,
        guildId: context.guildId,
        channelId: context.channelId,
        queueNumber: context.queueNumber,
        players: playersRecord,
        teams,
        queueStartTime: new Date().toISOString(),
      });

      if (isSuccessResponse(result)) {
        logService.info(
          `Auto-started live tracker for queue ${request.match_number.toString()}`,
          new Map([
            ["guildId", request.guild],
            ["channelId", request.channel],
            ["queueNumber", result.state.queueNumber.toString()],
          ]),
        );
      } else {
        logService.warn(
          `Failed to start live tracker for queue ${request.match_number.toString()}`,
          new Map([
            ["guildId", request.guild],
            ["channelId", request.channel],
            ["queueNumber", context.queueNumber.toString()],
          ]),
        );
      }
    } catch (error) {
      logService.warn(
        "Failed to auto-start live tracking",
        new Map([
          ["guildId", request.guild],
          ["channelId", request.channel],
          ["queueNumber", request.match_number.toString()],
          ["error", String(error)],
        ]),
      );
      // Don't throw - this is a nice-to-have feature, shouldn't break the main flow
    }
  }

  private async substitutionJob(
    request: NeatQueueSubstitutionRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<void> {
    const { logService } = this;

    try {
      // Get the match number from the request
      const matchNumber = request.match_number;
      if (matchNumber == null) {
        logService.debug("No match number in substitution request, skipping live tracker update");
        return;
      }

      const context = {
        userId: "", // Not needed for substitution
        guildId: request.guild,
        channelId: request.channel,
        queueNumber: matchNumber,
      };

      // Check if the tracker exists and is active
      try {
        const statusResult = await this.liveTrackerService.getTrackerStatus(context);
        if (
          !statusResult?.state ||
          (statusResult.state.status !== "active" && statusResult.state.status !== "paused")
        ) {
          logService.debug("Live tracker not found or inactive, skipping substitution update");
          return;
        }
      } catch {
        logService.debug("Live tracker not found or inactive, skipping substitution update");
        return;
      }

      // Notify the live tracker about the substitution
      const substitutionResult = await this.liveTrackerService.recordSubstitution({
        context,
        playerOutId: request.player_subbed_out.id,
        playerInId: request.player_subbed_in.id,
      });

      if (isSuccessResponse(substitutionResult)) {
        logService.info(
          `Updated live tracker with substitution for queue ${matchNumber.toString()}`,
          new Map([
            ["guildId", request.guild],
            ["channelId", request.channel],
            ["playerOut", substitutionResult.substitution.playerOutId],
            ["playerIn", substitutionResult.substitution.playerInId],
          ]),
        );
      }
    } catch (error) {
      logService.warn(
        "Failed to update live tracker with substitution",
        new Map([
          ["guildId", request.guild],
          ["channelId", request.channel],
          ["error", String(error)],
        ]),
      );
      // Don't throw - this is a nice-to-have feature, shouldn't break the main flow
    }

    await this.updatePlayersEmbedForSubstitution(request, neatQueueConfig);
  }

  private async updatePlayersEmbedForSubstitution(
    request: NeatQueueSubstitutionRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<void> {
    const { databaseService, discordService, logService } = this;

    try {
      const guildConfig = await databaseService.getGuildConfig(request.guild);
      if (guildConfig.NeatQueueInformerPlayerConnections !== "Y") {
        logService.debug("Player connections are disabled, skipping players embed update");
        return;
      }

      const oldMessageId = await this.getPlayersMessageId(request, neatQueueConfig);
      if (oldMessageId == null) {
        logService.debug("No players message ID found, skipping players embed update");
        return;
      }

      const currentPlayers = await this.getCurrentPlayersFromTimeline(request, neatQueueConfig);
      if (currentPlayers == null) {
        logService.warn("Could not determine current players from timeline");
        return;
      }

      const playersPostMessage = await this.getPlayersPostMessage(guildConfig, currentPlayers);
      if (!playersPostMessage) {
        logService.debug("No players post message generated, skipping players embed update");
        return;
      }

      const newMessage = await discordService.createMessage(request.channel, playersPostMessage);
      await this.storePlayersMessageId(request, neatQueueConfig, newMessage.id);

      try {
        await discordService.deleteMessage(request.channel, oldMessageId, "Updating players list after substitution");
      } catch (error) {
        logService.warn(
          error as Error,
          new Map([
            ["reason", "Failed to delete old players message"],
            ["messageId", oldMessageId],
          ]),
        );
      }

      logService.info(
        "Updated players embed after substitution",
        new Map([
          ["guildId", request.guild],
          ["channelId", request.channel],
          ["oldMessageId", oldMessageId],
          ["newMessageId", newMessage.id],
        ]),
      );
    } catch (error) {
      logService.warn(error as Error, new Map([["reason", "Failed to update players embed for substitution"]]));

      if (error instanceof DiscordError && error.restError.code === 50001) {
        await databaseService.updateGuildConfig(request.guild, {
          NeatQueueInformerPlayerConnections: "N",
        });
      }
    }
  }

  private async stopLiveTrackingIfActive(
    request: NeatQueueMatchCompletedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _neatQueueConfig: NeatQueueConfigRow,
  ): Promise<void> {
    const { logService } = this;

    try {
      const context = {
        userId: "", // Not needed for stop
        guildId: request.guild,
        channelId: request.channel,
        queueNumber: request.match_number,
      };

      // Check if the tracker is active before trying to stop it
      try {
        const statusResult = await this.liveTrackerService.getTrackerStatus(context);
        if (
          !statusResult?.state ||
          (statusResult.state.status !== "active" && statusResult.state.status !== "paused")
        ) {
          logService.debug(
            "Live tracker not active, no need to stop",
            new Map([
              ["guildId", request.guild],
              ["channelId", request.channel],
              ["queueNumber", request.match_number.toString()],
              ["status", statusResult?.state.status ?? "not_found"],
            ]),
          );
          return;
        }
      } catch {
        // If the status check fails, the tracker might not exist or be in an error state
        logService.debug(
          "Live tracker status check failed, assuming no active tracker",
          new Map([
            ["guildId", request.guild],
            ["channelId", request.channel],
            ["queueNumber", request.match_number.toString()],
          ]),
        );
        return;
      }

      // Stop the live tracker
      const stopResult = await this.liveTrackerService.stopTracker(context);

      if (isSuccessResponse(stopResult)) {
        logService.info(
          `Auto-stopped live tracker for completed queue ${request.match_number.toString()}`,
          new Map([
            ["guildId", request.guild],
            ["channelId", request.channel],
            ["queueNumber", request.match_number.toString()],
          ]),
        );
      }
    } catch (error) {
      logService.warn(
        "Failed to auto-stop live tracking",
        new Map([
          ["guildId", request.guild],
          ["channelId", request.channel],
          ["queueNumber", request.match_number.toString()],
          ["error", String(error)],
        ]),
      );
      // Don't throw - this is cleanup, shouldn't break the main flow
    }
  }

  private async matchCompletedJob(
    request: NeatQueueMatchCompletedRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<void> {
    const timeline = await this.getTimeline(request, neatQueueConfig);
    timeline.push({ timestamp: new Date().toISOString(), event: request });

    let series: MatchStats[] = [];
    let errorOccurred = false;

    try {
      series = await this.getSeriesDataFromTimeline(timeline, neatQueueConfig);
    } catch (error) {
      this.logService.info(error as Error, new Map([["reason", "Failed to get series data from timeline"]]));
      errorOccurred = true;

      const opts = { request, neatQueueConfig, handledError: error as Error, timeline };
      await this.handlePostSeriesError(neatQueueConfig.PostSeriesMode, opts);
    }

    if (!errorOccurred && series.length > 0) {
      const opts = { request, neatQueueConfig, series, timeline };
      await this.handlePostSeriesData(neatQueueConfig.PostSeriesMode, opts);
    }

    await Promise.all([
      this.stopLiveTrackingIfActive(request, neatQueueConfig),
      this.clearTimeline(request, neatQueueConfig),
      this.deletePlayersMessageId(request, neatQueueConfig),
      this.haloService.updateDiscordAssociations(),
    ]);
  }

  private async handlePostSeriesError(
    mode: NeatQueuePostSeriesDisplayMode,
    opts: {
      request: NeatQueueMatchCompletedRequest;
      neatQueueConfig: NeatQueueConfigRow;
      handledError: Error;
      timeline: NeatQueueTimelineEvent[];
    },
  ): Promise<void> {
    switch (mode) {
      case NeatQueuePostSeriesDisplayMode.THREAD:
        await this.postErrorByThread(opts);
        break;
      case NeatQueuePostSeriesDisplayMode.MESSAGE:
      case NeatQueuePostSeriesDisplayMode.CHANNEL:
        await this.postErrorByChannel(opts);
        break;
      default:
        throw new UnreachableError(mode);
    }
  }

  private async handlePostSeriesData(
    mode: NeatQueuePostSeriesDisplayMode,
    opts: {
      request: NeatQueueMatchCompletedRequest;
      neatQueueConfig: NeatQueueConfigRow;
      series: MatchStats[];
      timeline: NeatQueueTimelineEvent[];
    },
  ): Promise<void> {
    switch (mode) {
      case NeatQueuePostSeriesDisplayMode.THREAD:
        await this.postSeriesDataByThread(opts);
        break;
      case NeatQueuePostSeriesDisplayMode.MESSAGE:
      case NeatQueuePostSeriesDisplayMode.CHANNEL:
        await this.postSeriesDataByChannel(opts);
        break;
      default:
        throw new UnreachableError(mode);
    }
  }

  private getTimelineKey(request: NeatQueueTimelineRequest, neatQueueConfig: NeatQueueConfigRow): string {
    return `neatqueue:${neatQueueConfig.GuildId}:${neatQueueConfig.ChannelId}:${request.channel}`;
  }

  private getPlayersMessageIdKey(request: NeatQueueTimelineRequest, neatQueueConfig: NeatQueueConfigRow): string {
    return `neatqueue:${neatQueueConfig.GuildId}:${neatQueueConfig.ChannelId}:${request.channel}:players_message_id`;
  }

  private async getTimeline(
    request: NeatQueueTimelineRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<NeatQueueTimelineEvent[]> {
    try {
      const data = await this.env.APP_DATA.get<NeatQueueTimelineEvent[]>(
        this.getTimelineKey(request, neatQueueConfig),
        {
          type: "json",
        },
      );

      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.logService.warn(error as Error);

      return [];
    }
  }

  private async extendTimeline(request: NeatQueueTimelineRequest, neatQueueConfig: NeatQueueConfigRow): Promise<void> {
    const timeline = await this.getTimeline(request, neatQueueConfig);
    timeline.push({ timestamp: new Date().toISOString(), event: request });

    await this.env.APP_DATA.put(this.getTimelineKey(request, neatQueueConfig), JSON.stringify(timeline), {
      expirationTtl: 60 * 60 * 24, // 1 day
    });
  }

  private async storePlayersMessageId(
    request: NeatQueueTimelineRequest,
    neatQueueConfig: NeatQueueConfigRow,
    messageId: string,
  ): Promise<void> {
    await this.env.APP_DATA.put(this.getPlayersMessageIdKey(request, neatQueueConfig), messageId, {
      expirationTtl: 60 * 60 * 24, // 1 day
    });
  }

  private async getPlayersMessageId(
    request: NeatQueueTimelineRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<string | null> {
    return await this.env.APP_DATA.get(this.getPlayersMessageIdKey(request, neatQueueConfig));
  }

  private async deletePlayersMessageId(
    request: NeatQueueTimelineRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<void> {
    await this.env.APP_DATA.delete(this.getPlayersMessageIdKey(request, neatQueueConfig));
  }

  private async getCurrentPlayersFromTimeline(
    request: NeatQueueTimelineRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<NeatQueuePlayer[] | null> {
    const timeline = await this.getTimeline(request, neatQueueConfig);

    const matchStartedEvent = timeline.find((event) => event.event.action === "MATCH_STARTED");
    if (!matchStartedEvent?.event.action || matchStartedEvent.event.action !== "MATCH_STARTED") {
      this.logService.warn("No MATCH_STARTED event found in timeline");
      return null;
    }

    const currentPlayers = [...matchStartedEvent.event.players];

    for (const { event } of timeline) {
      if (event.action !== "SUBSTITUTION") {
        continue;
      }

      const playerOutIndex = currentPlayers.findIndex((p) => p.id === event.player_subbed_out.id);

      if (playerOutIndex !== -1) {
        currentPlayers[playerOutIndex] = event.player_subbed_in;
      } else {
        this.logService.warn(
          "Player to substitute out not found in current players list",
          new Map([
            ["playerOutId", event.player_subbed_out.id],
            ["playerInId", event.player_subbed_in.id],
          ]),
        );
      }
    }

    return currentPlayers;
  }

  private async getPlayersPostMessage(
    config: GuildConfigRow,
    players: NeatQueuePlayer[],
  ): Promise<RESTPostAPIChannelMessageJSONBody | null> {
    const { databaseService, discordService, haloService } = this;

    const sortedPlayers = players.sort((a, b) => a.name.localeCompare(b.name));
    const playerIds = sortedPlayers.map((player) => player.id);
    if (playerIds.length === 0) {
      return null;
    }

    const discordAssociations = await databaseService.getDiscordAssociations(playerIds);
    this.logService.debug("Discord associations", new Map([["associations", JSON.stringify(discordAssociations)]]));
    const xboxIds = discordAssociations
      .filter(
        (association) =>
          association.GamesRetrievable === GamesRetrievable.YES ||
          association.AssociationReason === AssociationReason.GAME_SIMILARITY,
      )
      .map((assoc) => assoc.XboxId);
    this.logService.debug("Xbox IDs", new Map([["xboxIds", xboxIds]]));
    const haloPlayers = await haloService.getUsersByXuids(xboxIds);
    this.logService.debug("Halo players", new Map([["haloPlayers", JSON.stringify(haloPlayers)]]));
    const haloPlayersMap = new Map(haloPlayers.map((player) => [player.xuid, player]));
    const rankedArenaCsrs = await haloService.getRankedArenaCsrs(xboxIds);
    this.logService.debug(
      "Ranked Arena CSRs",
      new Map([["rankedArenaCsrs", JSON.stringify(rankedArenaCsrs.entries())]]),
    );
    const esras = await haloService.getPlayersEsras(xboxIds);

    const playersEmbed = new NeatQueuePlayersEmbed(
      { discordService, haloService },
      {
        players: sortedPlayers.map((player) => ({ id: player.id, name: player.name })),
        discordAssociations,
        haloPlayersMap,
        rankedArenaCsrs,
        esras,
        mapsPostType: config.NeatQueueInformerMapsPost,
      },
    );

    return {
      embeds: [playersEmbed.embed],
      components: playersEmbed.actions,
    };
  }

  private async getSeriesDataFromTimeline(
    timeline: NeatQueueTimelineEvent[],
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<MatchStats[]> {
    const series: MatchStats[] = [];
    let seriesTeams: NeatQueuePlayer[][] = [];
    let startDateTime: Date | null = null;
    let endDateTime: Date | null = null;

    this.logService.debug("Timeline", new Map([["timeline", JSON.parse(JSON.stringify(timeline))]]));

    for (const { timestamp, event } of timeline) {
      const { action } = event;

      switch (action) {
        case "JOIN_QUEUE":
        case "LEAVE_QUEUE":
        case "MATCH_STARTED":
        case "MATCH_CANCELLED": {
          break;
        }
        case "TEAMS_CREATED": {
          startDateTime = new Date(timestamp);
          seriesTeams = event.teams;
          break;
        }
        case "SUBSTITUTION": {
          if (!startDateTime) {
            this.logService.info("Substitution event before teams created, skipping");
            break;
          }
          endDateTime = new Date(timestamp);

          try {
            const mappedTeams: MatchPlayer[][] = await this.mapNeatQueueTeamsToMatchPlayers(
              neatQueueConfig.GuildId,
              seriesTeams,
            );
            const subSeries = await this.getSeriesData(
              neatQueueConfig.GuildId,
              mappedTeams,
              startDateTime,
              endDateTime,
              true,
            );

            series.push(...subSeries);
          } catch (error) {
            // don't fail if its just a substitution
            this.logService.info(error as Error, new Map([["reason", "No series data from substitution"]]));
            this.haloService.clearUserCache();
          }

          const { player_subbed_out, player_subbed_in } = event;
          for (const team of seriesTeams) {
            const playerIndex = team.findIndex((player) => player.id === player_subbed_out.id);
            if (playerIndex !== -1) {
              team[playerIndex] = player_subbed_in;
              break;
            }
          }

          startDateTime = new Date(timestamp);
          endDateTime = null;
          break;
        }
        case "MATCH_COMPLETED": {
          if (event.winning_team_index === -1) {
            await this.clearTimeline(event, neatQueueConfig);
            break;
          }

          endDateTime = new Date(timestamp);
          if (seriesTeams.length === 0) {
            this.logService.warn("No teams found in timeline for match completed, using event teams");
            // it's supposed to come from the timeline, but if the timeline is corrupt or incomplete, use the event
            seriesTeams = event.teams;
          }

          const mappedTeams: MatchPlayer[][] = await this.mapNeatQueueTeamsToMatchPlayers(
            neatQueueConfig.GuildId,
            seriesTeams,
          );
          const subSeries = await this.getSeriesData(
            neatQueueConfig.GuildId,
            mappedTeams,
            startDateTime ?? sub(endDateTime, { hours: 6 }),
            endDateTime,
            false,
          );
          series.push(...subSeries);
          break;
        }
        default: {
          this.logService.warn("Unknown event action", new Map([["action", action]]));
        }
      }
    }

    return series;
  }

  private async mapNeatQueueTeamsToMatchPlayers(
    guildId: string,
    seriesTeams: NeatQueuePlayer[][],
  ): Promise<MatchPlayer[][]> {
    const mappedTeams: MatchPlayer[][] = [];
    for (const team of seriesTeams) {
      const mappedTeam: MatchPlayer[] = [];
      for (const player of team) {
        const users = await this.discordService.getUsers(guildId, [player.id]);
        const member = Preconditions.checkExists(users[0], "expected user for match completed");
        mappedTeam.push({
          id: player.id,
          username: member.user.username,
          globalName: member.user.global_name,
          guildNickname: member.nick ?? null,
        });
      }
      mappedTeams.push(mappedTeam);
    }
    return mappedTeams;
  }

  private async getSeriesData(
    guildId: string,
    teams: MatchPlayer[][],
    startDateTime: Date,
    endDateTime: Date,
    isSubstitution: boolean,
  ): Promise<MatchStats[]> {
    const { haloService, discordService } = this;
    const users = await discordService.getUsers(
      guildId,
      teams.flatMap((team) => team.map((player) => player.id)),
    );

    return await haloService.getSeriesFromDiscordQueue(
      {
        teams: teams.map((team) =>
          team.map(({ id: playerId }) => {
            const member = Preconditions.checkExists(users.find(({ user: { id } }) => id === playerId));

            return {
              id: playerId,
              username: member.user.username,
              globalName: member.user.global_name,
              guildNickname: member.nick ?? null,
            };
          }),
        ),
        startDateTime,
        endDateTime,
      },
      isSubstitution,
    );
  }

  private async postSeriesDataByThread({
    request,
    neatQueueConfig,
    series,
    timeline,
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    series: MatchStats[];
    timeline: NeatQueueTimelineEvent[];
  }): Promise<void> {
    const { discordService } = this;
    let foundResultsMessage = false;
    let useFallback = true;
    let thread: RESTPostAPIChannelThreadsResult | undefined;

    try {
      const resultsMessage = await discordService.getTeamsFromQueueResult(
        neatQueueConfig.GuildId,
        neatQueueConfig.ResultsChannelId,
        request.match_number,
      );
      foundResultsMessage = true;

      const { channel_id: channelId, id: messageId } = resultsMessage.message;
      thread = await discordService.startThreadFromMessage(
        channelId,
        messageId,
        `Queue #${request.match_number.toString()} series stats`,
      );
      useFallback = false;

      const finalTeams = this.getTeams(request);
      const substitutions = this.getSubstitutionsFromTimeline(timeline, finalTeams);
      const seriesOverviewEmbed = await this.getSeriesOverviewEmbed({
        guildId: request.guild,
        channelId,
        messageId,
        queue: request.match_number,
        series,
        finalTeams,
        substitutions,
      });
      await discordService.createMessage(thread.id, {
        embeds: [seriesOverviewEmbed],
      });

      await this.postSeriesDetailsToChannel(thread.id, request.guild, series);
    } catch (error) {
      this.logService.warn(error as Error, new Map([["reason", "Failed to post series data to thread"]]));

      if (!foundResultsMessage) {
        return;
      }

      if (useFallback) {
        this.logService.info("Attempting to post direct to channel");

        await this.postSeriesDataByChannel({ request, neatQueueConfig, series, timeline });
      } else if (thread != null) {
        this.logService.info("Attempting to post error to thread");

        const endUserError = this.getEndUserErrorEmbed(error as Error, request, neatQueueConfig, timeline);
        await discordService.createMessage(thread.id, {
          embeds: [endUserError.discordEmbed],
          components: endUserError.discordActions,
        });
      }
    }
  }

  private async postErrorByThread({
    request,
    neatQueueConfig,
    handledError,
    timeline,
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    handledError: Error;
    timeline: NeatQueueTimelineEvent[];
  }): Promise<void> {
    const { discordService } = this;
    let useFallback = false;

    try {
      const resultsMessage = await discordService.getTeamsFromQueueResult(
        neatQueueConfig.GuildId,
        neatQueueConfig.ResultsChannelId,
        request.match_number,
      );
      useFallback = true;

      const { channel_id: channelId, id: messageId } = resultsMessage.message;
      const thread = await discordService.startThreadFromMessage(
        channelId,
        messageId,
        `Queue #${request.match_number.toString()} series stats`,
      );

      const endUserError = this.getEndUserErrorEmbed(handledError, request, neatQueueConfig, timeline);
      await discordService.createMessage(thread.id, {
        embeds: [endUserError.discordEmbed],
        components: endUserError.discordActions,
      });
    } catch (error) {
      this.logService.warn(error as Error, new Map([["reason", "Failed to post error to thread"]]));

      if (useFallback) {
        this.logService.info("Attempting to post direct to channel");

        await this.postErrorByChannel({ request, neatQueueConfig, handledError, timeline });
      }
    }
  }

  private async postSeriesDataByChannel({
    request,
    neatQueueConfig,
    series,
    timeline,
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    series: MatchStats[];
    timeline: NeatQueueTimelineEvent[];
  }): Promise<void> {
    const { discordService } = this;
    let channelId = neatQueueConfig.PostSeriesChannelId ?? neatQueueConfig.ResultsChannelId;

    try {
      const resultsMessage = await discordService.getTeamsFromQueueResult(
        neatQueueConfig.GuildId,
        neatQueueConfig.ResultsChannelId,
        request.match_number,
      );

      const finalTeams = this.getTeams(request);
      const substitutions = this.getSubstitutionsFromTimeline(timeline, finalTeams);
      const seriesOverviewEmbed = await this.getSeriesOverviewEmbed({
        guildId: request.guild,
        channelId: resultsMessage.message.channel_id,
        messageId: resultsMessage.message.id,
        queue: request.match_number,
        series: series,
        finalTeams,
        substitutions,
      });

      const createdMessage = await discordService.createMessage(channelId, {
        embeds: [seriesOverviewEmbed],
      });

      const thread = await discordService.startThreadFromMessage(
        channelId,
        createdMessage.id,
        `Queue #${request.match_number.toString()} series stats`,
      );

      channelId = thread.id;
      await this.postSeriesDetailsToChannel(channelId, request.guild, series);
    } catch (error) {
      this.logService.error(error as Error, new Map([["reason", "Failed to post series data direct to channel"]]));

      const endUserError = this.getEndUserErrorEmbed(error as Error, request, neatQueueConfig, timeline);
      await discordService.createMessage(channelId, {
        embeds: [endUserError.discordEmbed],
        components: endUserError.discordActions,
      });
    }
  }

  private getTeams(request: NeatQueueMatchCompletedRequest): SeriesOverviewEmbedFinalTeams[] {
    return request.teams.map((team, teamIndex) => ({
      name: team[0]?.team_name ?? `Team ${(teamIndex + 1).toLocaleString()}`,
      playerIds: team.map((player) => player.id),
    }));
  }

  private getSubstitutionsFromTimeline(
    timeline: NeatQueueTimelineEvent[],
    finalTeams: SeriesOverviewEmbedFinalTeams[],
  ): SeriesOverviewEmbedSubstitution[] {
    return timeline
      .filter((event) => event.event.action === "SUBSTITUTION")
      .map((event) => {
        const { player_subbed_out, player_subbed_in } = event.event as NeatQueueSubstitutionRequest;
        return {
          date: new Date(event.timestamp),
          playerOut: player_subbed_out.id,
          playerIn: player_subbed_in.id,
          team:
            player_subbed_out.team_name ??
            finalTeams[player_subbed_out.team_num - 1]?.name ??
            `Team ${player_subbed_out.team_num.toLocaleString()}`,
        };
      });
  }

  private async postErrorByChannel({
    request,
    neatQueueConfig,
    handledError,
    timeline,
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    handledError: Error;
    timeline: NeatQueueTimelineEvent[];
  }): Promise<void> {
    const { discordService } = this;
    const endUserError = this.getEndUserErrorEmbed(handledError, request, neatQueueConfig, timeline);

    try {
      const channelId = neatQueueConfig.PostSeriesChannelId ?? neatQueueConfig.ResultsChannelId;
      await discordService.createMessage(channelId, {
        embeds: [endUserError.discordEmbed],
        components: endUserError.discordActions,
      });
    } catch (error) {
      this.logService.error(error as Error, new Map([["reason", "Failed to post error direct to channel"]]));
    }
  }

  private async postSeriesDetailsToChannel(channelId: string, guildId: string, series: MatchStats[]): Promise<void> {
    const { databaseService, discordService, haloService } = this;

    const guildConfig = await databaseService.getGuildConfig(guildId);

    const seriesTeamsEmbed = new SeriesTeamsEmbed({ discordService, haloService, guildConfig, locale: this.locale });
    const seriesTeamsEmbedOutput = await seriesTeamsEmbed.getSeriesEmbed(series);
    await discordService.createMessage(channelId, {
      embeds: [seriesTeamsEmbedOutput],
    });

    const seriesPlayers = await haloService.getPlayerXuidsToGametags(series);
    const seriesPlayersEmbed = new SeriesPlayersEmbed({
      discordService,
      haloService,
      guildConfig,
      locale: this.locale,
    });
    const seriesPlayersEmbedsOutput = await seriesPlayersEmbed.getSeriesEmbed(series, seriesPlayers, this.locale);
    for (const seriesPlayersEmbedOutput of seriesPlayersEmbedsOutput) {
      await discordService.createMessage(channelId, {
        embeds: [seriesPlayersEmbedOutput],
      });
    }

    if (guildConfig.StatsReturn === StatsReturnType.SERIES_ONLY) {
      await discordService.createMessage(channelId, {
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: StatsInteractionButton.LoadGames,
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
        const matchEmbed = this.getMatchEmbed(guildConfig, match, this.locale);
        const embed = await matchEmbed.getEmbed(match, players);

        await discordService.createMessage(channelId, { embeds: [embed] });
      }
    }
  }

  private async getSeriesOverviewEmbed({
    guildId,
    channelId,
    messageId,
    queue,
    series,
    finalTeams,
    substitutions,
  }: {
    guildId: string;
    channelId: string;
    messageId: string;
    queue: number;
    series: MatchStats[];
    finalTeams: SeriesOverviewEmbedFinalTeams[];
    substitutions: SeriesOverviewEmbedSubstitution[];
  }): Promise<APIEmbed> {
    const { discordService, haloService } = this;
    const seriesOverviewEmbed = new SeriesOverviewEmbed({ discordService, haloService });
    return await seriesOverviewEmbed.getEmbed({
      guildId,
      channelId,
      messageId,
      locale: this.locale,
      queue,
      series,
      finalTeams,
      substitutions,
      hideTeamsDescription: true,
    });
  }

  private async clearTimeline(request: NeatQueueTimelineRequest, neatQueueConfig: NeatQueueConfigRow): Promise<void> {
    await this.env.APP_DATA.delete(this.getTimelineKey(request, neatQueueConfig));
  }

  private getMatchEmbed(
    guildConfig: GuildConfigRow,
    match: MatchStats,
    locale: string,
  ): BaseMatchEmbed<GameVariantCategory> {
    return create({
      discordService: this.discordService,
      haloService: this.haloService,
      guildConfig,
      gameVariantCategory: match.MatchInfo.GameVariantCategory,
      locale,
    });
  }

  private getEndUserErrorEmbed(
    error: Error,
    request: NeatQueueMatchCompletedRequest,
    neatQueueConfig: NeatQueueConfigRow,
    timeline: NeatQueueTimelineEvent[],
  ): EndUserError {
    const { discordService } = this;
    const endUserError =
      error instanceof EndUserError
        ? error
        : new EndUserError("Something went wrong while trying to post series data", {
            actions: ["retry"],
          });
    const matchStartedEvent = timeline.find(({ event }) => event.action === "MATCH_STARTED");
    const matchCompletedEvent = timeline.find(({ event }) => event.action === "MATCH_COMPLETED");
    const substitutionEvents = timeline.filter(
      ({ event, timestamp }) =>
        event.action === "SUBSTITUTION" && matchStartedEvent != null && isAfter(timestamp, matchStartedEvent.timestamp),
    );

    endUserError.appendData({
      Channel: `<#${neatQueueConfig.ResultsChannelId}>`,
      Queue: request.match_number.toString(),
    });

    if (matchStartedEvent != null) {
      endUserError.appendData({
        Started: discordService.getTimestamp(matchStartedEvent.timestamp),
      });
    }
    if (matchCompletedEvent != null) {
      endUserError.appendData({
        Completed: discordService.getTimestamp(matchCompletedEvent.timestamp),
      });
    }
    if (substitutionEvents.length > 0) {
      endUserError.appendData({
        Substitutions: substitutionEvents
          .map(({ event, timestamp }) => {
            const { player_subbed_out, player_subbed_in } = event as NeatQueueSubstitutionRequest;
            return `<@${player_subbed_in.id}> subbed in for <@${player_subbed_out.id}> on ${discordService.getTimestamp(timestamp)}`;
          })
          .join(", "),
      });
    }

    return endUserError;
  }
}
