import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIMessage, APIMessageTopLevelComponent } from "discord-api-types/v10";
import { ComponentType, Locale } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { LeaderboardMetric, LeaderboardMetricFamily, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { LEADERBOARD_MAX_PAGE_SIZE } from "@guilty-spark/shared/contracts/stats/leaderboard";
import type { LeaderboardRankingRow } from "../../database/types/leaderboard_ranking_row";
import {
  aFakeDatabaseServiceWith,
  aFakeLeaderboardConfigRow,
  aFakeNeatQueueConfigRow,
  aFakeLeaderboardPostRow,
} from "../../database/fakes/database.fake";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake";
import { apiMessage } from "../../discord/fakes/data";
import { DiscordError } from "../../discord/discord-error";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { getMatchStats } from "../../halo/fakes/data";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import type { NeatQueueMatchCompletedRequest } from "../../neatqueue/types";
import { LeaderboardService } from "../leaderboard";

function aLeaderboardMessageWith({
  footer = "Page 2 of 3 | Min games: 3 | Total players: 23",
}: {
  footer?: string;
} = {}): APIMessage {
  const components: APIMessageTopLevelComponent[] = [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: "select_leaderboard_metric_family:guild-1:queue-1:3M:KILLS:2:3",
          min_values: 1,
          max_values: 1,
          options: [{ label: "Kills", value: LeaderboardMetricFamily.Kills, default: true }],
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
    embeds: [{ footer: { text: footer } }],
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
      GameWins: 4,
      MedalCount: 12,
      ObjectiveGamesPlayed: 0,
      ObjectiveTimeSeconds: 0,
      MetricValue: 1,
    },
    {
      XboxXuid: "xuid-2",
      DiscordUserId: "discord-2",
      Gamertag: "Bravo",
      SeriesPlayed: 2,
      SeriesWins: 1,
      GamesPlayed: 2,
      GameWins: 1,
      MedalCount: 8,
      ObjectiveGamesPlayed: 0,
      ObjectiveTimeSeconds: 0,
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
      GameWins: 1,
      MedalCount: 4,
      ObjectiveGamesPlayed: 0,
      ObjectiveTimeSeconds: 0,
      MetricValue: 15,
    },
    {
      XboxXuid: "xuid-2",
      DiscordUserId: "discord-2",
      Gamertag: "Bravo",
      SeriesPlayed: 1,
      SeriesWins: 0,
      GamesPlayed: 1,
      GameWins: 0,
      MedalCount: 2,
      ObjectiveGamesPlayed: 0,
      ObjectiveTimeSeconds: 0,
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
    const getSeriesRankingsSpy = vi.spyOn(databaseService, "getLeaderboardOutcomeMetricRankings").mockResolvedValue({
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

  it("uses the scoped reset marker as the default leaderboard window", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const resetAt = 1_723_600_000;

    vi.spyOn(databaseService, "getLeaderboardResetMarker").mockResolvedValue({
      GuildId: "guild-1",
      QueueChannelId: null,
      ResetAt: resetAt,
      CreatedAt: resetAt,
      UpdatedAt: resetAt,
    });
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(aFakeLeaderboardConfigRow());
    const rankingsSpy = vi.spyOn(databaseService, "getLeaderboardOutcomeMetricRankings").mockResolvedValue({
      total: 0,
      rows: [],
    });

    const result = await service.getLeaderboard({ guildId: "guild-1" });

    expect(result.window).toBe(LeaderboardWindow.LastReset);
    expect(result.resetAt).toBe(resetAt);
    expect(rankingsSpy).toHaveBeenCalledWith(expect.objectContaining({ startEpochSeconds: resetAt }));
  });

  it("falls back to the server reset marker for a queue without its own marker", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const resetAt = 1_723_600_000;
    const getMarkerSpy = vi.spyOn(databaseService, "getLeaderboardResetMarker");
    getMarkerSpy.mockResolvedValueOnce(null).mockResolvedValueOnce({
      GuildId: "guild-1",
      QueueChannelId: null,
      ResetAt: resetAt,
      CreatedAt: resetAt,
      UpdatedAt: resetAt,
    });
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(aFakeLeaderboardConfigRow());
    vi.spyOn(databaseService, "getLeaderboardOutcomeMetricRankings").mockResolvedValue({ total: 0, rows: [] });

    const result = await service.getLeaderboard({ guildId: "guild-1", queueChannelId: "queue-1" });

    expect(result.window).toBe(LeaderboardWindow.LastReset);
    expect(result.resetAt).toBe(resetAt);
    expect(getMarkerSpy).toHaveBeenNthCalledWith(1, "guild-1", "queue-1");
    expect(getMarkerSpy).toHaveBeenNthCalledWith(2, "guild-1", null);
  });

  it("uses the stored reset marker when the reset window is requested", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const resetAt = 1_723_600_000;

    vi.spyOn(databaseService, "getLeaderboardResetMarker").mockResolvedValue({
      GuildId: "guild-1",
      QueueChannelId: null,
      ResetAt: resetAt,
      CreatedAt: resetAt,
      UpdatedAt: resetAt,
    });
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(aFakeLeaderboardConfigRow());
    const rankingsSpy = vi.spyOn(databaseService, "getLeaderboardOutcomeMetricRankings").mockResolvedValue({
      total: 0,
      rows: [],
    });

    const result = await service.getLeaderboard({
      guildId: "guild-1",
      window: LeaderboardWindow.LastReset,
    });

    expect(result.window).toBe(LeaderboardWindow.LastReset);
    expect(result.resetAt).toBe(resetAt);
    expect(rankingsSpy).toHaveBeenCalledWith(expect.objectContaining({ startEpochSeconds: resetAt }));
  });

  it("falls back to the configured default window when reset is requested without a marker", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });

    vi.spyOn(databaseService, "getLeaderboardResetMarker").mockResolvedValue(null);
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(aFakeLeaderboardConfigRow());
    const rankingsSpy = vi.spyOn(databaseService, "getLeaderboardOutcomeMetricRankings").mockResolvedValue({
      total: 0,
      rows: [],
    });

    const result = await service.getLeaderboard({
      guildId: "guild-1",
      window: LeaderboardWindow.LastReset,
    });

    expect(result.window).toBe(LeaderboardWindow.ThreeMonths);
    expect(result.resetAt).toBeNull();
    const [rankingArgs] = Preconditions.checkExists(rankingsSpy.mock.calls[0]);
    expect(rankingArgs.startEpochSeconds).toBeGreaterThan(0);
  });

  it("keeps reset window selectable when showing a rolling window", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const resetAt = 1_723_600_000;

    vi.spyOn(databaseService, "getLeaderboardResetMarker").mockResolvedValue({
      GuildId: "guild-1",
      QueueChannelId: null,
      ResetAt: resetAt,
      CreatedAt: resetAt,
      UpdatedAt: resetAt,
    });
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(aFakeLeaderboardConfigRow());
    const rankingsSpy = vi.spyOn(databaseService, "getLeaderboardOutcomeMetricRankings").mockResolvedValue({
      total: 0,
      rows: [],
    });

    const result = await service.getLeaderboard({
      guildId: "guild-1",
      window: LeaderboardWindow.OneMonth,
    });

    expect(result.window).toBe(LeaderboardWindow.OneMonth);
    expect(result.resetAt).toBe(resetAt);
    const [rankingArgs] = Preconditions.checkExists(rankingsSpy.mock.calls[0]);
    expect(rankingArgs.startEpochSeconds).toBeGreaterThan(0);
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
        gameWins: 1,
        medalCount: 4,
        objectiveGamesPlayed: 0,
        objectiveTimeSeconds: 0,
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

  it("clamps pageSize to the leaderboard max page size", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });

    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({ GuildId: "guild-1", MinGamesPlayed: 0 }),
    );
    const getMetricRankingsSpy = vi
      .spyOn(databaseService, "getLeaderboardStatMetricRankings")
      .mockResolvedValue({ total: 0, rows: [] });

    await service.getLeaderboard({
      guildId: "guild-1",
      metric: LeaderboardMetric.Kills,
      pageSize: 10_000,
    });

    const [metricRankingArgs] = Preconditions.checkExists(getMetricRankingsSpy.mock.calls[0]);
    expect(metricRankingArgs.limit).toBe(LEADERBOARD_MAX_PAGE_SIZE);
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
          GameWins: 0,
          MedalCount: 0,
          ObjectiveGamesPlayed: 0,
          ObjectiveTimeSeconds: 0,
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
    const getGuildPreferredLocaleSpy = vi
      .spyOn(discordService, "getGuildPreferredLocale")
      .mockResolvedValue(Locale.EnglishUS);
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
    expect(getGuildPreferredLocaleSpy).toHaveBeenCalledTimes(1);
    expect(getGuildPreferredLocaleSpy).toHaveBeenCalledWith("guild-1");
  });

  it("skips guild locale lookup when there are no posts to refresh", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockResolvedValue([]);
    const getGuildPreferredLocaleSpy = vi.spyOn(discordService, "getGuildPreferredLocale");

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(getGuildPreferredLocaleSpy).not.toHaveBeenCalled();
  });

  it("skips loading reset refresh registrations when Discord service is unavailable", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const findGuildPostsSpy = vi.spyOn(databaseService, "findLeaderboardPostsForGuildRefresh");
    const findQueuePostsSpy = vi.spyOn(databaseService, "findLeaderboardPostsForRefresh");

    await service.refreshPostsForReset("guild-1", null);
    await service.refreshPostsForReset("guild-1", "queue-1");

    expect(findGuildPostsSpy).not.toHaveBeenCalled();
    expect(findQueuePostsSpy).not.toHaveBeenCalled();
  });

  it("refreshes guild-wide posts for reset when queue channel is omitted", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const firstPost = aFakeLeaderboardPostRow();
    const secondPost = aFakeLeaderboardPostRow({ ChannelId: "channel-2", MessageId: "message-2" });
    const findGuildPostsSpy = vi
      .spyOn(databaseService, "findLeaderboardPostsForGuildRefresh")
      .mockResolvedValue([firstPost, secondPost]);
    const findQueuePostsSpy = vi.spyOn(databaseService, "findLeaderboardPostsForRefresh");
    vi.spyOn(discordService, "getGuildPreferredLocale").mockResolvedValue(Locale.EnglishUS);
    vi.spyOn(discordService, "getMessage").mockResolvedValue(aLeaderboardMessageWith());
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({ GuildId: "guild-1", MinGamesPlayed: 3 }),
    );
    vi.spyOn(databaseService, "getLeaderboardStatMetricRankings").mockResolvedValue({
      total: 23,
      rows: killsRankingRows,
    });
    const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);

    await service.refreshPostsForReset("guild-1", null);

    expect(findGuildPostsSpy).toHaveBeenCalledWith("guild-1");
    expect(findQueuePostsSpy).not.toHaveBeenCalled();
    expect(editMessageSpy).toHaveBeenCalledTimes(2);
    expect(editMessageSpy).toHaveBeenNthCalledWith(
      1,
      "leaderboard-channel-1",
      "leaderboard-message-1",
      expect.any(Object),
    );
    expect(editMessageSpy).toHaveBeenNthCalledWith(2, "channel-2", "message-2", expect.any(Object));
  });

  it("refreshes queue-scoped posts for reset when queue channel is provided", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const queuePost = aFakeLeaderboardPostRow({ ChannelId: "channel-2", MessageId: "message-2" });
    const findGuildPostsSpy = vi.spyOn(databaseService, "findLeaderboardPostsForGuildRefresh");
    const findQueuePostsSpy = vi
      .spyOn(databaseService, "findLeaderboardPostsForRefresh")
      .mockResolvedValue([queuePost]);
    vi.spyOn(discordService, "getGuildPreferredLocale").mockResolvedValue(Locale.EnglishUS);
    vi.spyOn(discordService, "getMessage").mockResolvedValue(aLeaderboardMessageWith());
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({ GuildId: "guild-1", MinGamesPlayed: 3 }),
    );
    vi.spyOn(databaseService, "getLeaderboardStatMetricRankings").mockResolvedValue({
      total: 23,
      rows: killsRankingRows,
    });
    const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);

    await service.refreshPostsForReset("guild-1", "queue-1");

    expect(findQueuePostsSpy).toHaveBeenCalledWith("guild-1", "queue-1");
    expect(findGuildPostsSpy).not.toHaveBeenCalled();
    expect(editMessageSpy).toHaveBeenCalledTimes(1);
    expect(editMessageSpy).toHaveBeenCalledWith("channel-2", "message-2", expect.any(Object));
  });

  it("continues refreshing posts with the preferred locale helper result", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const post = aFakeLeaderboardPostRow();
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockResolvedValue([post]);
    vi.spyOn(discordService, "getGuildPreferredLocale").mockResolvedValue(Locale.EnglishUS);
    vi.spyOn(discordService, "getMessage").mockResolvedValue(aLeaderboardMessageWith());
    vi.spyOn(databaseService, "getLeaderboardConfig").mockResolvedValue(
      aFakeLeaderboardConfigRow({ GuildId: "guild-1", MinGamesPlayed: 3 }),
    );
    vi.spyOn(databaseService, "getLeaderboardStatMetricRankings").mockResolvedValue({
      total: 23,
      rows: killsRankingRows,
    });
    const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(editMessageSpy).toHaveBeenCalledTimes(1);
  });

  it("removes a registered post when Discord confirms it is missing", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const post = aFakeLeaderboardPostRow();
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockResolvedValue([post]);
    vi.spyOn(discordService, "getGuildPreferredLocale").mockResolvedValue(Locale.EnglishUS);
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
    vi.spyOn(discordService, "getGuildPreferredLocale").mockResolvedValue(Locale.EnglishUS);
    const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);
    const warnSpy = vi.spyOn(logService, "warn");

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(editMessageSpy).toHaveBeenCalledTimes(1);
    expect(editMessageSpy).toHaveBeenCalledWith("channel-2", "message-2", expect.any(Object));
    expect(warnSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
    const [, warnContext] = Preconditions.checkExists(warnSpy.mock.calls[0]);
    const context = Preconditions.checkExists(warnContext);
    expect(context.get("guildId")).toBe("guild-1");
    expect(context.get("channelId")).toBe("leaderboard-channel-1");
    expect(context.get("messageId")).toBe("leaderboard-message-1");
    expect(context.get("reason")).toBe("Failed to refresh leaderboard post");
  });

  it("preserves a posted leaderboard when its refresh query fails", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const firstPost = aFakeLeaderboardPostRow();
    const secondPost = aFakeLeaderboardPostRow({ ChannelId: "channel-2", MessageId: "message-2" });
    const firstMessage = aLeaderboardMessageWith();
    const refreshError = new Error("Leaderboard query failed");
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockResolvedValue([firstPost, secondPost]);
    vi.spyOn(discordService, "getMessage").mockResolvedValue(firstMessage);
    vi.spyOn(discordService, "getGuildPreferredLocale").mockResolvedValue(Locale.EnglishUS);
    vi.spyOn(databaseService, "getLeaderboardConfig")
      .mockRejectedValueOnce(refreshError)
      .mockResolvedValue(aFakeLeaderboardConfigRow({ GuildId: "guild-1", MinGamesPlayed: 3 }));
    vi.spyOn(databaseService, "getLeaderboardStatMetricRankings").mockResolvedValue({
      total: 23,
      rows: killsRankingRows,
    });
    const preserveErrorSpy = vi.spyOn(discordService, "updateMessageWithError").mockResolvedValue(apiMessage);
    const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(preserveErrorSpy).toHaveBeenCalledWith(firstPost.ChannelId, firstPost.MessageId, refreshError, {
      preserveMessage: firstMessage,
      errorEmbedFooter: "Temporary leaderboard error",
      suppressErrorLogging: true,
    });
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
    vi.spyOn(discordService, "getGuildPreferredLocale").mockResolvedValue(Locale.EnglishUS);
    const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);
    const warnSpy = vi.spyOn(logService, "warn");

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(editMessageSpy).toHaveBeenCalledTimes(1);
    expect(editMessageSpy).toHaveBeenCalledWith("channel-2", "message-2", expect.any(Object));
    expect(warnSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
    const [warnMessage, warnContext] = Preconditions.checkExists(warnSpy.mock.calls[0]);
    expect(warnMessage).toBeInstanceOf(Error);
    const context = Preconditions.checkExists(warnContext);
    expect(context.get("guildId")).toBe("guild-1");
    expect(context.get("channelId")).toBe("leaderboard-channel-1");
    expect(context.get("messageId")).toBe("leaderboard-message-1");
    expect(context.get("reason")).toBe("Failed to delete missing leaderboard post registration");
  });

  it("logs full post context when message state is invalid", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const discordService = aFakeDiscordServiceWith();
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, discordService, haloService, logService });
    const post = aFakeLeaderboardPostRow({
      GuildId: "guild-1",
      ChannelId: "leaderboard-channel-1",
      MessageId: "leaderboard-message-1",
    });
    vi.spyOn(databaseService, "findLeaderboardPostsForRefresh").mockResolvedValue([post]);
    vi.spyOn(discordService, "getGuildPreferredLocale").mockResolvedValue(Locale.EnglishUS);
    vi.spyOn(discordService, "getMessage").mockResolvedValue(
      aLeaderboardMessageWith({ footer: "Leaderboard pagination unavailable" }),
    );
    const warnSpy = vi.spyOn(logService, "warn");

    await service.refreshPostsForCompletedQueue("guild-1", "queue-1");

    expect(warnSpy).toHaveBeenCalledWith(
      "Leaderboard post refresh skipped because message state is invalid",
      expect.any(Map),
    );
    const [, warnContext] = Preconditions.checkExists(warnSpy.mock.calls[0]);
    const context = Preconditions.checkExists(warnContext);
    expect(context.get("guildId")).toBe("guild-1");
    expect(context.get("channelId")).toBe("leaderboard-channel-1");
    expect(context.get("messageId")).toBe("leaderboard-message-1");
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

  it("persists reconciled ties with no winning team", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const upsertSpy = vi.spyOn(databaseService, "upsertLeaderboardSeriesDataBatch");

    await service.persistReconciledSeriesData({
      guildId: "guild-1",
      channelId: "channel-1",
      queueNumber: 42,
      neatQueueConfig: aFakeNeatQueueConfigRow(),
      series: [Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"))],
      winnerTeamIndex: -1,
      locale: "en-US",
    });

    const [payload] = Preconditions.checkExists(upsertSpy.mock.calls[0]);
    expect(payload.series.WinnerTeamIndex).toBe(-1);
    expect(payload.seriesPlayers.every((player) => player.SeriesWon === 0)).toBe(true);
  });

  it("persists average damage per life using total lives", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const match = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));
    const player = Preconditions.checkExists(match.Players[0]);
    const teamStats = Preconditions.checkExists(player.PlayerTeamStats[0]);
    teamStats.Stats.CoreStats = {
      ...teamStats.Stats.CoreStats,
      DamageDealt: 15000,
      Deaths: 10,
    };
    const upsertSpy = vi.spyOn(databaseService, "upsertLeaderboardSeriesDataBatch");

    await service.persistSeriesData({
      request: {
        action: "MATCH_COMPLETED",
        guild: "guild-1",
        channel: "channel-1",
        queue: "ranked",
        match_number: 42,
        winning_team_index: teamStats.TeamId,
        teams: [],
      },
      neatQueueConfig: aFakeNeatQueueConfigRow(),
      series: [match],
      locale: "en-US",
    });

    const [payload] = Preconditions.checkExists(upsertSpy.mock.calls[0]);
    const gamePlayer = Preconditions.checkExists(payload.gamePlayers[0]);
    expect(gamePlayer.AvgDamagePerLife).toBe(15000 / 11);
  });

  it("persists medal aggregates from Halo medal metadata", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const match = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));
    const player = Preconditions.checkExists(match.Players[0]);
    const teamStats = Preconditions.checkExists(player.PlayerTeamStats[0]);
    teamStats.Stats.CoreStats = {
      ...teamStats.Stats.CoreStats,
      Medals: [
        { NameId: 3334154676, Count: 2, TotalPersonalScoreAwarded: 20 },
        { NameId: 835814121, Count: 3, TotalPersonalScoreAwarded: 450 },
        { NameId: 0, Count: 1, TotalPersonalScoreAwarded: 0 },
      ],
    };
    const upsertSpy = vi.spyOn(databaseService, "upsertLeaderboardSeriesDataBatch");

    await service.persistSeriesData({
      request: {
        action: "MATCH_COMPLETED",
        guild: "guild-1",
        channel: "channel-1",
        queue: "ranked",
        match_number: 42,
        winning_team_index: teamStats.TeamId,
        teams: [],
      },
      neatQueueConfig: aFakeNeatQueueConfigRow(),
      series: [match],
      locale: "en-US",
    });

    const [payload] = Preconditions.checkExists(upsertSpy.mock.calls[0]);
    const gamePlayer = Preconditions.checkExists(payload.gamePlayers[0]);
    expect(gamePlayer.MedalCount).toBe(6);
    expect(gamePlayer.MedalPoints).toBe(470);
    expect(gamePlayer.MythicMedalCount).toBe(3);
    expect(JSON.parse(gamePlayer.MedalsJson)).toHaveLength(3);
  });

  it("persists objective time and contribution shares for CTF players", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const match = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));
    const upsertSpy = vi.spyOn(databaseService, "upsertLeaderboardSeriesDataBatch");

    await service.persistSeriesData({
      request: {
        action: "MATCH_COMPLETED",
        guild: "guild-1",
        channel: "channel-1",
        queue: "ranked",
        match_number: 42,
        winning_team_index: 0,
        teams: [],
      },
      neatQueueConfig: aFakeNeatQueueConfigRow(),
      series: [match],
      locale: "en-US",
    });

    const [payload] = Preconditions.checkExists(upsertSpy.mock.calls[0]);
    const player = Preconditions.checkExists(payload.gamePlayers.find((row) => row.XboxXuid === "0100000000000000"));
    expect(player.ObjectiveTimeSeconds).toBe(11.1);
    expect(player.ObjectiveTeamContribution).toBeCloseTo(11.1 / 63.7);
  });

  it("persists only objective stats in ObjectiveStatsJson", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const match = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));
    const upsertSpy = vi.spyOn(databaseService, "upsertLeaderboardSeriesDataBatch");

    await service.persistSeriesData({
      request: {
        action: "MATCH_COMPLETED",
        guild: "guild-1",
        channel: "channel-1",
        queue: "ranked",
        match_number: 42,
        winning_team_index: 0,
        teams: [],
      },
      neatQueueConfig: aFakeNeatQueueConfigRow(),
      series: [match],
      locale: "en-US",
    });

    const [payload] = Preconditions.checkExists(upsertSpy.mock.calls[0]);
    const player = Preconditions.checkExists(payload.gamePlayers.find((row) => row.XboxXuid === "0100000000000000"));
    const objectiveStats = JSON.parse(player.ObjectiveStatsJson) as Record<string, unknown>;
    expect(objectiveStats).not.toHaveProperty("CoreStats");
    expect(objectiveStats).toHaveProperty("CaptureTheFlagStats");
  });

  it("clamps DamageRatio to a finite value for a flawless game with zero damage taken", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const match = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));
    const player = Preconditions.checkExists(match.Players[0]);
    const teamStats = Preconditions.checkExists(player.PlayerTeamStats[0]);
    teamStats.Stats.CoreStats = {
      ...teamStats.Stats.CoreStats,
      DamageDealt: 5000,
      DamageTaken: 0,
    };
    const upsertSpy = vi.spyOn(databaseService, "upsertLeaderboardSeriesDataBatch");

    await service.persistSeriesData({
      request: {
        action: "MATCH_COMPLETED",
        guild: "guild-1",
        channel: "channel-1",
        queue: "ranked",
        match_number: 42,
        winning_team_index: teamStats.TeamId,
        teams: [],
      },
      neatQueueConfig: aFakeNeatQueueConfigRow(),
      series: [match],
      locale: "en-US",
    });

    const [payload] = Preconditions.checkExists(upsertSpy.mock.calls[0]);
    const gamePlayer = Preconditions.checkExists(payload.gamePlayers[0]);
    expect(gamePlayer.DamageRatio).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isFinite(gamePlayer.DamageRatio)).toBe(true);
  });

  it("falls back to medal score totals when medal metadata is unavailable", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    const match = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));
    const player = Preconditions.checkExists(match.Players[0]);
    const teamStats = Preconditions.checkExists(player.PlayerTeamStats[0]);
    teamStats.Stats.CoreStats = {
      ...teamStats.Stats.CoreStats,
      Medals: [{ NameId: 9_999_999, Count: 2, TotalPersonalScoreAwarded: 77 }],
    };
    const upsertSpy = vi.spyOn(databaseService, "upsertLeaderboardSeriesDataBatch");

    await service.persistSeriesData({
      request: {
        action: "MATCH_COMPLETED",
        guild: "guild-1",
        channel: "channel-1",
        queue: "ranked",
        match_number: 42,
        winning_team_index: teamStats.TeamId,
        teams: [],
      },
      neatQueueConfig: aFakeNeatQueueConfigRow(),
      series: [match],
      locale: "en-US",
    });

    const [payload] = Preconditions.checkExists(upsertSpy.mock.calls[0]);
    const gamePlayer = Preconditions.checkExists(payload.gamePlayers[0]);
    expect(gamePlayer.MedalCount).toBe(2);
    expect(gamePlayer.MedalPoints).toBe(77);
    expect(gamePlayer.MythicMedalCount).toBe(0);
  });

  it("logs refresh failures separately from persistence failures", async () => {
    const databaseService = aFakeDatabaseServiceWith();
    const haloService = aFakeHaloServiceWith({ databaseService });
    const logService = aFakeLogServiceWith();
    const service = new LeaderboardService({ databaseService, haloService, logService });
    vi.spyOn(service, "refreshPostsForCompletedQueue").mockRejectedValue(new Error("Unexpected refresh failure"));
    const warnSpy = vi.spyOn(logService, "warn");
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
      neatQueueConfig: aFakeNeatQueueConfigRow({ GuildId: "guild-1", ChannelId: "queue-1" }),
      series: [Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"))],
      locale: "en-US",
    });

    expect(infoSpy).toHaveBeenCalledWith("Completed leaderboard persistence for series", expect.any(Map));
    expect(warnSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
    const [warnMessage, warnContext] = Preconditions.checkExists(warnSpy.mock.calls[0]);
    expect(warnMessage).toBeInstanceOf(Error);
    expect(Preconditions.checkExists(warnContext).get("reason")).toBe(
      "Failed to refresh leaderboard posts after series persistence",
    );
  });
});
