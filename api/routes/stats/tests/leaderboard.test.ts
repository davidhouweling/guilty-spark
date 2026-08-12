import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leaderboardContract } from "@guilty-spark/shared/contracts/stats/leaderboard";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { statsRoutesRegisterHandler } from "../stats";

describe("/api/stats/leaderboard", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 400 when required guildId is missing", async () => {
    const services = installFakeServicesWith({ env });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(new Request("http://localhost/api/stats/leaderboard"), env)) as Response;

    expect(response.status).toBe(400);
  });

  it("returns 400 when numeric query params contain non-digit characters", async () => {
    const services = installFakeServicesWith({ env });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/leaderboard?guildId=guild-1&page=10abc"),
      env,
    )) as Response;

    expect(response.status).toBe(400);
  });

  it("returns 400 when pageSize exceeds the maximum", async () => {
    const services = installFakeServicesWith({ env });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/leaderboard?guildId=guild-1&pageSize=101"),
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
      rows: [
        {
          rank: 11,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 4,
          seriesWins: 3,
          gamesPlayed: 9,
          metricValue: 44,
        },
      ],
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request(
        "http://localhost/api/stats/leaderboard?guildId=guild-1&queueChannelId=queue-a&window=1M&metric=KILLS&page=2&pageSize=10&minGamesPlayed=3",
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
      rows: [
        {
          rank: 11,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 4,
          seriesWins: 3,
          gamesPlayed: 9,
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
    });
  });
});
