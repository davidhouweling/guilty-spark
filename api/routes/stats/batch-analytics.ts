import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import {
  batchMatchAnalyticsContract,
  batchMatchAnalyticsQuerySchema,
} from "@guilty-spark/shared/contracts/stats/batch-match-analytics";
import { AnalyticsService } from "../../services/analytics/analytics";
import type { RoutesRegisterHandler } from "../base/types";
import { normalizeTrackerId } from "./normalize-tracker-id";

export const batchMatchAnalyticsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/match-analytics", async (request, env: Env) => {
    const services = installServices({ env });
    const { haloService, haloFilmService, logService, databaseService, userTokenProvider } = services;

    const url = new URL(request.url);
    const queryParams = parseQueryParams(url, batchMatchAnalyticsQuerySchema, "Invalid query parameters");
    if (!queryParams.success) {
      return queryParams.response;
    }

    const { matchIds: rawMatchIds, modules } = queryParams.data;
    const matchIds = [...new Set(rawMatchIds)];
    const trackerId = normalizeTrackerId(url.searchParams.get("trackerId"));

    let resolvedAnalyticsService = services.analyticsService;
    if (trackerId != null) {
      try {
        const tracker = await databaseService.getIndividualTracker(trackerId);
        if (tracker?.IsLive === 1) {
          const userClient = await userTokenProvider.getClientForUser(tracker.UserId);
          if (userClient != null) {
            const userHaloService = haloService.withUserClient(userClient);
            resolvedAnalyticsService = new AnalyticsService({
              haloService: userHaloService,
              haloFilmService,
              logService,
            });
          }
        }
      } catch (error) {
        logService.error(
          error,
          new Map([
            ["context", "Failed to resolve user credentials for batch analytics tracker"],
            ["trackerId", trackerId],
          ]),
        );
      }
    }

    const results = await resolvedAnalyticsService.getBatchMatchAnalytics(matchIds, modules);

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
