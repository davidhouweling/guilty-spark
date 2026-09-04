import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEADERBOARD_MAX_PAGE_SIZE, leaderboardContract } from "@guilty-spark/shared/contracts/leaderboard/leaderboard";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { guild } from "../../../services/discord/fakes/data";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { leaderboardRoutesRegisterHandler } from "../leaderboard";

describe("/api/leaderboard", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 400 when required guildId is missing", async () => {
    const services = installFakeServicesWith({ env });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    leaderboardRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(new Request("http://localhost/api/leaderboard"), env)) as Response;

    expect(response.status).toBe(400);
  });

  it("returns leaderboard queue channel IDs", async () => {
    const services = installFakeServicesWith({ env });
    vi.spyOn(services.databaseService, "getLeaderboardQueueChannelIds").mockResolvedValue(["queue-a", "queue-b"]);
    vi.spyOn(services.discordService, "getGuildChannels").mockResolvedValue([
      { id: "queue-a", name: "alpha-queue", type: 0, position: 0 },
      { id: "queue-b", name: "beta-queue", type: 0, position: 1 },
    ]);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    leaderboardRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/leaderboard/queues?guildId=guild-1"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      guildId: "guild-1",
      guildName: "Guild guild-1",
      queueChannelIds: ["queue-a", "queue-b"],
      queueOptions: [
        { channelId: "queue-a", label: "#alpha-queue" },
        { channelId: "queue-b", label: "#beta-queue" },
      ],
    });
  });

  it("returns the Discord guild name when it can be resolved", async () => {
    const services = installFakeServicesWith({ env });
    vi.spyOn(services.databaseService, "getLeaderboardQueueChannelIds").mockResolvedValue([]);
    const getGuildChannelsSpy = vi.spyOn(services.discordService, "getGuildChannels");
    vi.spyOn(services.discordService, "getGuild").mockResolvedValue({
      ...guild,
      id: "guild-1",
      name: "  Test Server  ",
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    leaderboardRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/leaderboard/queues?guildId=guild-1"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ guildId: "guild-1", guildName: "Test Server", queueOptions: [] });
    expect(getGuildChannelsSpy).not.toHaveBeenCalled();
  });

  it("falls back to queue IDs when Discord channel names cannot be resolved", async () => {
    const services = installFakeServicesWith({ env });
    vi.spyOn(services.databaseService, "getLeaderboardQueueChannelIds").mockResolvedValue(["queue-a"]);
    vi.spyOn(services.discordService, "getGuildChannels").mockRejectedValue(new Error("Missing Access"));
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    leaderboardRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/leaderboard/queues?guildId=guild-1"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      guildId: "guild-1",
      guildName: "Guild guild-1",
      queueChannelIds: ["queue-a"],
      queueOptions: [{ channelId: "queue-a", label: "Queue queue-a" }],
    });
  });

  it("returns 400 when leaderboard queue guildId is missing", async () => {
    const services = installFakeServicesWith({ env });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    leaderboardRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(new Request("http://localhost/api/leaderboard/queues"), env)) as Response;

    expect(response.status).toBe(400);
  });

  it("returns 400 when numeric query params contain non-digit characters", async () => {
    const services = installFakeServicesWith({ env });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    leaderboardRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/leaderboard?guildId=guild-1&page=10abc"),
      env,
    )) as Response;

    expect(response.status).toBe(400);
  });

  it("returns 400 when pageSize exceeds the maximum", async () => {
    const services = installFakeServicesWith({ env });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    leaderboardRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(
        `http://localhost/api/leaderboard?guildId=guild-1&pageSize=${(LEADERBOARD_MAX_PAGE_SIZE + 1).toString()}`,
      ),
      env,
    )) as Response;

    expect(response.status).toBe(400);
  });

  it("returns leaderboard payload and parses query options", async () => {
    const services = installFakeServicesWith({ env });
    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-1",
      queueChannelId: "queue-a",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 3,
      page: 2,
      pageSize: 10,
      total: 1,
      hasLeaderboardData: true,
      rows: [
        {
          rank: 11,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 4,
          seriesWins: 3,
          gamesPlayed: 9,
          gameWins: 6,
          medalCount: 12,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
          metricValue: 44,
        },
      ],
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    leaderboardRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(
        "http://localhost/api/leaderboard?guildId=guild-1&queueChannelId=queue-a&window=1M&metric=KILLS&page=2&pageSize=10&minGamesPlayed=3",
      ),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    const body = await leaderboardContract.fromResponse(response);
    expect(body).toEqual({
      guildId: "guild-1",
      queueChannelId: "queue-a",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 3,
      page: 2,
      pageSize: 10,
      total: 1,
      hasLeaderboardData: true,
      rows: [
        {
          rank: 11,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 4,
          seriesWins: 3,
          gamesPlayed: 9,
          gameWins: 6,
          medalCount: 12,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
          metricValue: 44,
        },
      ],
    });

    expect(getLeaderboardSpy).toHaveBeenCalledWith({
      guildId: "guild-1",
      queueChannelId: "queue-a",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      page: 2,
      pageSize: 10,
      minGamesPlayed: 3,
      autoCreateConfig: false,
    });
  });

  it("returns 404 when the requested guild or queue has no leaderboard data", async () => {
    const services = installFakeServicesWith({ env });
    vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-1",
      queueChannelId: null,
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.SeriesWinRate,
      minGamesPlayed: 5,
      page: 1,
      pageSize: 25,
      total: 0,
      hasLeaderboardData: false,
      rows: [],
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    leaderboardRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/leaderboard?guildId=guild-1"),
      env,
    )) as Response;

    expect(response.status).toBe(404);
  });
});
