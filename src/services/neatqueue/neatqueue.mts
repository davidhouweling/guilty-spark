import { createHmac } from "crypto";
import { inspect } from "util";
import type { MatchStats, GameVariantCategory } from "halo-infinite-api";
import type { RESTPostAPIChannelThreadsResult, APIEmbed } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { sub, isAfter } from "date-fns";
import type { DatabaseService } from "../database/database.mjs";
import type { NeatQueueConfigRow } from "../database/types/neat_queue_config.mjs";
import { NeatQueuePostSeriesDisplayMode } from "../database/types/neat_queue_config.mjs";
import type { DiscordService } from "../discord/discord.mjs";
import type { HaloService } from "../halo/halo.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { SeriesOverviewEmbed } from "../../embeds/series-overview-embed.mjs";
import { SeriesTeamsEmbed } from "../../embeds/series-teams-embed.mjs";
import { SeriesPlayersEmbed } from "../../embeds/series-players-embed.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import type { GuildConfigRow } from "../database/types/guild_config.mjs";
import { StatsReturnType } from "../database/types/guild_config.mjs";
import { InteractionButton as StatsInteractionButton } from "../../commands/stats/stats.mjs";
import type { BaseMatchEmbed } from "../../embeds/base-match-embed.mjs";
import type { LogService } from "../log/types.mjs";
import { EndUserError } from "../../base/end-user-error.mjs";
import { create } from "../../embeds/create.mjs";
import type {
  VerifyNeatQueueResponse,
  NeatQueueRequest,
  NeatQueueMatchCompletedRequest,
  NeatQueueTimelineEvent,
  NeatQueueTimelineRequest,
  NeatQueueSubstitutionRequest,
  NeatQueuePlayer,
} from "./types.mjs";

export interface NeatQueueServiceOpts {
  env: Env;
  logService: LogService;
  databaseService: DatabaseService;
  discordService: DiscordService;
  haloService: HaloService;
}

export class NeatQueueService {
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly databaseService: DatabaseService;
  private readonly discordService: DiscordService;
  private readonly haloService: HaloService;
  private readonly locale = "en-US";

  constructor({ env, logService, databaseService, discordService, haloService }: NeatQueueServiceOpts) {
    this.env = env;
    this.logService = logService;
    this.databaseService = databaseService;
    this.discordService = discordService;
    this.haloService = haloService;
  }

  hashAuthorizationKey(key: string, guildId: string): string {
    const hmac = createHmac("sha256", guildId);
    hmac.update(key);
    return hmac.digest("hex");
  }

  async verifyRequest(request: Request): Promise<VerifyNeatQueueResponse> {
    const authorization = request.headers.get("authorization");
    try {
      if (authorization == null) {
        return { isValid: false, error: "Missing Authorization header" };
      }

      const body = await request.json<NeatQueueRequest>();

      const neatQueueConfig = await this.findNeatQueueConfig(body, authorization);
      if (neatQueueConfig == null) {
        return { isValid: false };
      }

      return { isValid: true, interaction: body, neatQueueConfig };
    } catch (error) {
      this.logService.error(error as Error);

      return { isValid: false, error: "Invalid JSON" };
    }
  }

  handleRequest(
    request: NeatQueueRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): { response: Response; jobToComplete?: () => Promise<void> } {
    this.logService.info(inspect(request, { depth: null, colors: this.env.MODE === "development" }));

    switch (request.action) {
      case "JOIN_QUEUE":
      case "LEAVE_QUEUE":
      case "MATCH_CANCELLED": {
        return { response: new Response("OK") };
      }
      case "MATCH_STARTED":
      case "TEAMS_CREATED":
      case "SUBSTITUTION": {
        return {
          response: new Response("OK"),
          jobToComplete: async () => this.extendTimeline(request, neatQueueConfig),
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

  private async matchCompletedJob(
    request: NeatQueueMatchCompletedRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<void> {
    const timeline = await this.getTimeline(request, neatQueueConfig);
    timeline.push({ timestamp: new Date().toISOString(), event: request });

    let seriesData: MatchStats[] = [];
    let errorOccurred = false;

    try {
      seriesData = await this.getSeriesDataFromTimeline(timeline, neatQueueConfig);
    } catch (error) {
      this.logService.info(error as Error, new Map([["reason", "Failed to get series data from timeline"]]));
      errorOccurred = true;

      const opts = { request, neatQueueConfig, handledError: error as Error, timeline };
      await this.handlePostSeriesError(neatQueueConfig.PostSeriesMode, opts);
    }

    if (!errorOccurred && seriesData.length > 0) {
      const opts = { request, neatQueueConfig, seriesData, timeline };
      await this.handlePostSeriesData(neatQueueConfig.PostSeriesMode, opts);
    }

    await Promise.all([this.clearTimeline(request, neatQueueConfig), this.haloService.updateDiscordAssociations()]);
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
      seriesData: MatchStats[];
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

  private async getSeriesDataFromTimeline(
    timeline: NeatQueueTimelineEvent[],
    neatQueueConfig: NeatQueueConfigRow,
  ): Promise<MatchStats[]> {
    const seriesData: MatchStats[] = [];
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
            this.logService.debug("Substitution event before teams created, skipping");
            break;
          }
          endDateTime = new Date(timestamp);

          try {
            const series = await this.getSeriesData(
              Preconditions.checkExists(seriesTeams, "expected seriesTeams"),
              startDateTime,
              endDateTime,
            );

            seriesData.push(...series);
          } catch (error) {
            // don't fail if its just a substitution
            this.logService.info(error as Error, new Map([["reason", "No series data from substitution"]]));
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

          const series = await this.getSeriesData(
            seriesTeams,
            startDateTime ?? sub(endDateTime, { hours: 6 }),
            endDateTime,
          );
          seriesData.push(...series);
          break;
        }
        default: {
          this.logService.warn("Unknown event action", new Map([["action", action]]));
        }
      }
    }

    return seriesData;
  }

  private async getSeriesData(
    teams: NeatQueuePlayer[][],
    startDateTime: Date,
    endDateTime: Date,
  ): Promise<MatchStats[]> {
    const { haloService, discordService } = this;
    const users = await discordService.getUsers(teams.flatMap((team) => team.map((player) => player.id)));

    return await haloService.getSeriesFromDiscordQueue({
      teams: teams.map((team) =>
        team.map(({ id: playerId }) => {
          const user = Preconditions.checkExists(users.find(({ id }) => id === playerId));

          return {
            id: playerId,
            username: user.username,
            globalName: user.global_name,
          };
        }),
      ),
      startDateTime,
      endDateTime,
    });
  }

  private async postSeriesDataByThread({
    request,
    neatQueueConfig,
    seriesData,
    timeline,
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    seriesData: MatchStats[];
    timeline: NeatQueueTimelineEvent[];
  }): Promise<void> {
    const { discordService } = this;
    let useFallback = true;
    let thread: RESTPostAPIChannelThreadsResult | undefined;

    try {
      const resultsMessage = await discordService.getTeamsFromQueue(
        neatQueueConfig.ResultsChannelId,
        request.match_number,
      );
      if (resultsMessage == null) {
        useFallback = false;
        throw new EndUserError("Failed to find the results message", { handled: true });
      }

      const { channel_id: channelId, id: messageId } = resultsMessage.message;
      thread = await discordService.startThreadFromMessage(
        channelId,
        messageId,
        `Queue #${request.match_number.toString()} series stats`,
      );
      useFallback = false;

      const seriesOverviewEmbed = await this.getSeriesOverviewEmbed({
        request,
        channelId,
        messageId,
        seriesData,
        timeline,
      });
      await discordService.createMessage(thread.id, {
        embeds: [seriesOverviewEmbed],
      });

      await this.postSeriesDetailsToChannel(thread.id, request.guild, seriesData);
    } catch (error) {
      this.logService.warn(error as Error, new Map([["reason", "Failed to post series data to thread"]]));

      if (useFallback) {
        this.logService.info("Attempting to post direct to channel");

        await this.postSeriesDataByChannel({ request, neatQueueConfig, seriesData, timeline });
      } else if (thread != null) {
        this.logService.info("Attempting to post error to thread");

        const endUserError = this.getEndUserErrorEmbed(error as Error, request, neatQueueConfig, timeline);
        await discordService.createMessage(thread.id, {
          embeds: [endUserError.discordEmbed],
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
    let useFallback = true;

    try {
      const resultsMessage = await discordService.getTeamsFromQueue(
        neatQueueConfig.ResultsChannelId,
        request.match_number,
      );
      if (resultsMessage == null) {
        useFallback = false;
        throw new EndUserError("Failed to find the results message", { handled: true });
      }

      const { channel_id: channelId, id: messageId } = resultsMessage.message;
      const thread = await discordService.startThreadFromMessage(
        channelId,
        messageId,
        `Queue #${request.match_number.toString()} series stats`,
      );

      const endUserError = this.getEndUserErrorEmbed(handledError, request, neatQueueConfig, timeline);
      await discordService.createMessage(thread.id, {
        embeds: [endUserError.discordEmbed],
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
    seriesData,
    timeline,
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    seriesData: MatchStats[];
    timeline: NeatQueueTimelineEvent[];
  }): Promise<void> {
    const { discordService } = this;
    let channelId = neatQueueConfig.PostSeriesChannelId ?? neatQueueConfig.ResultsChannelId;

    try {
      const resultsMessage = await discordService.getTeamsFromQueue(
        neatQueueConfig.ResultsChannelId,
        request.match_number,
      );
      if (resultsMessage == null) {
        throw new EndUserError("Failed to find the results message");
      }

      const seriesOverviewEmbed = await this.getSeriesOverviewEmbed({
        request,
        channelId: resultsMessage.message.channel_id,
        messageId: resultsMessage.message.id,
        seriesData,
        timeline,
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
      await this.postSeriesDetailsToChannel(channelId, request.guild, seriesData);
    } catch (error) {
      this.logService.error(error as Error, new Map([["reason", "Failed to post series data direct to channel"]]));

      const endUserError = this.getEndUserErrorEmbed(error as Error, request, neatQueueConfig, timeline);
      await discordService.createMessage(channelId, {
        embeds: [endUserError.discordEmbed],
      });
    }
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
      });
    } catch (error) {
      this.logService.error(error as Error, new Map([["reason", "Failed to post error direct to channel"]]));
    }
  }

  private async postSeriesDetailsToChannel(
    channelId: string,
    guildId: string,
    seriesData: MatchStats[],
  ): Promise<void> {
    const { databaseService, discordService, haloService } = this;

    const guildConfig = await databaseService.getGuildConfig(guildId);

    const seriesTeamsEmbed = new SeriesTeamsEmbed({ discordService, haloService, guildConfig, locale: this.locale });
    const seriesTeamsEmbedOutput = await seriesTeamsEmbed.getSeriesEmbed(seriesData);
    await discordService.createMessage(channelId, {
      embeds: [seriesTeamsEmbedOutput],
    });

    const seriesPlayers = await haloService.getPlayerXuidsToGametags(seriesData);
    const seriesPlayersEmbed = new SeriesPlayersEmbed({
      discordService,
      haloService,
      guildConfig,
      locale: this.locale,
    });
    const seriesPlayersEmbedsOutput = await seriesPlayersEmbed.getSeriesEmbed(seriesData, seriesPlayers, this.locale);
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
                custom_id: StatsInteractionButton.LoadGames.toString(),
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
      for (const match of seriesData) {
        const players = await haloService.getPlayerXuidsToGametags(match);
        const matchEmbed = this.getMatchEmbed(guildConfig, match, this.locale);
        const embed = await matchEmbed.getEmbed(match, players);

        await discordService.createMessage(channelId, { embeds: [embed] });
      }
    }
  }

  private async getSeriesOverviewEmbed({
    request,
    channelId,
    messageId,
    seriesData,
    timeline,
  }: {
    request: NeatQueueMatchCompletedRequest;
    channelId: string;
    messageId: string;
    seriesData: MatchStats[];
    timeline: NeatQueueTimelineEvent[];
  }): Promise<APIEmbed> {
    const { discordService, haloService } = this;
    const seriesOverviewEmbed = new SeriesOverviewEmbed({ discordService, haloService });
    const finalTeams = request.teams.map((team, teamIndex) => ({
      name: team[0]?.team_name ?? `Team ${(teamIndex + 1).toLocaleString()}`,
      playerIds: team.map((player) => player.id),
    }));
    const substitutions = timeline
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

    return await seriesOverviewEmbed.getEmbed({
      guildId: request.guild,
      channel: channelId,
      messageId,
      locale: this.locale,
      queue: request.match_number,
      series: seriesData,
      finalTeams: request.teams.map((team, teamIndex) => ({
        name: team[0]?.team_name ?? `Team ${(teamIndex + 1).toLocaleString()}`,
        playerIds: team.map((player) => player.id),
      })),
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
      error instanceof EndUserError ? error : new EndUserError("Something went wrong while trying to post series data");
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
