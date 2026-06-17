import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import {
  batchMatchAnalyticsContract,
  batchMatchAnalyticsQuerySchema,
} from "@guilty-spark/shared/contracts/stats/batch-match-analytics";
import type { RoutesRegisterHandler } from "../base/types";

export const batchMatchAnalyticsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/match-analytics", async (request, env: Env) => {
    const services = installServices({ env });

    const url = new URL(request.url);
    const queryParams = parseQueryParams(url, batchMatchAnalyticsQuerySchema, "Invalid query parameters");
    if (!queryParams.success) {
      return queryParams.response;
    }

    const { matchIds, modules } = queryParams.data;

    const results = await services.analyticsService.getBatchMatchAnalytics(matchIds, modules);

    const failureCount = Object.values(results).filter((v) => v === null).length;
    if (failureCount > 0) {
      services.logService.warn(
        `${failureCount.toString()}/${matchIds.length.toString()} match analytics fetches failed`,
        new Map([["route", "stats:match-analytics-batch"]]),
      );
    }

    return batchMatchAnalyticsContract.toResponse({ results }, { noStore: true });
  });
};
