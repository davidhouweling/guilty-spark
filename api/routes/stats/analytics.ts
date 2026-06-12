import { parsePathParams, parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import {
  matchAnalyticsContract,
  matchAnalyticsParamsSchema,
  matchAnalyticsQuerySchema,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { RoutesRegisterHandler } from "../base/types";

const ANALYTICS_CACHE_TTL_SECONDS = 60 * 60 * 24;
const ANALYTICS_STALE_WHILE_REVALIDATE_SECONDS = 60 * 5;
const ANALYTICS_CACHE_CONTROL = `public, s-maxage=${ANALYTICS_CACHE_TTL_SECONDS.toString()}, stale-while-revalidate=${ANALYTICS_STALE_WHILE_REVALIDATE_SECONDS.toString()}`;

export const matchAnalyticsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/match-analytics/:matchId", async (request, env: Env) => {
    const services = installServices({ env });

    const pathParams = parsePathParams(request.params, matchAnalyticsParamsSchema, "Invalid matchId");
    if (!pathParams.success) {
      return pathParams.response;
    }

    const url = new URL(request.url);
    const queryParams = parseQueryParams(url, matchAnalyticsQuerySchema, "Invalid query parameters");
    if (!queryParams.success) {
      return queryParams.response;
    }

    const { matchId } = pathParams.data;
    const { modules } = queryParams.data;

    try {
      const analytics = await services.analyticsService.getMatchAnalytics(matchId, modules);
      return matchAnalyticsContract.toResponse(
        { analytics },
        {
          headers: { "Cache-Control": ANALYTICS_CACHE_CONTROL },
        },
      );
    } catch (error) {
      services.logService.error(
        error instanceof Error ? error : new Error(String(error)),
        new Map([["route", "stats:match-analytics"]]),
      );
      return errorContract.toResponse({ error: "Failed to fetch analytics" }, { status: 500, noStore: true });
    }
  });
};
