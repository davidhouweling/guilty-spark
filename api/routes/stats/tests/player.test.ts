import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerStatsContract } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerStatsResponse } from "@guilty-spark/shared/contracts/stats/player";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeLeaderboardPlayerStatsRow } from "../../../services/database/fakes/database.fake";
import { statsRoutesRegisterHandler } from "../stats";

const env = aFakeEnvWith();
let router: AutoRouterType;

beforeEach(() => {
  router = createApiRouter();
});

describe("/api/stats/player/:gamertag", () => {
  it("returns the resolved player and selected server discovery data", async () => {
    const services = installFakeServicesWith({ env });
    const playerStats: PlayerStatsResponse = {
      player: { xboxXuid: "xuid-1", gamertag: "Master Chief" },
      servers: [
        {
          guildId: "guild-1",
          guildName: "Test Server",
          gamesPlayed: 12,
          queueOptions: [{ channelId: "queue-1", label: "#arena" }],
        },
      ],
      selectedGuildId: "guild-1",
      selectedGuildName: "Test Server",
      queueOptions: [{ channelId: "queue-1", label: "#arena" }],
      window: LeaderboardWindow.OneMonth,
      resetAt: null,
      stats: aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-1", Gamertag: "Master Chief" }),
      ranks: {},
      relationships: {},
      minGamesPlayed: 5,
      totalPlayers: null,
    };
    const discoverySpy = vi
      .spyOn(services.leaderboardService, "getLeaderboardPlayerStatsForGamertag")
      .mockResolvedValue(playerStats);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/player/Master%20Chief"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(playerStats);
    expect(discoverySpy).toHaveBeenCalledWith("Master Chief", undefined, undefined, undefined);
  });

  it("includes all available leaderboard ranks and relationships in a single response payload", async () => {
    const services = installFakeServicesWith({ env });
    const playerStats: PlayerStatsResponse = {
      player: { xboxXuid: "xuid-1", gamertag: "Master Chief" },
      servers: [
        {
          guildId: "guild-1",
          guildName: "Test Server",
          gamesPlayed: 12,
          queueOptions: [{ channelId: "queue-1", label: "#arena" }],
        },
      ],
      selectedGuildId: "guild-1",
      selectedGuildName: "Test Server",
      queueOptions: [{ channelId: "queue-1", label: "#arena" }],
      window: LeaderboardWindow.ThreeMonths,
      resetAt: null,
      stats: aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-1", Gamertag: "Master Chief" }),
      ranks: {
        [LeaderboardMetric.Kills]: { rank: 1, total: 10 },
        [LeaderboardMetric.Deaths]: { rank: 2, total: 10 },
      },
      relationships: {
        AvgHeadToHeadKills: [
          {
            XboxXuid: "xuid-2",
            DiscordUserId: null,
            Gamertag: "Opponent",
            MetricValue: 8.5,
            SharedCount: 4,
            Wins: 3,
            Perfects: 2,
          },
        ],
      },
      minGamesPlayed: 5,
      totalPlayers: 10,
    };
    vi.spyOn(services.leaderboardService, "getLeaderboardPlayerStatsForGamertag").mockResolvedValue(playerStats);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/player/Master%20Chief"),
      env,
    )) as Response;

    expect(response.status).toBe(200);
    const payload = await playerStatsContract.fromResponse(response);
    expect(payload.ranks[LeaderboardMetric.Kills]).toEqual({ rank: 1, total: 10 });
    expect(payload.relationships["AvgHeadToHeadKills"]).toHaveLength(1);
    expect(payload.relationships["AvgHeadToHeadKills"]?.[0]?.Gamertag).toBe("Opponent");
  });

  it.each([
    ["no data", null],
    ["an invalid requested server", null],
  ])("returns 404 when discovery returns %s", async (_reason, discovery) => {
    const services = installFakeServicesWith({ env });
    vi.spyOn(services.leaderboardService, "getLeaderboardPlayerStatsForGamertag").mockResolvedValue(discovery);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = (await router.fetch(
      new Request("http://localhost/api/stats/player/Master%20Chief?guildId=guild-unknown"),
      env,
    )) as Response;

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Player leaderboard data not found" });
  });
});
