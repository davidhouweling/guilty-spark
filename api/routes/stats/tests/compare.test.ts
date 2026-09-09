import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerCompareContract } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerCompareResponse } from "@guilty-spark/shared/contracts/stats/player";
import { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { createApiRouter } from "../../../base/router";
import type { ApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeLeaderboardPlayerStatsRow } from "../../../services/database/fakes/database.fake";
import { statsRoutesRegisterHandler } from "../stats";

describe("/api/stats/compare", () => {
  let env: Env;
  let router: ApiRouter;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns a player comparison for repeated gamertag query params", async () => {
    const services = installFakeServicesWith({ env });
    const playerCompare: PlayerCompareResponse = {
      players: [
        {
          player: { xboxXuid: "xuid-1", gamertag: "Alpha" },
          stats: aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-1", Gamertag: "Alpha" }),
          ranks: {},
        },
        {
          player: { xboxXuid: "xuid-2", gamertag: "Bravo" },
          stats: aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-2", Gamertag: "Bravo" }),
          ranks: {},
        },
      ],
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
      minGamesPlayed: 5,
      totalPlayers: 10,
      pairSummaries: [],
    };
    const compareSpy = vi
      .spyOn(services.leaderboardService, "getLeaderboardPlayerCompareForGamertags")
      .mockResolvedValue(playerCompare);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = await router.fetch(
      new Request("http://localhost/api/stats/compare?gamertag=Alpha&gamertag=Bravo&window=1M&minGamesPlayed=3"),
      env,
    );

    expect(response.status).toBe(200);
    expect(await playerCompareContract.fromResponse(response)).toEqual(playerCompare);
    expect(compareSpy).toHaveBeenCalledWith(["Alpha", "Bravo"], undefined, undefined, LeaderboardWindow.OneMonth, 3);
  });

  it("accepts a single-player request", async () => {
    const services = installFakeServicesWith({ env });
    const compareSpy = vi
      .spyOn(services.leaderboardService, "getLeaderboardPlayerCompareForGamertags")
      .mockResolvedValue(null);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = await router.fetch(new Request("http://localhost/api/stats/compare?gamertag=Alpha"), env);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Player comparison data not found" });
    expect(compareSpy).toHaveBeenCalledWith(["Alpha"], undefined, undefined, undefined, undefined);
  });

  it("returns 404 when the players do not share comparable leaderboard data", async () => {
    const services = installFakeServicesWith({ env });
    vi.spyOn(services.leaderboardService, "getLeaderboardPlayerCompareForGamertags").mockResolvedValue(null);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => services);
    statsRoutesRegisterHandler(router, localInstallServices);

    const response = await router.fetch(
      new Request("http://localhost/api/stats/compare?gamertag=Alpha&gamertag=Bravo"),
      env,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Player comparison data not found" });
  });
});
