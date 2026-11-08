import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { matchDetailContract, matchDetailQuerySchema } from "@guilty-spark/shared/contracts/stats/detail";
import { prepareMatchDetails } from "../../services/halo/prepare-match-details";
import type { RoutesRegisterHandler } from "../base/types";
import { normalizeTrackerId } from "./normalize-tracker-id";
import { resolveTrackerHaloService } from "./resolve-tracker-halo-service";

export const matchDetailsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/match-details", async (request, env: Env) => {
    const services = installServices({ env });
    const { logService } = services;
    try {
      const url = new URL(request.url);
      const queryParams = parseQueryParams(url, matchDetailQuerySchema, "Invalid query parameters");
      if (!queryParams.success) {
        return queryParams.response;
      }

      const haloService = await resolveTrackerHaloService(
        services,
        normalizeTrackerId(url.searchParams.get("trackerId")),
        "Failed to resolve user credentials for match details tracker",
      );
      const { batch } = await prepareMatchDetails(haloService, queryParams.data.matchIds, logService);
      return matchDetailContract.toResponse(batch, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve match details route"]]));
      return errorContract.toResponse({ error: "Failed to resolve match details" }, { status: 500, noStore: true });
    }
  });
};
