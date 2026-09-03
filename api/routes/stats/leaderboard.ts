import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { leaderboardContract, leaderboardQuerySchema } from "@guilty-spark/shared/contracts/stats/leaderboard";
import type { RoutesRegisterHandler } from "../base/types";

export const leaderboardRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/leaderboard", async (request, env: Env) => {
    const services = installServices({ env });
    const { leaderboardService, logService } = services;

    try {
      const url = new URL(request.url);
      const queryParams = parseQueryParams(url, leaderboardQuerySchema, "Invalid query parameters");
      if (!queryParams.success) {
        return queryParams.response;
      }

      const { guildId, queueChannelId, window, metric, page, pageSize, minGamesPlayed } = queryParams.data;
      const response = await leaderboardService.getLeaderboard({
        guildId,
        ...(queueChannelId != null ? { queueChannelId } : {}),
        ...(window != null ? { window } : {}),
        ...(metric != null ? { metric } : {}),
        ...(page != null ? { page } : {}),
        ...(pageSize != null ? { pageSize } : {}),
        ...(minGamesPlayed != null ? { minGamesPlayed } : {}),
        autoCreateConfig: false,
      });
      if (!response.hasLeaderboardData) {
        return errorContract.toResponse({ error: "Leaderboard not found" }, { status: 404, noStore: true });
      }

      return leaderboardContract.toResponse(response, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve leaderboard route"]]));
      return errorContract.toResponse({ error: "Failed to resolve leaderboard" }, { status: 500, noStore: true });
    }
  });
};
