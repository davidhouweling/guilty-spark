import { MatchOutcome } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { sub } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { getSafeRatioValue } from "@guilty-spark/shared/halo/stat-formatting";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { DatabaseService } from "../database/database";
import type { DiscordService } from "../discord/discord";
import { DiscordError } from "../discord/discord-error";
import type { LeaderboardSeriesRow } from "../database/types/leaderboard_series";
import type { LeaderboardSeriesPlayersRow } from "../database/types/leaderboard_series_players";
import type { LeaderboardGamesRow } from "../database/types/leaderboard_games";
import type { LeaderboardGamePlayersRow } from "../database/types/leaderboard_game_players";
import type { NeatQueueConfigRow } from "../database/types/neat_queue_config";
import type { LeaderboardPostRow } from "../database/types/leaderboard_post";
import type { HaloService } from "../halo/halo";
import type { LogService } from "../log/types";
import type { NeatQueueMatchCompletedRequest } from "../neatqueue/types";
import { getLeaderboardMessageState } from "./leaderboard-message";
import { createLeaderboardResponse } from "./leaderboard-response";

export interface LeaderboardServiceOpts {
  databaseService: DatabaseService;
  discordService?: DiscordService;
  haloService: HaloService;
  logService: LogService;
}

interface GetLeaderboardOpts {
  guildId: string;
  queueChannelId?: string | undefined;
  window?: LeaderboardWindow | undefined;
  metric?: LeaderboardMetric | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  minGamesPlayed?: number | undefined;
  resetAt?: number | undefined;
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

  async persistSeriesData({
    request,
    neatQueueConfig,
    series,
    locale,
  }: {
    request: NeatQueueMatchCompletedRequest;
    neatQueueConfig: NeatQueueConfigRow;
    series: MatchStats[];
    locale: string;
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

    if (request.winning_team_index === -1) {
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

    let posts: LeaderboardPostRow[];
    try {
      posts = await this.databaseService.findLeaderboardPostsForRefresh(guildId, queueChannelId);
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

    if (posts.length === 0) {
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
    try {
      const discordService = Preconditions.checkExists(
        this.discordService,
        "Discord service is required for leaderboard refresh",
      );
      const message = await discordService.getMessage(post.ChannelId, post.MessageId);
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
        createLeaderboardResponse(locale, leaderboard, discordService.getTimestamp(new Date().toISOString(), "R")),
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

  async getLeaderboardWithResolvedPage({
    guildId,
    queueChannelId,
    window,
    metric,
    page,
    pageSize,
    minGamesPlayed,
    resetAt,
  }: GetLeaderboardOpts): Promise<LeaderboardResponse> {
    const opts: GetLeaderboardOpts = {
      guildId,
      queueChannelId,
      window,
      metric,
      page,
      pageSize,
      minGamesPlayed,
      resetAt,
    };
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
    queueChannelId,
    window,
    metric,
    page,
    pageSize,
    minGamesPlayed,
    resetAt,
  }: GetLeaderboardOpts): Promise<LeaderboardResponse> {
    const config = await this.databaseService.getLeaderboardConfig(guildId, true);
    const queueResetMarker = await this.databaseService.getLeaderboardResetMarker(guildId, queueChannelId ?? null);
    const serverResetMarker =
      queueChannelId != null && queueResetMarker == null
        ? await this.databaseService.getLeaderboardResetMarker(guildId, null)
        : null;
    const resetMarker = queueResetMarker ?? serverResetMarker;
    const resolvedWindow = window ?? (resetMarker == null ? config.DefaultWindow : LeaderboardWindow.LastReset);
    const resolvedResetAt = resolvedWindow === LeaderboardWindow.LastReset ? (resetAt ?? resetMarker?.ResetAt) : null;
    if (resolvedWindow === LeaderboardWindow.LastReset && resolvedResetAt == null) {
      throw new Error("Leaderboard reset marker is missing");
    }
    const resolvedMetric = metric ?? config.DefaultMetric;
    const resolvedMinGamesPlayed = minGamesPlayed ?? config.MinGamesPlayed;
    const resolvedPage = Math.max(1, page ?? 1);
    const resolvedPageSize = Math.min(100, Math.max(1, pageSize ?? 25));
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
      resetAt: resolvedResetAt,
      metric: resolvedMetric,
      minGamesPlayed: resolvedMinGamesPlayed,
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: rankings.total,
      rows: rankings.rows.map((row, index) => ({
        rank: offset + index + 1,
        xboxXuid: row.XboxXuid,
        discordUserId: row.DiscordUserId,
        gamertag: row.Gamertag,
        seriesPlayed: row.SeriesPlayed,
        seriesWins: row.SeriesWins,
        gamesPlayed: row.GamesPlayed,
        gameWins: row.GameWins,
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
          DamageRatio: getSafeRatioValue(coreStats.DamageDealt, coreStats.DamageTaken),
          AvgLifeSeconds: this.getAverageLifeSeconds(coreStats.AverageLifeDuration),
          AvgDamagePerLife: getSafeRatioValue(coreStats.DamageDealt, deaths + 1),
          ObjectiveStatsJson: JSON.stringify(teamStats.Stats),
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
}
