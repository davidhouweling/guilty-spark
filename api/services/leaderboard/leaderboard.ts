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
import type { LeaderboardSeriesRow } from "../database/types/leaderboard_series";
import type { LeaderboardSeriesPlayersRow } from "../database/types/leaderboard_series_players";
import type { LeaderboardGamesRow } from "../database/types/leaderboard_games";
import type { LeaderboardGamePlayersRow } from "../database/types/leaderboard_game_players";
import type { NeatQueueConfigRow } from "../database/types/neat_queue_config";
import type { HaloService } from "../halo/halo";
import type { LogService } from "../log/types";
import type { NeatQueueMatchCompletedRequest } from "../neatqueue/types";

export interface LeaderboardServiceOpts {
  databaseService: DatabaseService;
  haloService: HaloService;
  logService: LogService;
}

export class LeaderboardService {
  private readonly databaseService: DatabaseService;
  private readonly haloService: HaloService;
  private readonly logService: LogService;

  constructor({ databaseService, haloService, logService }: LeaderboardServiceOpts) {
    this.databaseService = databaseService;
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
    if (series.length === 0 || request.winning_team_index === -1) {
      return;
    }

    try {
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

      const { gamesRows, gamePlayerRows, seriesPlayerRows } = await this.buildLeaderboardRows({
        guildId: request.guild,
        queueNumber: request.match_number,
        queueChannelId: neatQueueConfig.ChannelId,
        winnerTeamIndex: request.winning_team_index,
        sortedSeries,
        gamertagMap,
        xuidToDiscordId,
      });
      await this.databaseService.upsertLeaderboardSeriesDataBatch({
        series: seriesRow,
        games: gamesRows,
        gamePlayers: gamePlayerRows,
        seriesPlayers: seriesPlayerRows,
      });
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

  async getLeaderboard({
    guildId,
    queueChannelId,
    window,
    metric,
    page,
    pageSize,
    minGamesPlayed,
  }: {
    guildId: string;
    queueChannelId?: string;
    window?: LeaderboardWindow;
    metric?: LeaderboardMetric;
    page?: number;
    pageSize?: number;
    minGamesPlayed?: number;
  }): Promise<LeaderboardResponse> {
    const config = await this.databaseService.getLeaderboardConfig(guildId, true);
    const resolvedWindow = window ?? config.DefaultWindow;
    const resolvedMetric = metric ?? config.DefaultMetric;
    const resolvedMinGamesPlayed = minGamesPlayed ?? config.MinGamesPlayed;
    const resolvedPage = Math.max(1, page ?? 1);
    const resolvedPageSize = Math.min(100, Math.max(1, pageSize ?? 25));
    const offset = (resolvedPage - 1) * resolvedPageSize;
    const startEpochSeconds = this.getWindowStartEpochSeconds(resolvedWindow);

    const allRows =
      resolvedMetric === LeaderboardMetric.SeriesWinRate
        ? await this.getSeriesWinRateRows({
            guildId,
            queueChannelId: queueChannelId ?? null,
            startEpochSeconds,
            minGamesPlayed: resolvedMinGamesPlayed,
          })
        : await this.getMetricRows({
            guildId,
            queueChannelId: queueChannelId ?? null,
            startEpochSeconds,
            minGamesPlayed: resolvedMinGamesPlayed,
            metric: resolvedMetric,
          });

    const pagedRows = allRows.slice(offset, offset + resolvedPageSize);

    return {
      guildId,
      queueChannelId: queueChannelId ?? null,
      window: resolvedWindow,
      metric: resolvedMetric,
      minGamesPlayed: resolvedMinGamesPlayed,
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: allRows.length,
      rows: pagedRows.map((row, index) => ({
        rank: offset + index + 1,
        xboxXuid: row.xboxXuid,
        discordUserId: row.discordUserId,
        gamertag: row.gamertag,
        seriesPlayed: row.seriesPlayed,
        seriesWins: row.seriesWins,
        gamesPlayed: row.gamesPlayed,
        metricValue: row.metricValue,
      })),
    };
  }

  private async getSeriesWinRateRows({
    guildId,
    queueChannelId,
    startEpochSeconds,
    minGamesPlayed,
  }: {
    guildId: string;
    queueChannelId: string | null;
    startEpochSeconds: number;
    minGamesPlayed: number;
  }): Promise<
    {
      xboxXuid: string;
      discordUserId: string | null;
      gamertag: string;
      seriesPlayed: number;
      seriesWins: number;
      gamesPlayed: number;
      metricValue: number;
    }[]
  > {
    const facts = await this.databaseService.getLeaderboardSeriesPlayerFacts({
      guildId,
      queueChannelId,
      startEpochSeconds,
    });
    const byXuid = new Map<
      string,
      {
        xboxXuid: string;
        discordUserId: string | null;
        gamertag: string;
        seriesPlayed: number;
        seriesWins: number;
        gamesPlayed: number;
      }
    >();

    for (const fact of facts) {
      const existing = byXuid.get(fact.XboxXuid);
      if (existing == null) {
        byXuid.set(fact.XboxXuid, {
          xboxXuid: fact.XboxXuid,
          discordUserId: fact.DiscordUserId,
          gamertag: fact.Gamertag,
          seriesPlayed: 1,
          seriesWins: fact.SeriesWon,
          gamesPlayed: fact.GamesPlayedCount,
        });
        continue;
      }

      existing.discordUserId = existing.discordUserId ?? fact.DiscordUserId;
      existing.gamertag = fact.Gamertag;
      existing.seriesPlayed += 1;
      existing.seriesWins += fact.SeriesWon;
      existing.gamesPlayed += fact.GamesPlayedCount;
    }

    return [...byXuid.values()]
      .filter((row) => row.gamesPlayed >= minGamesPlayed)
      .map((row) => ({
        ...row,
        metricValue: row.seriesPlayed === 0 ? 0 : row.seriesWins / row.seriesPlayed,
      }))
      .sort((left, right) => {
        if (right.metricValue !== left.metricValue) {
          return right.metricValue - left.metricValue;
        }

        if (right.seriesWins !== left.seriesWins) {
          return right.seriesWins - left.seriesWins;
        }

        if (right.gamesPlayed !== left.gamesPlayed) {
          return right.gamesPlayed - left.gamesPlayed;
        }

        return left.gamertag.localeCompare(right.gamertag);
      });
  }

  private async getMetricRows({
    guildId,
    queueChannelId,
    startEpochSeconds,
    minGamesPlayed,
    metric,
  }: {
    guildId: string;
    queueChannelId: string | null;
    startEpochSeconds: number;
    minGamesPlayed: number;
    metric: Exclude<LeaderboardMetric, LeaderboardMetric.SeriesWinRate>;
  }): Promise<
    {
      xboxXuid: string;
      discordUserId: string | null;
      gamertag: string;
      seriesPlayed: number;
      seriesWins: number;
      gamesPlayed: number;
      metricValue: number;
    }[]
  > {
    const facts = await this.databaseService.getLeaderboardGamePlayerFacts({
      guildId,
      queueChannelId,
      startEpochSeconds,
    });
    const byXuid = new Map<
      string,
      {
        xboxXuid: string;
        discordUserId: string | null;
        gamertag: string;
        seriesNumbers: Set<number>;
        gamesPlayed: number;
        kills: number;
        deaths: number;
        assists: number;
        kdaSum: number;
        accuracySum: number;
        damageDealt: number;
        damageTaken: number;
        personalScore: number;
      }
    >();

    for (const fact of facts) {
      const existing = byXuid.get(fact.XboxXuid);
      if (existing == null) {
        byXuid.set(fact.XboxXuid, {
          xboxXuid: fact.XboxXuid,
          discordUserId: fact.DiscordUserId,
          gamertag: fact.Gamertag,
          seriesNumbers: new Set([fact.QueueNumber]),
          gamesPlayed: 1,
          kills: fact.Kills,
          deaths: fact.Deaths,
          assists: fact.Assists,
          kdaSum: fact.Kda,
          accuracySum: fact.Accuracy,
          damageDealt: fact.DamageDealt,
          damageTaken: fact.DamageTaken,
          personalScore: fact.PersonalScore,
        });
        continue;
      }

      existing.discordUserId = existing.discordUserId ?? fact.DiscordUserId;
      existing.gamertag = fact.Gamertag;
      existing.seriesNumbers.add(fact.QueueNumber);
      existing.gamesPlayed += 1;
      existing.kills += fact.Kills;
      existing.deaths += fact.Deaths;
      existing.assists += fact.Assists;
      existing.kdaSum += fact.Kda;
      existing.accuracySum += fact.Accuracy;
      existing.damageDealt += fact.DamageDealt;
      existing.damageTaken += fact.DamageTaken;
      existing.personalScore += fact.PersonalScore;
    }

    const rows = [...byXuid.values()]
      .filter((row) => row.gamesPlayed >= minGamesPlayed)
      .map((row) => {
        let metricValue = row.personalScore;
        switch (metric) {
          case LeaderboardMetric.Kills: {
            metricValue = row.kills;
            break;
          }
          case LeaderboardMetric.Deaths: {
            metricValue = row.deaths;
            break;
          }
          case LeaderboardMetric.Assists: {
            metricValue = row.assists;
            break;
          }
          case LeaderboardMetric.Kda: {
            metricValue = row.kdaSum / row.gamesPlayed;
            break;
          }
          case LeaderboardMetric.Accuracy: {
            metricValue = row.accuracySum / row.gamesPlayed;
            break;
          }
          case LeaderboardMetric.DamageDealt: {
            metricValue = row.damageDealt;
            break;
          }
          case LeaderboardMetric.DamageTaken: {
            metricValue = row.damageTaken;
            break;
          }
          case LeaderboardMetric.DamageRatio: {
            metricValue = getSafeRatioValue(row.damageDealt, row.damageTaken);
            break;
          }
          case LeaderboardMetric.PersonalScore: {
            metricValue = row.personalScore;
            break;
          }
          default: {
            throw new UnreachableError(metric);
          }
        }

        return {
          xboxXuid: row.xboxXuid,
          discordUserId: row.discordUserId,
          gamertag: row.gamertag,
          seriesPlayed: row.seriesNumbers.size,
          seriesWins: 0,
          gamesPlayed: row.gamesPlayed,
          metricValue,
        };
      });

    return rows.sort((left, right) => {
      if (right.metricValue !== left.metricValue) {
        return right.metricValue - left.metricValue;
      }

      if (right.gamesPlayed !== left.gamesPlayed) {
        return right.gamesPlayed - left.gamesPlayed;
      }

      return left.gamertag.localeCompare(right.gamertag);
    });
  }

  private getWindowStartEpochSeconds(window: LeaderboardWindow): number {
    const now = new Date();

    switch (window) {
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
          RankInMatch: player.Rank,
          PersonalScore: coreStats.PersonalScore,
          Kills: coreStats.Kills,
          Deaths: deaths,
          Assists: coreStats.Assists,
          Kda: coreStats.KDA,
          Accuracy: coreStats.Accuracy,
          ShotsHit: coreStats.ShotsHit,
          ShotsFired: coreStats.ShotsFired,
          DamageDealt: coreStats.DamageDealt,
          DamageTaken: coreStats.DamageTaken,
          DamageRatio: getSafeRatioValue(coreStats.DamageDealt, coreStats.DamageTaken),
          AvgLifeSeconds: this.getAverageLifeSeconds(coreStats.AverageLifeDuration),
          AvgDamagePerLife: getSafeRatioValue(coreStats.DamageDealt, deaths),
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
