import { errorContract } from "@guilty-spark/shared/contracts/error";
import { playerCompareContract, playerCompareQuerySchema } from "@guilty-spark/shared/contracts/stats/player";
import type { RoutesRegisterHandler } from "../base/types";

export const statsCompareRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/compare", async (request, env: Env) => {
    const services = installServices({ env });
    const { logService } = services;
    const url = new URL(request.url);
    const parsedQuery = playerCompareQuerySchema.safeParse({
      gamertag: url.searchParams.getAll("gamertag"),
      guildId: url.searchParams.get("guildId") ?? undefined,
      queueChannelId: url.searchParams.get("queueChannelId") ?? undefined,
      window: url.searchParams.get("window") ?? undefined,
      minGamesPlayed: url.searchParams.get("minGamesPlayed") ?? undefined,
    });

    if (!parsedQuery.success) {
      return errorContract.toResponse(
        { error: "Invalid player compare query parameters" },
        { status: 400, noStore: true },
      );
    }

    try {
      const playerCompare = await services.leaderboardService.getLeaderboardPlayerCompareForGamertags(
        parsedQuery.data.gamertag,
        parsedQuery.data.guildId,
        parsedQuery.data.queueChannelId,
        parsedQuery.data.window,
        parsedQuery.data.minGamesPlayed,
      );
      if (playerCompare == null) {
        return errorContract.toResponse({ error: "Player comparison data not found" }, { status: 404, noStore: true });
      }

      return playerCompareContract.toResponse(playerCompare, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve player compare route"]]));
      return errorContract.toResponse({ error: "Failed to resolve player comparison" }, { status: 500, noStore: true });
    }
  });
};
