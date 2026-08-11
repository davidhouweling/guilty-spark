import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardGamePlayerFactRow, LeaderboardSeriesPlayerFactRow } from "../../database/database";
import { aFakeDatabaseServiceWith, aFakeLeaderboardConfigRow } from "../../database/fakes/database.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { LeaderboardService } from "../leaderboard";

describe("LeaderboardService", () => {
  const nowIso = "2026-08-11T12:00:00.000Z";

  const seriesFacts: LeaderboardSeriesPlayerFactRow[] = [
    {
      XboxXuid: "xuid-1",
      DiscordUserId: "discord-1",
      Gamertag: "Alpha",
      SeriesWon: 1,
      GamesPlayedCount: 3,
    },
    {
      XboxXuid: "xuid-1",
      DiscordUserId: "discord-1",
      Gamertag: "Alpha",
      SeriesWon: 1,
      GamesPlayedCount: 2,
    },
    {
      XboxXuid: "xuid-2",
      DiscordUserId: "discord-2",
      Gamertag: "Bravo",
      SeriesWon: 1,
      GamesPlayedCount: 1,
    },
    {
      XboxXuid: "xuid-2",
      DiscordUserId: "discord-2",
      Gamertag: "Bravo",
      SeriesWon: 0,
      GamesPlayedCount: 1,
    },
    {
      XboxXuid: "xuid-3",
      DiscordUserId: "discord-3",
      Gamertag: "Charlie",
      SeriesWon: 0,
      GamesPlayedCount: 1,
    },
  ];

  const gameFacts: LeaderboardGamePlayerFactRow[] = [
    {
      XboxXuid: "xuid-1",
      DiscordUserId: "discord-1",
      Gamertag: "Alpha",
      Kills: 5,
      Deaths: 4,
      Assists: 2,
      Kda: 1.75,
      Accuracy: 45,
      DamageDealt: 4200,
      DamageTaken: 2000,
      PersonalScore: 2000,
      QueueNumber: 10,
    },
    {
      XboxXuid: "xuid-1",
      DiscordUserId: "discord-1",
      Gamertag: "Alpha",
      Kills: 10,
      Deaths: 6,
      Assists: 5,
      Kda: 2.5,
      Accuracy: 48,
      DamageDealt: 5200,
      DamageTaken: 2500,
      PersonalScore: 3000,
      QueueNumber: 11,
    },
    {
      XboxXuid: "xuid-2",
      DiscordUserId: "discord-2",
      Gamertag: "Bravo",
      Kills: 20,
      Deaths: 11,
      Assists: 1,
      Kda: 1.9,
      Accuracy: 38,
      DamageDealt: 8000,
      DamageTaken: 0,
      PersonalScore: 4500,
      QueueNumber: 12,
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
    const getSeriesFactsSpy = vi
      .spyOn(databaseService, "getLeaderboardSeriesPlayerFacts")
      .mockResolvedValue(seriesFacts);

    const result = await service.getLeaderboard({ guildId: "guild-1" });

    expect(result.metric).toBe(LeaderboardMetric.SeriesWinRate);
    expect(result.window).toBe(LeaderboardWindow.ThreeMonths);
    expect(result.minGamesPlayed).toBe(2);
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => [row.rank, row.gamertag, row.metricValue])).toEqual([
      [1, "Alpha", 1],
      [2, "Bravo", 0.5],
    ]);

    expect(getSeriesFactsSpy).toHaveBeenCalledTimes(1);
    const [seriesFactArgs] = Preconditions.checkExists(getSeriesFactsSpy.mock.calls[0]);
    expect(seriesFactArgs.guildId).toBe("guild-1");
    expect(seriesFactArgs.queueChannelId).toBeNull();
    expect(seriesFactArgs.startEpochSeconds).toBeGreaterThan(0);
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
    const getGameFactsSpy = vi.spyOn(databaseService, "getLeaderboardGamePlayerFacts").mockResolvedValue(gameFacts);

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

    expect(getGameFactsSpy).toHaveBeenCalledTimes(1);
    const [gameFactArgs] = Preconditions.checkExists(getGameFactsSpy.mock.calls[0]);
    expect(gameFactArgs.guildId).toBe("guild-1");
    expect(gameFactArgs.queueChannelId).toBe("queue-a");
    expect(gameFactArgs.startEpochSeconds).toBeGreaterThan(0);
  });

  it("computes infinite damage ratio when damage taken is zero", async () => {
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
    vi.spyOn(databaseService, "getLeaderboardGamePlayerFacts").mockResolvedValue(gameFacts);

    const result = await service.getLeaderboard({
      guildId: "guild-1",
      metric: LeaderboardMetric.DamageRatio,
      minGamesPlayed: 1,
    });

    expect(result.rows[0]?.gamertag).toBe("Bravo");
    expect(result.rows[0]?.metricValue).toBe(Number.POSITIVE_INFINITY);
  });
});
