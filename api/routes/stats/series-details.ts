import { parsePathParams, parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  matchDetailQuerySchema,
  seriesDetailContract,
  seriesDetailParamsSchema,
} from "@guilty-spark/shared/contracts/stats/detail";
import { prepareMatchDetails } from "../../services/halo/prepare-match-details";
import { mapSeriesDetail } from "../../services/halo/series-detail";
import type { RoutesRegisterHandler } from "../base/types";
import { normalizeTrackerId } from "./normalize-tracker-id";
import { resolveTrackerHaloService } from "./resolve-tracker-halo-service";

export const seriesDetailsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/series-details/:seriesId", async (request, env: Env) => {
    const services = installServices({ env });
    const { logService } = services;
    try {
      const params = parsePathParams(request.params, seriesDetailParamsSchema, "Invalid seriesId");
      if (!params.success) {
        return params.response;
      }
      const url = new URL(request.url);
      const query = parseQueryParams(url, matchDetailQuerySchema, "Invalid query parameters");
      if (!query.success) {
        return query.response;
      }
      const haloService = await resolveTrackerHaloService(
        services,
        normalizeTrackerId(url.searchParams.get("trackerId")),
        "Failed to resolve user credentials for series details tracker",
      );
      const { batch, rawMatches, rosterOptions } = await prepareMatchDetails(
        haloService,
        query.data.matchIds,
        logService,
      );
      const detail = mapSeriesDetail(params.data.seriesId, batch.matchIds, batch.results, rawMatches, rosterOptions);
      return seriesDetailContract.toResponse(detail, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve series details route"]]));
      return errorContract.toResponse({ error: "Failed to resolve series details" }, { status: 500, noStore: true });
    }
  });
};
