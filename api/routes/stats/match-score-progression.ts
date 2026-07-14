import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import {
  matchScoreProgressionContract,
  matchScoreProgressionQuerySchema,
} from "@guilty-spark/shared/contracts/stats/match-score-progression";
import type { RoutesRegisterHandler } from "../base/types";

export const matchScoreProgressionRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/match-score-progression", async (request, env: Env) => {
    const services = installServices({ env });

    const url = new URL(request.url);
    const queryParams = parseQueryParams(url, matchScoreProgressionQuerySchema, "Invalid query parameters");
    if (!queryParams.success) {
      return queryParams.response;
    }

    const progression = await services.matchProgressionService.getMatchScoreProgression(queryParams.data.matchId);

    return matchScoreProgressionContract.toResponse(progression, { noStore: true });
  });
};
