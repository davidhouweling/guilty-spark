import { parsePathParams, parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import {
  playerStatsContract,
  playerStatsParamsSchema,
  playerStatsQuerySchema,
} from "@guilty-spark/shared/contracts/stats/player";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { RoutesRegisterHandler } from "../base/types";

export const statsPlayerRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/player/:gamertag", async (request, env: Env) => {
    const services = installServices({ env });
    const { logService } = services;
    const parsedParams = parsePathParams(request.params, playerStatsParamsSchema, "Invalid gamertag");
    if (!parsedParams.success) {
      return parsedParams.response;
    }

    const parsedQuery = parseQueryParams(
      new URL(request.url),
      playerStatsQuerySchema,
      "Invalid player stats query parameters",
    );
    if (!parsedQuery.success) {
      return parsedQuery.response;
    }

    try {
      const playerStats = await services.leaderboardService.getLeaderboardPlayerStatsForGamertag(
        parsedParams.data.gamertag,
        parsedQuery.data.guildId,
        parsedQuery.data.queueChannelId,
        parsedQuery.data.window,
      );
      if (playerStats == null) {
        return errorContract.toResponse({ error: "Player leaderboard data not found" }, { status: 404, noStore: true });
      }

      return playerStatsContract.toResponse(playerStats, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve player stats discovery route"]]));
      return errorContract.toResponse({ error: "Failed to resolve player stats" }, { status: 500, noStore: true });
    }
  });
};
