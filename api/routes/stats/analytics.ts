import { parsePathParams, parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import {
  matchAnalyticsContract,
  matchAnalyticsParamsSchema,
  matchAnalyticsQuerySchema,
} from "@guilty-spark/shared/contracts/stats/match-analytics";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { RoutesRegisterHandler } from "../base/types";
import { createAnalyticsService } from "../../services/analytics/analytics-service";

const ANALYTICS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
const ANALYTICS_CACHE_CONTROL = `public, max-age=${ANALYTICS_CACHE_TTL_SECONDS.toString()}, immutable`;

export const matchAnalyticsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/match-analytics/:matchId", async (request, env: Env) => {
    const services = installServices({ env });
    const analyticsService = createAnalyticsService(env, services.haloService, services.logService);

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
    const modulesRaw = queryParams.data.modules;
    const modules = Array.from(
      new Set(
        modulesRaw
          .split(",")
          .map((m: string) => m.trim())
          .filter((m: string) => m.length > 0),
      ),
    );

    const supportedModules = new Set(["killMatrix"]);
    if (modules.length === 0 || modules.some((m) => !supportedModules.has(m))) {
      return errorContract.toResponse({ error: "Invalid modules parameter" }, { status: 400, noStore: true });
    }

    try {
      const analytics = await analyticsService.getMatchAnalytics(matchId, modules);
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
