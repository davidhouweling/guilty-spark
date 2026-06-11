import { z } from "zod";
import { parsePathParams, parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { matchAnalyticsContract } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { RoutesRegisterHandler } from "../base/types";
import { createAnalyticsService } from "../../services/analytics/analytics-service";

const ANALYTICS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year (immutable)
const ANALYTICS_CACHE_CONTROL = `public, max-age=${ANALYTICS_CACHE_TTL_SECONDS.toString()}`;

const matchAnalyticsPathSchema = z.object({
  matchId: z.string(),
});

const matchAnalyticsQuerySchema = z.object({
  modules: z.string().optional().default("killMatrix"),
});

export const matchAnalyticsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/stats/match-analytics/:matchId", async (request, env) => {
    const services = installServices({ env });
    const analyticsService = createAnalyticsService(env, services.haloService, services.logService);

    const pathParams = parsePathParams(request.params, matchAnalyticsPathSchema, "Invalid matchId");
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
    const modules = modulesRaw.split(",").filter((m: string) => m.length > 0);

    try {
      const analytics = await analyticsService.getMatchAnalytics(matchId, modules);
      return matchAnalyticsContract.toResponse(
        { analytics },
        {
          headers: { "Cache-Control": ANALYTICS_CACHE_CONTROL },
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error fetching analytics";
      return errorContract.toResponse(
        { error: message },
        { status: 500 }
      );
    }
  });
};
