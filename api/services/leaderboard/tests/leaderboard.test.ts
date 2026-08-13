import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIMessage, APIMessageTopLevelComponent } from "discord-api-types/v10";
import { ComponentType, Locale } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardRankingRow } from "../../database/types/leaderboard_ranking_row";
import {
  aFakeDatabaseServiceWith,
  aFakeLeaderboardConfigRow,
  aFakeNeatQueueConfigRow,
  aFakeLeaderboardPostRow,
} from "../../database/fakes/database.fake";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake";
import { apiMessage, guild } from "../../discord/fakes/data";
import { DiscordError } from "../../discord/discord-error";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { getMatchStats } from "../../halo/fakes/data";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import type { NeatQueueMatchCompletedRequest } from "../../neatqueue/types";
import { LeaderboardService } from "../leaderboard";

function aLeaderboardMessageWith(): APIMessage {
  const components: APIMessageTopLevelComponent[] = [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: "select_leaderboard_metric:guild-1:queue-1:3M:KILLS:2:3",
          min_values: 1,
          max_values: 1,
          options: [{ label: "Kills", value: LeaderboardMetric.Kills, default: true }],
        },
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: "select_leaderboard_window:guild-1:queue-1:3M:KILLS:2:3",
          min_values: 1,
          max_values: 1,
          options: [{ label: "3 months", value: LeaderboardWindow.ThreeMonths, default: true }],
        },
      ],
    },
  ];

  return {
    ...apiMessage,
    components,
    embeds: [{ footer: { text: "Page 2 of 3 | Min games: 3 | Total players: 23" } }],
  };
}

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

  afterEach(() => {
    vi.useRealTimers();
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

  it("re-fetches the final valid page when a saved page is out of range", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({ GuildId: "guild-1", MinGamesPlayed: 3 }),
    );
    const getMetricRankingsSpy = vi
      .spyOn(databaseService, "getLeaderboardStatMetricRankings")
      .mockResolvedValue({ total: 11, rows: [Preconditions.checkExists(killsRankingRows[0])] });

    const result = await service.getLeaderboardWithResolvedPage({
      guildId: "guild-1",
      metric: LeaderboardMetric.Kills,
      page: 3,
      pageSize: 10,
      minGamesPlayed: 3,
    });

    expect(result.page).toBe(2);
    expect(getMetricRankingsSpy).toHaveBeenCalledTimes(2);
    expect(getMetricRankingsSpy.mock.calls[0]?.[0]?.offset).toBe(20);
    expect(getMetricRankingsSpy.mock.calls[1]?.[0]?.offset).toBe(10);
  });

  it("refreshes matching registered leaderboard posts", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const guildWidePost = aFakeLeaderboardPostRow();
    const queuePost = aFakeLeaderboardPostRow({
      ChannelId: "channel-2",
      MessageId: "message-2",
      QueueChannelId: "queue-1",
    });
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockResolvedValue([guildWidePost, queuePost]);
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({ GuildId: "guild-1", MinGamesPlayed: 3 }),
    );
    vi.spyOn(databaseService, "getLeaderboardStatMetricRankings").mockResolvedValue({
      total: 23,
      rows: killsRankingRows,
    });
    vi.spyOn(discordService, "getMessage").mockResolvedValue(aLeaderboardMessageWith());
    vi.spyOn(discordService, "getGuild").mockResolvedValue({
      ...guild,
      id: "guild-1",
      preferred_locale: Locale.EnglishUS,
    });
    const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(editMessageSpy).toHaveBeenCalledTimes(2);
    expect(editMessageSpy).toHaveBeenNthCalledWith(
      1,
      "leaderboard-channel-1",
      "leaderboard-message-1",
      expect.any(Object),
    );
    expect(editMessageSpy).toHaveBeenNthCalledWith(2, "channel-2", "message-2", expect.any(Object));
  });

  it("removes a registered post when Discord confirms it is missing", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const post = aFakeLeaderboardPostRow();
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockResolvedValue([post]);
    vi.spyOn(discordService, "getMessage").mockRejectedValue(
      new DiscordError(404, { code: 10008, message: "Unknown Message" }),
    );
    const deletePostSpy = vi.spyOn(databaseService, "deleteLeaderboardPost").mockResolvedValue(undefined);

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(deletePostSpy).toHaveBeenCalledWith(post.ChannelId, post.MessageId);
  });

  it("continues refreshing posts when one Discord update fails", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const firstPost = aFakeLeaderboardPostRow();
    const secondPost = aFakeLeaderboardPostRow({ ChannelId: "channel-2", MessageId: "message-2" });
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockResolvedValue([firstPost, secondPost]);
    vi.spyOn(discordService, "getMessage")
      .mockRejectedValueOnce(new Error("Discord temporarily unavailable"))
      .mockResolvedValueOnce(aLeaderboardMessageWith());
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({ GuildId: "guild-1", MinGamesPlayed: 3 }),
    );
    vi.spyOn(databaseService, "getLeaderboardStatMetricRankings").mockResolvedValue({
      total: 23,
      rows: killsRankingRows,
    });
    vi.spyOn(discordService, "getGuild").mockResolvedValue({
      ...guild,
      id: "guild-1",
      preferred_locale: Locale.EnglishUS,
    });
    const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(editMessageSpy).toHaveBeenCalledTimes(1);
    expect(editMessageSpy).toHaveBeenCalledWith("channel-2", "message-2", expect.any(Object));
  });

  it("continues refreshing posts when deleting a missing post registration fails", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const missingPost = aFakeLeaderboardPostRow();
    const secondPost = aFakeLeaderboardPostRow({ ChannelId: "channel-2", MessageId: "message-2" });
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockResolvedValue([missingPost, secondPost]);
    vi.spyOn(discordService, "getMessage")
      .mockRejectedValueOnce(new DiscordError(404, { code: 10008, message: "Unknown Message" }))
      .mockResolvedValueOnce(aLeaderboardMessageWith());
    vi.spyOn(databaseService, "deleteLeaderboardPost").mockRejectedValue(new Error("D1 temporarily unavailable"));
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({ GuildId: "guild-1", MinGamesPlayed: 3 }),
    );
    vi.spyOn(databaseService, "getLeaderboardStatMetricRankings").mockResolvedValue({
      total: 23,
      rows: killsRankingRows,
    });
    vi.spyOn(discordService, "getGuild").mockResolvedValue({
      ...guild,
      id: "guild-1",
      preferred_locale: Locale.EnglishUS,
    });
    const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);
    const warnSpy = vi.spyOn(logService, "warn");

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(editMessageSpy).toHaveBeenCalledTimes(1);
    expect(editMessageSpy).toHaveBeenCalledWith("channel-2", "message-2", expect.any(Object));
    expect(warnSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
    const [warnMessage, warnContext] = Preconditions.checkExists(warnSpy.mock.calls[0]);
    expect(warnMessage).toBeInstanceOf(Error);
    expect(Preconditions.checkExists(warnContext).get("reason")).toBe(
      "Failed to delete missing leaderboard post registration",
    );
  });

  it("skips post refresh when loading refresh registrations fails", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockRejectedValue(new Error("D1 unavailable"));
    const warnSpy = vi.spyOn(logService, "warn");
    const editMessageSpy = vi.spyOn(discordService, "editMessage");

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(editMessageSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
    const [warnMessage, warnContext] = Preconditions.checkExists(warnSpy.mock.calls[0]);
    expect(warnMessage).toBeInstanceOf(Error);
    const context = Preconditions.checkExists(warnContext);
    expect(context.get("guildId")).toBe("guild-1");
    expect(context.get("queueChannelId")).toBe("queue-1");
    expect(context.get("reason")).toBe("Failed to load leaderboard posts for refresh");
  });

  it("skips persistence when no series matches are resolved", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const upsertSpy = vi.spyOn(databaseService, "upsertLeaderboardSeriesDataBatch");
    const infoSpy = vi.spyOn(logService, "info");

    const request: NeatQueueMatchCompletedRequest = {
      action: "MATCH_COMPLETED",
      guild: "guild-1",
      channel: "channel-1",
      queue: "ranked",
      match_number: 42,
      winning_team_index: 0,
      teams: [],
    };

    await service.persistSeriesData({
      request,
      neatQueueConfig: aFakeNeatQueueConfigRow(),
      series: [],
      locale: "en-US",
    });

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "Leaderboard persistence skipped because series data is empty",
      expect.any(Map),
    );
  });

  it("skips persistence when winning team index is unresolved", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const upsertSpy = vi.spyOn(databaseService, "upsertLeaderboardSeriesDataBatch");
    const infoSpy = vi.spyOn(logService, "info");

    const request: NeatQueueMatchCompletedRequest = {
      action: "MATCH_COMPLETED",
      guild: "guild-1",
      channel: "channel-1",
      queue: "ranked",
      match_number: 42,
      winning_team_index: -1,
      teams: [],
    };

    await service.persistSeriesData({
      request,
      neatQueueConfig: aFakeNeatQueueConfigRow(),
      series: [Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"))],
      locale: "en-US",
    });

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "Leaderboard persistence skipped because winning team index is unresolved",
      expect.any(Map),
    );
  });
});
