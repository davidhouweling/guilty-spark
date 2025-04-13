import { createHmac } from "crypto";
import { inspect } from "util";
import type { MatchStats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
import { sub } from "date-fns";
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

interface NeatQueuePlayer {
  name: string;
  id: string;
  mmr: number;
  role: string | null;
  team_num: number;
  top_role_index: number;
  ign: string | null;
  timestamp: string;
  pulled_from: string | null;
  team_name: string | null;
  party_leader: string | null;
  captain: string | null;
  picked: boolean;
  mmr_change: number;
  priority: number;
  guild_id: string;
  mmr_multiplier: number;
  points_multiplier: number;
  tournament_team_id: string | null;
  queue_entry_survey: Record<string, unknown>;
}

interface NeatQueueBaseRequest {
  action: string;
  guild: string;
  channel: string;
  queue: string;
}

export interface NeatQueueJoinQueueRequest extends NeatQueueBaseRequest {
  action: "JOIN_QUEUE";
  players: NeatQueuePlayer[];
  new_players: NeatQueuePlayer[];
}

export interface NeatQueueLeaveQueueRequest extends NeatQueueBaseRequest {
  action: "LEAVE_QUEUE";
  players: NeatQueuePlayer[];
  players_removed: NeatQueuePlayer[];
}

export interface NeatQueueMatchStartedRequest extends NeatQueueBaseRequest {
  action: "MATCH_STARTED";
  players: NeatQueuePlayer[];
  match_num: number;
}

export interface NeatQueueTeamsCreatedRequest extends NeatQueueBaseRequest {
  action: "TEAMS_CREATED";
  match_number: number;
  teams: NeatQueuePlayer[][];
  match_details: unknown[];
  lobby_details: unknown;
}

export interface NeatQueueSubstitutionRequest extends NeatQueueBaseRequest {
  action: "SUBSTITUTION";
  match_number: number;
  player_subbed_out: NeatQueuePlayer;
  player_subbed_in: NeatQueuePlayer;
}

export interface NeatQueueMatchCompletedRequest extends NeatQueueBaseRequest {
  action: "MATCH_COMPLETED";
  match_number: number;
  /**
   * Index of the winning team in the teams array
   *
   * -1 if the match was cancelled
   */
  winning_team_index: number;
  teams: NeatQueuePlayer[][];
}

export type NeatQueueRequest =
  | NeatQueueJoinQueueRequest
  | NeatQueueLeaveQueueRequest
  | NeatQueueMatchStartedRequest
  | NeatQueueTeamsCreatedRequest
  | NeatQueueSubstitutionRequest
  | NeatQueueMatchCompletedRequest;

export type VerifyNeatQueueResponse =
  | {
      isValid: true;
      interaction: NeatQueueRequest;
      neatQueueConfig: NeatQueueConfigRow;
    }
  | {
      isValid: false;
      error?: string;
    };

interface NeatQueueTimelineEvent {
  timestamp: string;
  event: NeatQueueRequest;
}

export interface NeatQueueServiceOpts {
  env: Env;
  databaseService: DatabaseService;
  discordService: DiscordService;
  haloService: HaloService;
}

export class NeatQueueService {
  private readonly env: Env;
  private readonly databaseService: DatabaseService;
  private readonly discordService: DiscordService;
  private readonly haloService: HaloService;
  private readonly locale = "en-US";

  constructor(opts: NeatQueueServiceOpts) {
    this.env = opts.env;
    this.databaseService = opts.databaseService;
    this.discordService = opts.discordService;
    this.haloService = opts.haloService;
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
      console.error(error);
      console.trace();

      return { isValid: false, error: "Invalid JSON" };
    }
  }

  handleRequest(
    request: NeatQueueRequest,
    neatQueueConfig: NeatQueueConfigRow,
  ): { response: Response; jobToComplete?: () => Promise<void> } {
    console.log(inspect(request, { depth: null, colors: true }));

    switch (request.action) {
      case "JOIN_QUEUE":
      case "LEAVE_QUEUE": {
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
        console.error("Unknown action", request);
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

    const seriesData = await this.getSeriesDataFromTimeline(timeline);
    const opts = {
      request,
      neatQueueConfig,
      seriesData,
      timeline,
    };

    if (seriesData.length > 0) {
      const { PostSeriesMode } = neatQueueConfig;
      switch (PostSeriesMode) {
        case NeatQueuePostSeriesDisplayMode.THREAD: {
          await this.postSeriesDataByThread(opts);
          break;
        }
        case NeatQueuePostSeriesDisplayMode.MESSAGE:
        case NeatQueuePostSeriesDisplayMode.CHANNEL: {
          await this.postSeriesDataByChannel(opts);
          break;
        }
        default: {
          throw new UnreachableError(PostSeriesMode);
        }
      }
    }

    await this.clearTimeline(request, neatQueueConfig);
  }

  private getTimelineKey(request: NeatQueueRequest, neatQueueConfig: NeatQueueConfigRow): string {
    return `neatqueue:${neatQueueConfig.GuildId}:${neatQueueConfig.ChannelId}:${request.queue}`;
  }

  private async getTimeline(
    request: NeatQueueRequest,
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
      console.error(error);
      return [];
    }
  }

  private async extendTimeline(request: NeatQueueRequest, neatQueueConfig: NeatQueueConfigRow): Promise<void> {
    const timeline = await this.getTimeline(request, neatQueueConfig);
    timeline.push({ timestamp: new Date().toISOString(), event: request });

    await this.env.APP_DATA.put(this.getTimelineKey(request, neatQueueConfig), JSON.stringify(timeline), {
      metadata: { expirationTtl: 60 * 60 * 24 }, // 1 day
    });
  }

  private async getSeriesDataFromTimeline(timeline: NeatQueueTimelineEvent[]): Promise<MatchStats[]> {
    const seriesData: MatchStats[] = [];
    let seriesTeams: NeatQueuePlayer[][] = [];
    let startDateTime: Date | null = null;
    let endDateTime: Date | null = null;

    for (const { timestamp, event } of timeline) {
      const { action } = event;

      switch (action) {
        case "JOIN_QUEUE":
        case "LEAVE_QUEUE":
        case "MATCH_STARTED": {
          break;
        }
        case "TEAMS_CREATED": {
          startDateTime = new Date(timestamp);
          seriesTeams = event.teams;
          break;
        }
        case "SUBSTITUTION": {
          endDateTime = new Date(timestamp);
          const series = await this.getSeriesData(
            Preconditions.checkExists(seriesTeams, "expected seriesTeams"),
            Preconditions.checkExists(startDateTime, "expected startDateTime"),
            Preconditions.checkExists(endDateTime, "expected endDateTime"),
          );

          seriesData.push(...series);

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
          endDateTime = new Date(timestamp);
          const series = await this.getSeriesData(
            Preconditions.checkExists(seriesTeams, "expected seriesTeams"),
            startDateTime ?? sub(endDateTime, { hours: 6 }),
            Preconditions.checkExists(endDateTime, "expected endDateTime"),
          );

          seriesData.push(...series);

          break;
        }
        default:
          console.warn("Unknown event action", action);
      }
    }

    return seriesData;
  }

  private async getSeriesData(
    teams: NeatQueuePlayer[][],
    startDateTime: Date,
    endDateTime: Date,
  ): Promise<MatchStats[]> {
    return await this.haloService.getSeriesFromDiscordQueue({
      teams: teams.map((team) =>
        team.map((player) => ({
          id: player.id,
          username: player.name,
          globalName: null,
        })),
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
    let useFallback = true;

    try {
      const resultsMessage = await this.discordService.getTeamsFromQueue(
        neatQueueConfig.ResultsChannelId,
        request.match_number,
      );
      if (resultsMessage == null) {
        useFallback = false;
        throw new Error("Failed to get results message");
      }

      const { channel_id: channelId, id: messageId } = resultsMessage.message;
      const thread = await this.discordService.startThreadFromMessage(
        channelId,
        messageId,
        `Queue #${request.match_number.toString()} series stats`,
      );
      useFallback = false;

      const seriesEmbeds = [
        await this.getSeriesOverviewEmbed({ request, channelId, messageId, seriesData, timeline }),
        ...(await this.getSeriesEmbeds(request.guild, seriesData)),
      ];
      for (const embed of seriesEmbeds) {
        await this.discordService.createMessage(thread.id, {
          embeds: [embed],
        });
      }
    } catch (error) {
      console.error("Failed to post series data by thread", error);

      if (useFallback) {
        console.info("Attempting to post direct to channel", error);
        await this.postSeriesDataByChannel({ request, neatQueueConfig, seriesData, timeline });
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
    try {
      const resultsMessage = await this.discordService.getTeamsFromQueue(
        neatQueueConfig.ResultsChannelId,
        request.match_number,
      );
      if (resultsMessage == null) {
        throw new Error("Failed to get results message");
      }

      const seriesOverviewEmbed = await this.getSeriesOverviewEmbed({
        request,
        channelId: resultsMessage.message.channel_id,
        messageId: resultsMessage.message.id,
        seriesData,
        timeline,
      });

      const channelId = neatQueueConfig.PostSeriesChannelId ?? neatQueueConfig.ResultsChannelId;
      const createdMessage = await this.discordService.createMessage(channelId, {
        embeds: [seriesOverviewEmbed],
      });

      const thread = await this.discordService.startThreadFromMessage(
        channelId,
        createdMessage.id,
        `Queue #${request.match_number.toString()} series stats`,
      );

      const seriesEmbeds = await this.getSeriesEmbeds(request.guild, seriesData);
      await this.discordService.createMessage(thread.id, {
        embeds: seriesEmbeds,
      });
    } catch (error) {
      console.error("Failed to post series data direct to channel", error);
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
    const substitutions = timeline
      .filter((event) => event.event.action === "SUBSTITUTION")
      .map((event) => {
        const { player_subbed_out, player_subbed_in } = event.event as NeatQueueSubstitutionRequest;
        return {
          date: new Date(event.timestamp),
          playerOut: player_subbed_out.id,
          playerIn: player_subbed_in.id,
          team: player_subbed_out.team_name ?? `Team ${player_subbed_out.team_num.toLocaleString()}`,
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

  private async getSeriesEmbeds(guildId: string, seriesData: MatchStats[]): Promise<APIEmbed[]> {
    const { databaseService, discordService, haloService } = this;

    const guildConfig = await databaseService.getGuildConfig(guildId);

    const seriesTeamsEmbed = new SeriesTeamsEmbed({ discordService, haloService, guildConfig, locale: this.locale });
    const seriesTeamsEmbedOutput = await seriesTeamsEmbed.getSeriesEmbed(seriesData);

    const seriesPlayers = await this.haloService.getPlayerXuidsToGametags(seriesData);
    const seriesPlayersEmbed = new SeriesPlayersEmbed({
      discordService,
      haloService,
      guildConfig,
      locale: this.locale,
    });
    const seriesPlayersEmbedOutput = await seriesPlayersEmbed.getSeriesEmbed(seriesData, seriesPlayers, this.locale);

    return [seriesTeamsEmbedOutput, seriesPlayersEmbedOutput];
  }

  private async clearTimeline(request: NeatQueueRequest, neatQueueConfig: NeatQueueConfigRow): Promise<void> {
    await this.env.APP_DATA.delete(this.getTimelineKey(request, neatQueueConfig));
  }
}
