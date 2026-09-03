import { MatchOutcome } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import type { APIMessage } from "discord-api-types/v10";
import { sub } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { getObjectiveTimeSeconds } from "@guilty-spark/shared/halo/objective-metrics";
import { clampRatioForStorage, getSafeRatioValue } from "@guilty-spark/shared/halo/stat-formatting";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import { LEADERBOARD_MAX_PAGE_SIZE } from "@guilty-spark/shared/contracts/stats/leaderboard";
import {
  LeaderboardMetric,
  LeaderboardWindow,
  getLeaderboardMetricAggregation,
} from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardMetricAggregation } from "@guilty-spark/shared/halo/leaderboard";
import type { DatabaseService } from "../database/database";
import type { DiscordService } from "../discord/discord";
import { DiscordError } from "../discord/discord-error";
import type { LeaderboardSeriesRow } from "../database/types/leaderboard_series";
import type { LeaderboardSeriesPlayersRow } from "../database/types/leaderboard_series_players";
import type { LeaderboardGamesRow } from "../database/types/leaderboard_games";
import type { LeaderboardGamePlayersRow } from "../database/types/leaderboard_game_players";
import type { LeaderboardConfigRow } from "../database/types/leaderboard_config";
import type { NeatQueueConfigRow } from "../database/types/neat_queue_config";
import type { LeaderboardPostRow } from "../database/types/leaderboard_post";
import type { LeaderboardPlayerStatsRow } from "../database/types/leaderboard_player_stats";
import type { LeaderboardPlayerMetricRank } from "../database/types/leaderboard_player_metric_rank";
import type {
  LeaderboardPlayerRelationshipMetric,
  LeaderboardPlayerRelationshipRow,
} from "../database/types/leaderboard_player_relationship";
import type { LeaderboardPlayerPairRelationshipRow } from "../database/types/leaderboard_player_pair_relationship";
import type { HaloService } from "../halo/halo";
import type { Medal } from "../halo/types";
import type { LogService } from "../log/types";
import type { NeatQueueMatchCompletedRequest } from "../neatqueue/types";
import { getLeaderboardMessageState } from "./leaderboard-message";
import { createLeaderboardResponse, LEADERBOARD_TEMPORARY_ERROR_FOOTER } from "./leaderboard-response";
import { serializeObjectiveStats } from "./objective-stats";

export interface LeaderboardServiceOpts {
  databaseService: DatabaseService;
  discordService?: DiscordService;
  haloService: HaloService;
  logService: LogService;
}

interface GetLeaderboardOpts {
  guildId: string;
  config?: LeaderboardConfigRow | undefined;
  queueChannelId?: string | undefined;
  window?: LeaderboardWindow | undefined;
  metric?: LeaderboardMetric | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  minGamesPlayed?: number | undefined;
  autoCreateConfig?: boolean | undefined;
}

export interface GetLeaderboardPlayerStatsOpts {
  guildId: string;
  xboxXuid: string;
  queueChannelId: string | null;
  queueChannelIds?: string[];
  window?: LeaderboardWindow;
}

export interface LeaderboardPlayerStatsResponse {
  stats: LeaderboardPlayerStatsRow;
  window: LeaderboardWindow;
  resetAt: number | null;
  startEpochSeconds: number;
  minGamesPlayed: number;
  defaultAggregation: LeaderboardMetricAggregation;
}

export interface GetLeaderboardPlayerMetricRanksOpts {
  guildId: string;
  xboxXuid: string;
  queueChannelId: string | null;
  queueChannelIds?: string[];
  startEpochSeconds: number;
  minGamesPlayed: number;
  metrics: readonly LeaderboardMetric[];
}

export interface GetLeaderboardPlayerRelationshipsOpts extends GetLeaderboardPlayerStatsOpts {
  metric: LeaderboardPlayerRelationshipMetric;
}

export interface LeaderboardPlayerRelationshipsResponse {
  stats: LeaderboardPlayerStatsRow;
  rows: LeaderboardPlayerRelationshipRow[];
  window: LeaderboardWindow;
  resetAt: number | null;
  metric: LeaderboardPlayerRelationshipMetric;
}

export interface GetLeaderboardPlayerPairRelationshipOpts {
  guildId: string;
  xboxXuid1: string;
  xboxXuid2: string;
  queueChannelId: string | null;
  queueChannelIds?: string[];
  startEpochSeconds: number;
}

export class LeaderboardService {
  private readonly databaseService: DatabaseService;
  private readonly discordService: DiscordService | undefined;
  private readonly haloService: HaloService;
  private readonly logService: LogService;

  constructor({ databaseService, discordService, haloService, logService }: LeaderboardServiceOpts) {
    this.databaseService = databaseService;
    this.discordService = discordService;
    this.haloService = haloService;
    this.logService = logService;
  }

  async getLeaderboardPlayerStats({
    guildId,
    xboxXuid,
    queueChannelId,
    queueChannelIds,
    window,
  }: GetLeaderboardPlayerStatsOpts): Promise<LeaderboardPlayerStatsResponse | null> {
    const config = await this.databaseService.getLeaderboardConfig(guildId, false);
    const queueResetMarker = await this.databaseService.getLeaderboardResetMarker(guildId, queueChannelId);
    const serverResetMarker =
      queueChannelId != null && queueResetMarker == null
        ? await this.databaseService.getLeaderboardResetMarker(guildId, null)
        : null;
    const resetMarker = queueResetMarker ?? serverResetMarker;
    const requestedWindow = window ?? (resetMarker == null ? config.DefaultWindow : LeaderboardWindow.LastReset);
    const resolvedWindow =
      requestedWindow === LeaderboardWindow.LastReset && resetMarker == null ? config.DefaultWindow : requestedWindow;
    const resetAt =
      resolvedWindow === LeaderboardWindow.LastReset ? Preconditions.checkExists(resetMarker?.ResetAt) : null;
    const startEpochSeconds =
      resolvedWindow === LeaderboardWindow.LastReset
        ? Preconditions.checkExists(resetAt)
        : this.getWindowStartEpochSeconds(resolvedWindow);
    const stats = await this.databaseService.getLeaderboardPlayerStats({
      guildId,
      xboxXuid,
      queueChannelId,
      ...(queueChannelIds == null ? {} : { queueChannelIds }),
      startEpochSeconds,
    });

    return stats == null
      ? null
      : {
          stats,
          window: resolvedWindow,
          resetAt,
          startEpochSeconds,
          minGamesPlayed: config.MinGamesPlayed,
          defaultAggregation: getLeaderboardMetricAggregation(config.DefaultMetric),
        };
  }

  async getLeaderboardPlayerMetricRanks({
    guildId,
    xboxXuid,
    queueChannelId,
    queueChannelIds,
    startEpochSeconds,
    minGamesPlayed,
    metrics,
  }: GetLeaderboardPlayerMetricRanksOpts): Promise<Map<LeaderboardMetric, LeaderboardPlayerMetricRank | null>> {
    return this.databaseService.getLeaderboardPlayerMetricRanks({
      guildId,
      xboxXuid,
      queueChannelId,
      ...(queueChannelIds == null ? {} : { queueChannelIds }),
      startEpochSeconds,
      minGamesPlayed,
      metrics,
    });
  }

  async getLeaderboardPlayerRelationships({
    guildId,
    xboxXuid,
    queueChannelId,
    queueChannelIds,
    window,
    metric,
  }: GetLeaderboardPlayerRelationshipsOpts): Promise<LeaderboardPlayerRelationshipsResponse | null> {
    const playerStats = await this.getLeaderboardPlayerStats({
      guildId,
      xboxXuid,
      queueChannelId,
      ...(queueChannelIds == null ? {} : { queueChannelIds }),
      ...(window == null ? {} : { window }),
    });
    if (playerStats == null) {
      return null;
    }

    const rows = await this.databaseService.getLeaderboardPlayerRelationships({
      guildId,
      xboxXuid,
      queueChannelId,
      ...(queueChannelIds == null ? {} : { queueChannelIds }),
      startEpochSeconds: playerStats.startEpochSeconds,
      metric,
    });

    return {
      stats: playerStats.stats,
      rows,
      window: playerStats.window,
      resetAt: playerStats.resetAt,
      metric,
    };
  }

  async getLeaderboardPlayerPairRelationship({
    guildId,
    xboxXuid1,
    xboxXuid2,
    queueChannelId,
    queueChannelIds,
    startEpochSeconds,
  }: GetLeaderboardPlayerPairRelationshipOpts): Promise<LeaderboardPlayerPairRelationshipRow> {
    return this.databaseService.getLeaderboardPlayerPairRelationship({
      guildId,
      xboxXuid1,
      xboxXuid2,
      queueChannelId,
      ...(queueChannelIds == null ? {} : { queueChannelIds }),
      startEpochSeconds,
    });
  }

  async persistReconciledSeriesData({
    guildId,
    channelId,
    queueNumber,
    neatQueueConfig,
    series,
    winnerTeamIndex,
    locale,
  }: {
    guildId: string;
    channelId: string;
    queueNumber: number;
    neatQueueConfig: NeatQueueConfigRow;
    series: MatchStats[];
    winnerTeamIndex: number;
    locale: string;
  }): Promise<void> {
    await this.persistSeriesData({
      request: {
        action: "MATCH_COMPLETED",
        guild: guildId,
        channel: channelId,
        queue: queueNumber.toString(),
        match_number: queueNumber,
        winning_team_index: winnerTeamIndex,
        teams: [],
      },
      neatQueueConfig,
      series,
      locale,
      allowTie: true,
    });
  }

  async persistSeriesData({
    request,
    neatQueueConfig,
    series,
    locale,
    allowTie = false,
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    series: MatchStats[];
    locale: string;
    allowTie?: boolean;
  }): Promise<void> {
    if (series.length === 0) {
      this.logService.info(
        "Leaderboard persistence skipped because series data is empty",
        new Map([
          ["guildId", request.guild],
          ["channelId", request.channel],
          ["queueNumber", request.match_number.toString()],
        ]),
      );
      return;
    }

    if (request.winning_team_index === -1 && !allowTie) {
      this.logService.info(
        "Leaderboard persistence skipped because winning team index is unresolved",
        new Map([
          ["guildId", request.guild],
          ["channelId", request.channel],
          ["queueNumber", request.match_number.toString()],
          ["winningTeamIndex", request.winning_team_index.toString()],
        ]),
      );
      return;
    }

    try {
      this.logService.info(
        "Starting leaderboard persistence for completed series",
        new Map([
          ["guildId", request.guild],
          ["channelId", request.channel],
          ["queueNumber", request.match_number.toString()],
          ["seriesMatchCount", series.length.toString()],
          ["queueChannelId", neatQueueConfig.ChannelId],
        ]),
      );

      const sortedSeries = [...series].sort((left, right) =>
        left.MatchInfo.StartTime.localeCompare(right.MatchInfo.StartTime),
      );
      const firstMatch = Preconditions.checkExists(sortedSeries[0]);
      const lastMatch = Preconditions.checkExists(sortedSeries[sortedSeries.length - 1]);
      const nowEpoch = Math.floor(Date.now() / 1000);
      const startedAt = this.toEpochSeconds(firstMatch.MatchInfo.StartTime) ?? nowEpoch;
      const completedAt = this.toEpochSeconds(lastMatch.MatchInfo.EndTime) ?? nowEpoch;

      const seriesRow: LeaderboardSeriesRow = {
        GuildId: request.guild,
        QueueNumber: request.match_number,
        QueueChannelId: neatQueueConfig.ChannelId,
        ResultsChannelId: neatQueueConfig.ResultsChannelId,
        StartedAt: startedAt,
        CompletedAt: completedAt,
        WinnerTeamIndex: request.winning_team_index,
        SeriesScore: this.haloService.getSeriesScore(sortedSeries, locale),
        Source: "neatqueue",
        CreatedAt: nowEpoch,
        UpdatedAt: nowEpoch,
      };

      const gamertagMap = await this.haloService.getPlayerXuidsToGametags(sortedSeries, {
        presentAtBeginningOnly: true,
      });
      const allXuids = this.getSortedDistinctXuids(sortedSeries);
      const associations = await this.databaseService.getDiscordAssociationsByXboxId(allXuids);
      const xuidToDiscordId = new Map(associations.map((association) => [association.XboxId, association.DiscordId]));

      this.logService.debug(
        "Resolved leaderboard identity mappings",
        new Map([
          ["guildId", request.guild],
          ["queueNumber", request.match_number.toString()],
          ["distinctXuidCount", allXuids.length.toString()],
          ["gamertagMapCount", gamertagMap.size.toString()],
          ["discordAssociationCount", associations.length.toString()],
        ]),
      );

      const { gamesRows, gamePlayerRows, seriesPlayerRows } = await this.buildLeaderboardRows({
        guildId: request.guild,
        queueNumber: request.match_number,
        queueChannelId: neatQueueConfig.ChannelId,
        winnerTeamIndex: request.winning_team_index,
        sortedSeries,
        gamertagMap,
        xuidToDiscordId,
      });

      this.logService.info(
        "Prepared leaderboard row payloads",
        new Map([
          ["guildId", request.guild],
          ["queueNumber", request.match_number.toString()],
          ["gamesRowCount", gamesRows.length.toString()],
          ["gamePlayerRowCount", gamePlayerRows.length.toString()],
          ["seriesPlayerRowCount", seriesPlayerRows.length.toString()],
        ]),
      );

      await this.databaseService.upsertLeaderboardSeriesDataBatch({
        series: seriesRow,
        games: gamesRows,
        gamePlayers: gamePlayerRows,
        seriesPlayers: seriesPlayerRows,
      });
      await this.refreshPostsForCompletedQueueSafely(request.guild, neatQueueConfig.ChannelId);

      this.logService.info(
        "Completed leaderboard persistence for series",
        new Map([
          ["guildId", request.guild],
          ["queueNumber", request.match_number.toString()],
        ]),
      );
    } catch (error) {
      this.logService.warn(
        error,
        new Map([
          ["guildId", request.guild],
          ["queueNumber", request.match_number.toString()],
          ["reason", "Failed to persist leaderboard series data"],
        ]),
      );
    }
  }

  async refreshPostsForCompletedQueue(guildId: string, queueChannelId: string): Promise<void> {
    const { discordService } = this;
    if (discordService == null) {
      return;
    }

    try {
      const posts = await this.databaseService.findLeaderboardPostsForRefresh(guildId, queueChannelId);
      await this.refreshLeaderboardPosts(posts, guildId);
    } catch (error) {
      this.logService.warn(
        error,
        new Map([
          ["guildId", guildId],
          ["queueChannelId", queueChannelId],
          ["reason", "Failed to load leaderboard posts for refresh"],
        ]),
      );
      return;
    }
  }

  async refreshPostsForReset(guildId: string, queueChannelId: string | null): Promise<void> {
    const { discordService } = this;
    if (discordService == null) {
      return;
    }

    try {
      const posts =
        queueChannelId == null
          ? await this.databaseService.findLeaderboardPostsForGuildRefresh(guildId)
          : await this.databaseService.findLeaderboardPostsForRefresh(guildId, queueChannelId);
      await this.refreshLeaderboardPosts(posts, guildId);
    } catch (error) {
      this.logService.warn(
        error,
        new Map([
          ["guildId", guildId],
          ["queueChannelId", queueChannelId],
          ["reason", "Failed to refresh leaderboard posts after reset"],
        ]),
      );
    }
  }

  private async refreshLeaderboardPosts(posts: LeaderboardPostRow[], guildId: string): Promise<void> {
    const { discordService } = this;
    if (discordService == null || posts.length === 0) {
      return;
    }

    const locale = await discordService.getGuildPreferredLocale(guildId);

    for (const post of posts) {
      await this.refreshLeaderboardPost(post, locale);
    }
  }

  private async refreshPostsForCompletedQueueSafely(guildId: string, queueChannelId: string): Promise<void> {
    try {
      await this.refreshPostsForCompletedQueue(guildId, queueChannelId);
    } catch (error) {
      this.logService.warn(
        error,
        new Map([
          ["guildId", guildId],
          ["queueChannelId", queueChannelId],
          ["reason", "Failed to refresh leaderboard posts after series persistence"],
        ]),
      );
    }
  }

  private async refreshLeaderboardPost(post: LeaderboardPostRow, locale: string): Promise<void> {
    let message: APIMessage | undefined;
    try {
      const discordService = Preconditions.checkExists(
        this.discordService,
        "Discord service is required for leaderboard refresh",
      );
      message = await discordService.getMessage(post.ChannelId, post.MessageId);
      const state = getLeaderboardMessageState(message, post);
      if (state == null) {
        this.logService.warn(
          "Leaderboard post refresh skipped because message state is invalid",
          new Map([
            ["guildId", post.GuildId],
            ["channelId", post.ChannelId],
            ["messageId", post.MessageId],
          ]),
        );
        return;
      }

      const leaderboard = await this.getLeaderboardWithResolvedPage({
        guildId: state.guildId,
        ...(state.queueChannelId != null ? { queueChannelId: state.queueChannelId } : {}),
        window: state.window,
        metric: state.metric,
        page: state.page,
        pageSize: 10,
        minGamesPlayed: state.minGamesPlayed,
      });
      await discordService.editMessage(
        post.ChannelId,
        post.MessageId,
        createLeaderboardResponse(
          locale,
          leaderboard,
          discordService.getTimestamp(new Date().toISOString(), "R"),
          false,
          leaderboard.resetAt == null
            ? null
            : discordService.getTimestamp(new Date(leaderboard.resetAt * 1000).toISOString(), "f"),
        ),
      );
    } catch (error) {
      if (
        error instanceof DiscordError &&
        error.httpStatus === 404 &&
        (error.restError.code === 10003 || error.restError.code === 10008)
      ) {
        await this.deleteMissingLeaderboardPost(post);
        return;
      }

      this.logService.warn(
        error,
        new Map([
          ["guildId", post.GuildId],
          ["channelId", post.ChannelId],
          ["messageId", post.MessageId],
          ["reason", "Failed to refresh leaderboard post"],
        ]),
      );

      if (message != null) {
        await this.discordService?.updateMessageWithError(post.ChannelId, post.MessageId, error, {
          preserveMessage: message,
          errorEmbedFooter: LEADERBOARD_TEMPORARY_ERROR_FOOTER,
          suppressErrorLogging: true,
        });
      }
    }
  }

  private async deleteMissingLeaderboardPost(post: LeaderboardPostRow): Promise<void> {
    try {
      await this.databaseService.deleteLeaderboardPost(post.ChannelId, post.MessageId);
    } catch (error) {
      this.logService.warn(
        error,
        new Map([
          ["guildId", post.GuildId],
          ["channelId", post.ChannelId],
          ["messageId", post.MessageId],
          ["reason", "Failed to delete missing leaderboard post registration"],
        ]),
      );
    }
  }

  async getLeaderboardWithResolvedPage(opts: GetLeaderboardOpts): Promise<LeaderboardResponse> {
    const leaderboard = await this.getLeaderboard(opts);
    const totalPages = Math.max(1, Math.ceil(leaderboard.total / leaderboard.pageSize));
    if (leaderboard.page <= totalPages || leaderboard.total === 0) {
      return leaderboard.total === 0 && leaderboard.page > 1 ? { ...leaderboard, page: 1 } : leaderboard;
    }

    return await this.getLeaderboard({
      ...opts,
      page: totalPages,
    });
  }

  async getLeaderboard({
    guildId,
    config,
    queueChannelId,
    window,
    metric,
    page,
    pageSize,
    minGamesPlayed,
    autoCreateConfig,
  }: GetLeaderboardOpts): Promise<LeaderboardResponse> {
    const resolvedConfig =
      config ?? (await this.databaseService.getLeaderboardConfig(guildId, autoCreateConfig ?? false));
    const hasLeaderboardData = await this.databaseService.hasLeaderboardData(guildId, queueChannelId ?? null);
    if (autoCreateConfig === false && !hasLeaderboardData) {
      return {
        guildId,
        queueChannelId: queueChannelId ?? null,
        window:
          window === LeaderboardWindow.LastReset
            ? resolvedConfig.DefaultWindow
            : (window ?? resolvedConfig.DefaultWindow),
        resetAt: null,
        metric: metric ?? resolvedConfig.DefaultMetric,
        minGamesPlayed: minGamesPlayed ?? resolvedConfig.MinGamesPlayed,
        page: Math.max(1, page ?? 1),
        pageSize: Math.min(LEADERBOARD_MAX_PAGE_SIZE, Math.max(1, pageSize ?? 25)),
        total: 0,
        hasLeaderboardData: false,
        rows: [],
      };
    }
    const queueResetMarker = await this.databaseService.getLeaderboardResetMarker(guildId, queueChannelId ?? null);
    const serverResetMarker =
      queueChannelId != null && queueResetMarker == null
        ? await this.databaseService.getLeaderboardResetMarker(guildId, null)
        : null;
    const resetMarker = queueResetMarker ?? serverResetMarker;
    const resetMarkerResetAt = resetMarker?.ResetAt ?? null;
    const resolvedWindowCandidate =
      window ?? (resetMarker == null ? resolvedConfig.DefaultWindow : LeaderboardWindow.LastReset);
    const resolvedWindow =
      resolvedWindowCandidate === LeaderboardWindow.LastReset && resetMarkerResetAt == null
        ? resolvedConfig.DefaultWindow
        : resolvedWindowCandidate;
    const resolvedResetAt =
      resolvedWindow === LeaderboardWindow.LastReset ? Preconditions.checkExists(resetMarkerResetAt) : null;
    const resolvedMetric = metric ?? resolvedConfig.DefaultMetric;
    const resolvedMinGamesPlayed = minGamesPlayed ?? resolvedConfig.MinGamesPlayed;
    const resolvedPage = Math.max(1, page ?? 1);
    const resolvedPageSize = Math.min(LEADERBOARD_MAX_PAGE_SIZE, Math.max(1, pageSize ?? 25));
    const offset = (resolvedPage - 1) * resolvedPageSize;
    const startEpochSeconds =
      resolvedWindow === LeaderboardWindow.LastReset
        ? Preconditions.checkExists(resolvedResetAt)
        : this.getWindowStartEpochSeconds(resolvedWindow);

    const rankings =
      resolvedMetric === LeaderboardMetric.SeriesWinRate ||
      resolvedMetric === LeaderboardMetric.SeriesPlayed ||
      resolvedMetric === LeaderboardMetric.SeriesWins ||
      resolvedMetric === LeaderboardMetric.GamesPlayed ||
      resolvedMetric === LeaderboardMetric.GameWins ||
      resolvedMetric === LeaderboardMetric.GamesWinRate
        ? await this.databaseService.getLeaderboardOutcomeMetricRankings({
            guildId,
            queueChannelId: queueChannelId ?? null,
            startEpochSeconds,
            minGamesPlayed: resolvedMinGamesPlayed,
            limit: resolvedPageSize,
            offset,
            metric: resolvedMetric,
          })
        : await this.databaseService.getLeaderboardStatMetricRankings({
            guildId,
            queueChannelId: queueChannelId ?? null,
            startEpochSeconds,
            minGamesPlayed: resolvedMinGamesPlayed,
            limit: resolvedPageSize,
            offset,
            metric: resolvedMetric,
          });

    return {
      guildId,
      queueChannelId: queueChannelId ?? null,
      window: resolvedWindow,
      resetAt: resetMarkerResetAt,
      metric: resolvedMetric,
      minGamesPlayed: resolvedMinGamesPlayed,
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: rankings.total,
      hasLeaderboardData,
      rows: rankings.rows.map((row, index) => ({
        rank: offset + index + 1,
        xboxXuid: row.XboxXuid,
        discordUserId: row.DiscordUserId,
        gamertag: row.Gamertag,
        seriesPlayed: row.SeriesPlayed,
        seriesWins: row.SeriesWins,
        gamesPlayed: row.GamesPlayed,
        gameWins: row.GameWins,
        medalCount: row.MedalCount,
        objectiveGamesPlayed: row.ObjectiveGamesPlayed,
        objectiveTimeSeconds: row.ObjectiveTimeSeconds,
        metricValue: this.toFiniteMetricValue(row.MetricValue),
      })),
    };
  }

  private toFiniteMetricValue(metricValue: number): number {
    if (Number.isFinite(metricValue)) {
      return metricValue;
    }

    return Number.MAX_VALUE;
  }

  private getWindowStartEpochSeconds(window: LeaderboardWindow): number {
    const now = new Date();

    switch (window) {
      case LeaderboardWindow.LastReset: {
        throw new Error("Last reset window requires a reset timestamp");
      }
      case LeaderboardWindow.OneWeek: {
        return Math.floor(sub(now, { weeks: 1 }).getTime() / 1000);
      }
      case LeaderboardWindow.OneMonth: {
        return Math.floor(sub(now, { months: 1 }).getTime() / 1000);
      }
      case LeaderboardWindow.ThreeMonths: {
        return Math.floor(sub(now, { months: 3 }).getTime() / 1000);
      }
      case LeaderboardWindow.SixMonths: {
        return Math.floor(sub(now, { months: 6 }).getTime() / 1000);
      }
      case LeaderboardWindow.TwelveMonths: {
        return Math.floor(sub(now, { months: 12 }).getTime() / 1000);
      }
      default: {
        throw new UnreachableError(window);
      }
    }
  }

  private toEpochSeconds(value: string): number | null {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return null;
    }

    return Math.floor(parsed / 1000);
  }

  private getAverageLifeSeconds(averageLifeDuration: string): number {
    try {
      return getDurationInSeconds(averageLifeDuration);
    } catch {
      return 0;
    }
  }

  private getSortedDistinctXuids(series: MatchStats[]): string[] {
    const xuids = new Set<string>();

    for (const match of series) {
      for (const player of match.Players) {
        if (player.PlayerType !== 1) {
          continue;
        }

        xuids.add(getPlayerXuid(player));
      }
    }

    return [...xuids].sort((left, right) => left.localeCompare(right));
  }

  private async buildLeaderboardRows({
    guildId,
    queueNumber,
    queueChannelId,
    winnerTeamIndex,
    sortedSeries,
    gamertagMap,
    xuidToDiscordId,
  }: {
    guildId: string;
    queueNumber: number;
    queueChannelId: string;
    winnerTeamIndex: number;
    sortedSeries: MatchStats[];
    gamertagMap: Map<string, string>;
    xuidToDiscordId: Map<string, string>;
  }): Promise<{
    gamesRows: LeaderboardGamesRow[];
    gamePlayerRows: LeaderboardGamePlayersRow[];
    seriesPlayerRows: LeaderboardSeriesPlayersRow[];
  }> {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const gamesRows: LeaderboardGamesRow[] = [];
    const gamePlayerRows: LeaderboardGamePlayersRow[] = [];
    const playersByXuid = new Map<string, LeaderboardSeriesPlayersRow>();
    const participationByXuid = new Map<string, boolean[]>();
    const medalMetadataById = new Map<number, Medal | undefined>();
    const gameTypeAndMapByMatchId = new Map<string, { gameType: string; gameMap: string }>();
    const gameTypesAndMaps = await Promise.all(
      sortedSeries.map(async (match) => ({
        matchId: match.MatchId,
        ...(await this.haloService.getGameTypeAndMapParts(match.MatchInfo)),
      })),
    );
    for (const gameTypeAndMap of gameTypesAndMaps) {
      gameTypeAndMapByMatchId.set(gameTypeAndMap.matchId, {
        gameType: gameTypeAndMap.gameType,
        gameMap: gameTypeAndMap.gameMap,
      });
    }

    for (const [index, match] of sortedSeries.entries()) {
      const { gameType, gameMap } = Preconditions.checkExists(
        gameTypeAndMapByMatchId.get(match.MatchId),
        "Expected resolved game type and map",
      );
      const startedAt = this.toEpochSeconds(match.MatchInfo.StartTime) ?? nowEpoch;
      const endedAt = this.toEpochSeconds(match.MatchInfo.EndTime) ?? nowEpoch;
      const team0Score = match.Teams.find((team) => team.TeamId === 0)?.Stats.CoreStats.Score ?? null;
      const team1Score = match.Teams.find((team) => team.TeamId === 1)?.Stats.CoreStats.Score ?? null;
      const objectiveTimeByTeamId = new Map(
        match.Teams.map((team) => [
          team.TeamId,
          getObjectiveTimeSeconds(match.MatchInfo.GameVariantCategory, team.Stats),
        ]),
      );

      gamesRows.push({
        MatchId: match.MatchId,
        GuildId: guildId,
        QueueNumber: queueNumber,
        QueueChannelId: queueChannelId,
        GameIndexInSeries: index,
        GameVariantCategory: match.MatchInfo.GameVariantCategory,
        ModeName: gameType,
        MapName: gameMap,
        MapAssetId: match.MatchInfo.MapVariant.AssetId,
        MapVersionId: match.MatchInfo.MapVariant.VersionId,
        Team0Score: team0Score,
        Team1Score: team1Score,
        StartedAt: startedAt,
        EndedAt: endedAt,
        CreatedAt: nowEpoch,
      });

      for (const player of match.Players) {
        if (player.PlayerType !== 1) {
          continue;
        }

        const xuid = getPlayerXuid(player);
        const participation = participationByXuid.get(xuid);
        if (participation == null) {
          const initialParticipation = Array<boolean>(sortedSeries.length).fill(false);
          initialParticipation[index] = true;
          participationByXuid.set(xuid, initialParticipation);
        } else {
          participation[index] = true;
        }

        const teamStats = Preconditions.checkExists(
          player.PlayerTeamStats.find((candidate) => match.Teams.some((team) => team.TeamId === candidate.TeamId)),
          "Expected player team stats",
        );
        const coreStats = teamStats.Stats.CoreStats;
        const deaths = coreStats.Deaths;
        const medalAggregates = await this.getMedalAggregates(coreStats.Medals, medalMetadataById);
        const objectiveTimeSeconds = getObjectiveTimeSeconds(match.MatchInfo.GameVariantCategory, teamStats.Stats);
        const teamObjectiveTimeSeconds = objectiveTimeByTeamId.get(teamStats.TeamId) ?? null;
        const objectiveTeamContribution = this.getObjectiveContribution(objectiveTimeSeconds, teamObjectiveTimeSeconds);

        gamePlayerRows.push({
          MatchId: match.MatchId,
          GuildId: guildId,
          QueueNumber: queueNumber,
          QueueChannelId: queueChannelId,
          XboxXuid: xuid,
          DiscordUserId: xuidToDiscordId.get(xuid) ?? null,
          GamertagSnapshot: gamertagMap.get(xuid) ?? "Unknown",
          TeamId: teamStats.TeamId,
          PresentAtBeginning: player.ParticipationInfo.PresentAtBeginning ? 1 : 0,
          GameWon: player.Outcome === MatchOutcome.Win ? 1 : 0,
          RankInMatch: player.Rank,
          PersonalScore: coreStats.PersonalScore,
          Kills: coreStats.Kills,
          Deaths: deaths,
          Assists: coreStats.Assists,
          HeadshotKills: coreStats.HeadshotKills,
          Kda: coreStats.KDA,
          Accuracy: coreStats.Accuracy,
          ShotsHit: coreStats.ShotsHit,
          ShotsFired: coreStats.ShotsFired,
          DamageDealt: coreStats.DamageDealt,
          DamageTaken: coreStats.DamageTaken,
          DamageRatio: clampRatioForStorage(getSafeRatioValue(coreStats.DamageDealt, coreStats.DamageTaken)),
          AvgLifeSeconds: this.getAverageLifeSeconds(coreStats.AverageLifeDuration),
          AvgDamagePerLife: getSafeRatioValue(coreStats.DamageDealt, deaths + 1),
          MedalCount: medalAggregates.count,
          MedalPoints: medalAggregates.points,
          MythicMedalCount: medalAggregates.mythicCount,
          ObjectiveTimeSeconds: objectiveTimeSeconds,
          ObjectiveTeamContribution: objectiveTeamContribution,
          ObjectiveStatsJson: serializeObjectiveStats(teamStats.Stats),
          MedalsJson: JSON.stringify(coreStats.Medals),
          CreatedAt: nowEpoch,
        });

        const existing = playersByXuid.get(xuid);
        if (existing == null) {
          playersByXuid.set(xuid, {
            GuildId: guildId,
            QueueNumber: queueNumber,
            QueueChannelId: queueChannelId,
            XboxXuid: xuid,
            DiscordUserId: xuidToDiscordId.get(xuid) ?? null,
            GamertagSnapshot: gamertagMap.get(xuid) ?? "Unknown",
            TeamId: teamStats.TeamId,
            PresentAtBeginningCount: player.ParticipationInfo.PresentAtBeginning ? 1 : 0,
            SubstituteInCount: player.ParticipationInfo.PresentAtBeginning ? 0 : 1,
            SubstituteOutCount: 0,
            GamesPlayedCount: 1,
            SeriesWon: teamStats.TeamId === winnerTeamIndex ? 1 : 0,
            CreatedAt: nowEpoch,
          });
          continue;
        }

        existing.GamesPlayedCount += 1;
        if (player.ParticipationInfo.PresentAtBeginning) {
          existing.PresentAtBeginningCount += 1;
        } else {
          existing.SubstituteInCount += 1;
        }
      }
    }

    for (const row of playersByXuid.values()) {
      const participation = Preconditions.checkExists(
        participationByXuid.get(row.XboxXuid),
        "Expected player participation across series",
      );
      let substituteOutCount = 0;
      for (let i = 0; i < participation.length - 1; i += 1) {
        if (participation[i] === true && participation[i + 1] !== true) {
          substituteOutCount += 1;
        }
      }
      row.SubstituteOutCount = substituteOutCount;
    }

    const seriesPlayerRows = [...playersByXuid.values()].sort((left, right) =>
      left.XboxXuid.localeCompare(right.XboxXuid),
    );

    return {
      gamesRows,
      gamePlayerRows,
      seriesPlayerRows,
    };
  }

  private async getMedalAggregates(
    medals: { NameId: number; Count: number; TotalPersonalScoreAwarded?: number }[],
    metadataById: Map<number, Medal | undefined>,
  ): Promise<{ count: number; points: number; mythicCount: number }> {
    let count = 0;
    let points = 0;
    let mythicCount = 0;

    for (const medal of medals) {
      count += medal.Count;
      let metadata = metadataById.get(medal.NameId);
      if (!metadataById.has(medal.NameId)) {
        metadata = await this.haloService.getMedal(medal.NameId);
        metadataById.set(medal.NameId, metadata);
      }

      if (metadata == null) {
        points += medal.TotalPersonalScoreAwarded ?? 0;
        continue;
      }

      points += metadata.personalScore * medal.Count;
      if (metadata.difficulty === "mythic") {
        mythicCount += medal.Count;
      }
    }

    return { count, points, mythicCount };
  }

  private getObjectiveContribution(objectiveTimeSeconds: number | null, denominator: number | null): number | null {
    if (objectiveTimeSeconds == null || denominator == null || denominator === 0) {
      return null;
    }

    return objectiveTimeSeconds / denominator;
  }
}
