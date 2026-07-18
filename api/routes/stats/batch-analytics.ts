import { StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import {
  batchMatchAnalyticsContract,
  batchMatchAnalyticsQuerySchema,
} from "@guilty-spark/shared/contracts/stats/batch-match-analytics";
import { AnalyticsService } from "../../services/analytics/analytics";
import { HaloFilmService } from "../../services/halo/halo-film";
import { createResilientFetch } from "../../services/halo/resilient-fetch";
import type { RoutesRegisterHandler } from "../base/types";
import { normalizeTrackerId } from "./normalize-tracker-id";

export const batchMatchAnalyticsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/match-analytics", async (request, env: Env) => {
    const services = installServices({ env });
    const { haloService, logService, databaseService, userTokenProvider, authService, xboxService } = services;

    const url = new URL(request.url);
    const queryParams = parseQueryParams(url, batchMatchAnalyticsQuerySchema, "Invalid query parameters");
    if (!queryParams.success) {
      return queryParams.response;
    }

    const { matchIds: rawMatchIds, modules } = queryParams.data;
    const matchIds = [...new Set(rawMatchIds)];
    const trackerId = normalizeTrackerId(url.searchParams.get("trackerId"));

    let resolvedAnalyticsService = services.analyticsService;
    let credentialSource = "bot";
    if (trackerId != null) {
      try {
        const tracker = await databaseService.getIndividualTracker(trackerId);
        if (tracker?.IsLive === 1) {
          const userClient = await userTokenProvider.getClientForUser(tracker.UserId);
          if (userClient != null) {
            const userHaloService = haloService.withUserClient(userClient);
            const accessToken = await authService.getMicrosoftAccessTokenForUser(tracker.UserId);
            if (accessToken != null) {
              const xstsTokenInfo = await xboxService.exchangeMicrosoftAccessTokenForXstsToken(accessToken);
              const userSpartanTokenProvider = new StaticXstsTicketTokenSpartanTokenProvider(
                xstsTokenInfo.XSTSToken,
              );
              const userFilmCacheNamespace = `halo:film:${tracker.UserId}`;
              const userFilmService = new HaloFilmService({
                env,
                spartanTokenProvider: userSpartanTokenProvider,
                kvKeyNamespace: userFilmCacheNamespace,
                fetch: createResilientFetch({
                  env,
                  logService,
                  proxyUrl: env.PROXY_WORKER_URL,
                  kvKeyNamespace: userFilmCacheNamespace,
                }),
              });
              resolvedAnalyticsService = new AnalyticsService({
                haloService: userHaloService,
                haloFilmService: userFilmService,
                logService,
              });
              credentialSource = `user:${tracker.UserId}`;
            }
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
        new Map([
          ["route", "stats:match-analytics-batch"],
          ["credentialSource", credentialSource],
        ]),
      );
    }

    return batchMatchAnalyticsContract.toResponse({ results }, { noStore: true });
  });
};
