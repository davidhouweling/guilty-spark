import { createHmac } from "crypto";
import { inspect } from "util";
import type { MatchStats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";
import type { RESTPostAPIChannelThreadsResult, APIEmbed } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
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
import type { GuildConfigRow } from "../database/types/guild_config.mjs";
import { StatsReturnType } from "../database/types/guild_config.mjs";
import { InteractionButton as StatsInteractionButton } from "../../commands/stats/stats.mjs";
import type { BaseMatchEmbed } from "../../embeds/base-match-embed.mjs";
import { AttritionMatchEmbed } from "../../embeds/attrition-match-embed.mjs";
import { CtfMatchEmbed } from "../../embeds/ctf-match-embed.mjs";
import { EliminationMatchEmbed } from "../../embeds/elimination-match-embed.mjs";
import { EscalationMatchEmbed } from "../../embeds/escalation-match-embed.mjs";
import { ExtractionMatchEmbed } from "../../embeds/extraction-match-embed.mjs";
import { FiestaMatchEmbed } from "../../embeds/fiesta-match-embed.mjs";
import { FirefightMatchEmbed } from "../../embeds/firefight-match-embed.mjs";
import { GrifballMatchEmbed } from "../../embeds/grifball-match-embed.mjs";
import { InfectionMatchEmbed } from "../../embeds/infection-match-embed.mjs";
import { KOTHMatchEmbed } from "../../embeds/koth-match-embed.mjs";
import { LandGrabMatchEmbed } from "../../embeds/land-grab-match-embed.mjs";
import { MinigameMatchEmbed } from "../../embeds/minigame-match-embed.mjs";
import { OddballMatchEmbed } from "../../embeds/oddball-match-embed.mjs";
import { SlayerMatchEmbed } from "../../embeds/slayer-match-embed.mjs";
import { StockpileMatchEmbed } from "../../embeds/stockpile-match-embed.mjs";
import { StrongholdsMatchEmbed } from "../../embeds/strongholds-match-embed.mjs";
import { TotalControlMatchEmbed } from "../../embeds/total-control-match-embed.mjs";
import { UnknownMatchEmbed } from "../../embeds/unknown-match-embed.mjs";
import { VIPMatchEmbed } from "../../embeds/vip-match-embed.mjs";
import type { LogService } from "../log/types.mjs";
import { EndUserError } from "../../base/end-user-error.mjs";

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
  captain: boolean | null;
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
  match_number?: number;
  player_subbed_out: NeatQueuePlayer;
  player_subbed_in: NeatQueuePlayer;
}

export interface NeatQueueMatchCancelledRequest extends NeatQueueBaseRequest {
  action: "MATCH_CANCELLED";
  teams: NeatQueuePlayer[][];
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
  | NeatQueueMatchCancelledRequest
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

type NeatQueueTimelineRequest =
  | NeatQueueMatchStartedRequest
  | NeatQueueTeamsCreatedRequest
  | NeatQueueSubstitutionRequest
  | NeatQueueMatchCompletedRequest;

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

      const opts = { request, neatQueueConfig, handledError: error as Error };
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
    opts: { request: NeatQueueMatchCompletedRequest; neatQueueConfig: NeatQueueConfigRow; handledError: Error },
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

          try {
            const series = await this.getSeriesData(
              Preconditions.checkExists(seriesTeams, "expected seriesTeams"),
              startDateTime,
              Preconditions.checkExists(endDateTime, "expected endDateTime"),
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
        default:
          this.logService.warn("Unknown event action", new Map([["action", action]]));
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
        const endUserError =
          error instanceof EndUserError
            ? error
            : new EndUserError("Failed to post series data", {
                data: {
                  Channel: `<#${neatQueueConfig.ResultsChannelId}>`,
                  Queue: request.match_number.toString(),
                },
              });
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
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    handledError: Error;
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

      await discordService.createMessage(thread.id, {
        content: handledError.message,
      });
    } catch (error) {
      this.logService.warn(error as Error, new Map([["reason", "Failed to post error to thread"]]));

      if (useFallback) {
        this.logService.info("Attempting to post direct to channel");

        await this.postErrorByChannel({ request, neatQueueConfig, handledError });
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
    try {
      const resultsMessage = await discordService.getTeamsFromQueue(
        neatQueueConfig.ResultsChannelId,
        request.match_number,
      );
      if (resultsMessage == null) {
        throw new EndUserError("Failed to get results message");
      }

      const seriesOverviewEmbed = await this.getSeriesOverviewEmbed({
        request,
        channelId: resultsMessage.message.channel_id,
        messageId: resultsMessage.message.id,
        seriesData,
        timeline,
      });

      const channelId = neatQueueConfig.PostSeriesChannelId ?? neatQueueConfig.ResultsChannelId;
      const createdMessage = await discordService.createMessage(channelId, {
        embeds: [seriesOverviewEmbed],
      });

      const thread = await discordService.startThreadFromMessage(
        channelId,
        createdMessage.id,
        `Queue #${request.match_number.toString()} series stats`,
      );

      await this.postSeriesDetailsToChannel(thread.id, request.guild, seriesData);
    } catch (error) {
      this.logService.error(error as Error, new Map([["reason", "Failed to post series data direct to channel"]]));
    }
  }

  private async postErrorByChannel({
    request,
    neatQueueConfig,
    handledError,
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    handledError: Error;
  }): Promise<void> {
    const { discordService } = this;

    const endUserError =
      handledError instanceof EndUserError
        ? handledError
        : new EndUserError("Failed to post series data", {
            data: {
              Channel: `<#${neatQueueConfig.ResultsChannelId}>`,
              Queue: request.match_number.toString(),
            },
          });

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
    const seriesPlayersEmbedOutput = await seriesPlayersEmbed.getSeriesEmbed(seriesData, seriesPlayers, this.locale);
    await discordService.createMessage(channelId, {
      embeds: [seriesPlayersEmbedOutput],
      components:
        guildConfig.StatsReturn === StatsReturnType.SERIES_ONLY
          ? [
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
            ]
          : [],
    });

    if (guildConfig.StatsReturn === StatsReturnType.SERIES_AND_GAMES) {
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

  private async clearTimeline(request: NeatQueueTimelineRequest, neatQueueConfig: NeatQueueConfigRow): Promise<void> {
    await this.env.APP_DATA.delete(this.getTimelineKey(request, neatQueueConfig));
  }

  private getMatchEmbed(
    guildConfig: GuildConfigRow,
    match: MatchStats,
    locale: string,
  ): BaseMatchEmbed<GameVariantCategory> {
    const opts = {
      discordService: this.discordService,
      haloService: this.haloService,
      guildConfig,
      locale,
    };

    switch (match.MatchInfo.GameVariantCategory) {
      case GameVariantCategory.MultiplayerAttrition:
        return new AttritionMatchEmbed(opts);
      case GameVariantCategory.MultiplayerCtf:
        return new CtfMatchEmbed(opts);
      case GameVariantCategory.MultiplayerElimination:
        return new EliminationMatchEmbed(opts);
      case GameVariantCategory.MultiplayerEscalation:
        return new EscalationMatchEmbed(opts);
      case GameVariantCategory.MultiplayerExtraction:
        return new ExtractionMatchEmbed(opts);
      case GameVariantCategory.MultiplayerFiesta:
        return new FiestaMatchEmbed(opts);
      case GameVariantCategory.MultiplayerFirefight:
        return new FirefightMatchEmbed(opts);
      case GameVariantCategory.MultiplayerGrifball:
        return new GrifballMatchEmbed(opts);
      case GameVariantCategory.MultiplayerInfection:
        return new InfectionMatchEmbed(opts);
      case GameVariantCategory.MultiplayerKingOfTheHill:
        return new KOTHMatchEmbed(opts);
      case GameVariantCategory.MultiplayerLandGrab:
        return new LandGrabMatchEmbed(opts);
      case GameVariantCategory.MultiplayerMinigame:
        return new MinigameMatchEmbed(opts);
      case GameVariantCategory.MultiplayerOddball:
        return new OddballMatchEmbed(opts);
      case GameVariantCategory.MultiplayerSlayer:
        return new SlayerMatchEmbed(opts);
      case GameVariantCategory.MultiplayerStockpile:
        return new StockpileMatchEmbed(opts);
      case GameVariantCategory.MultiplayerStrongholds:
        return new StrongholdsMatchEmbed(opts);
      case GameVariantCategory.MultiplayerTotalControl:
        return new TotalControlMatchEmbed(opts);
      case GameVariantCategory.MultiplayerVIP:
        return new VIPMatchEmbed(opts);
      default:
        return new UnknownMatchEmbed(opts);
    }
  }
}
