import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import {
  batchMatchAnalyticsContract,
  batchMatchAnalyticsQuerySchema,
} from "@guilty-spark/shared/contracts/stats/batch-match-analytics";
import type { RoutesRegisterHandler } from "../base/types";

export const batchMatchAnalyticsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/batch-match-analytics", async (request, env: Env) => {
    const services = installServices({ env });

    const url = new URL(request.url);
    const queryParams = parseQueryParams(url, batchMatchAnalyticsQuerySchema, "Invalid query parameters");
    if (!queryParams.success) {
      return queryParams.response;
    }

    const { matchIds, modules } = queryParams.data;

    const settled = await Promise.allSettled(
      matchIds.map(async (matchId) => services.analyticsService.getMatchAnalytics(matchId, modules)),
    );

    const results: Record<string, MatchAnalytics | null> = {};
    let failureCount = 0;
    for (const [index, matchId] of matchIds.entries()) {
      const outcome = settled[index];
      if (outcome == null || outcome.status === "rejected") {
        results[matchId] = null;
        failureCount++;
      } else {
        results[matchId] = outcome.value;
      }
    }

    if (failureCount > 0) {
      services.logService.error(
        new Error(`${failureCount.toString()}/${matchIds.length.toString()} match analytics fetches failed`),
        new Map([["route", "stats:batch-match-analytics"]]),
      );
    }

    return batchMatchAnalyticsContract.toResponse({ results }, { noStore: true });
  });
};
