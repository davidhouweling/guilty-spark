import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardRankingRow } from "../../database/database";
import { aFakeDatabaseServiceWith, aFakeLeaderboardConfigRow } from "../../database/fakes/database.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { LeaderboardService } from "../leaderboard";

describe("LeaderboardService", () => {
  const nowIso = "2026-08-11T12:00:00.000Z";

  const seriesRankingRows: LeaderboardRankingRow[] = [
    {
      XboxXuid: "xuid-1",
      DiscordUserId: "discord-1",
      Gamertag: "Alpha",
      SeriesPlayed: 2,
      SeriesWins: 2,
      GamesPlayed: 5,
      MetricValue: 1,
    },
    {
      XboxXuid: "xuid-2",
      DiscordUserId: "discord-2",
      Gamertag: "Bravo",
      SeriesPlayed: 2,
      SeriesWins: 1,
      GamesPlayed: 2,
      MetricValue: 0.5,
    },
  ];

  const killsRankingRows: LeaderboardRankingRow[] = [
    {
      XboxXuid: "xuid-1",
      DiscordUserId: "discord-1",
      Gamertag: "Alpha",
      SeriesPlayed: 2,
      SeriesWins: 0,
      GamesPlayed: 2,
      MetricValue: 15,
    },
    {
      XboxXuid: "xuid-2",
      DiscordUserId: "discord-2",
      Gamertag: "Bravo",
      SeriesPlayed: 1,
      SeriesWins: 0,
      GamesPlayed: 1,
      MetricValue: 20,
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
  });

  it("uses config defaults and ranks by series win rate", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });

    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({
        GuildId: "guild-1",
        DefaultMetric: LeaderboardMetric.SeriesWinRate,
        DefaultWindow: LeaderboardWindow.ThreeMonths,
        MinGamesPlayed: 2,
      }),
    );
    const getSeriesRankingsSpy = vi.spyOn(databaseService, "getLeaderboardSeriesWinRateRankings").mockResolvedValue({
      total: 2,
      rows: seriesRankingRows,
    });

    const result = await service.getLeaderboard({ guildId: "guild-1" });

    expect(result.metric).toBe(LeaderboardMetric.SeriesWinRate);
    expect(result.window).toBe(LeaderboardWindow.ThreeMonths);
    expect(result.minGamesPlayed).toBe(2);
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => [row.rank, row.gamertag, row.metricValue])).toEqual([
      [1, "Alpha", 1],
      [2, "Bravo", 0.5],
    ]);

    expect(getSeriesRankingsSpy).toHaveBeenCalledTimes(1);
    const [seriesRankingArgs] = Preconditions.checkExists(getSeriesRankingsSpy.mock.calls[0]);
    expect(seriesRankingArgs.guildId).toBe("guild-1");
    expect(seriesRankingArgs.queueChannelId).toBeNull();
    expect(seriesRankingArgs.startEpochSeconds).toBeGreaterThan(0);
    expect(seriesRankingArgs.minGamesPlayed).toBe(2);
    expect(seriesRankingArgs.limit).toBe(25);
    expect(seriesRankingArgs.offset).toBe(0);
  });

  it("supports queue scope and pagination for stat metrics", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });

    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({
        GuildId: "guild-1",
        DefaultMetric: LeaderboardMetric.SeriesWinRate,
        DefaultWindow: LeaderboardWindow.ThreeMonths,
        MinGamesPlayed: 0,
      }),
    );
    const getMetricRankingsSpy = vi.spyOn(databaseService, "getLeaderboardStatMetricRankings").mockResolvedValue({
      total: 2,
      rows: [Preconditions.checkExists(killsRankingRows[0])],
    });

    const result = await service.getLeaderboard({
      guildId: "guild-1",
      queueChannelId: "queue-a",
      metric: LeaderboardMetric.Kills,
      window: LeaderboardWindow.OneMonth,
      minGamesPlayed: 1,
      page: 2,
      pageSize: 1,
    });

    expect(result.metric).toBe(LeaderboardMetric.Kills);
    expect(result.window).toBe(LeaderboardWindow.OneMonth);
    expect(result.total).toBe(2);
    expect(result.rows).toEqual([
      {
        rank: 2,
        xboxXuid: "xuid-1",
        discordUserId: "discord-1",
        gamertag: "Alpha",
        seriesPlayed: 2,
        seriesWins: 0,
        gamesPlayed: 2,
        metricValue: 15,
      },
    ]);

    expect(getMetricRankingsSpy).toHaveBeenCalledTimes(1);
    const [metricRankingArgs] = Preconditions.checkExists(getMetricRankingsSpy.mock.calls[0]);
    expect(metricRankingArgs.guildId).toBe("guild-1");
    expect(metricRankingArgs.queueChannelId).toBe("queue-a");
    expect(metricRankingArgs.startEpochSeconds).toBeGreaterThan(0);
    expect(metricRankingArgs.minGamesPlayed).toBe(1);
    expect(metricRankingArgs.limit).toBe(1);
    expect(metricRankingArgs.offset).toBe(1);
    expect(metricRankingArgs.metric).toBe(LeaderboardMetric.Kills);
  });

  it("clamps non-finite metric values to a JSON-safe maximum", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });

    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({
        GuildId: "guild-1",
        DefaultMetric: LeaderboardMetric.SeriesWinRate,
        DefaultWindow: LeaderboardWindow.ThreeMonths,
        MinGamesPlayed: 0,
      }),
    );
    vi.spyOn(databaseService, "getLeaderboardStatMetricRankings").mockResolvedValue({
      total: 1,
      rows: [
        {
          XboxXuid: "xuid-2",
          DiscordUserId: "discord-2",
          Gamertag: "Bravo",
          SeriesPlayed: 1,
          SeriesWins: 0,
          GamesPlayed: 1,
          MetricValue: Number.POSITIVE_INFINITY,
        },
      ],
    });

    const result = await service.getLeaderboard({
      guildId: "guild-1",
      metric: LeaderboardMetric.DamageRatio,
      minGamesPlayed: 1,
    });

    expect(result.rows[0]?.gamertag).toBe("Bravo");
    expect(result.rows[0]?.metricValue).toBe(Number.MAX_VALUE);
  });
});
