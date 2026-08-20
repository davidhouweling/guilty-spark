import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import {
  searchEsraContract,
  searchEsraParamsSchema,
} from "@guilty-spark/shared/contracts/individual-tracker/search-esra";
import { requireSession } from "../base/require-session";
import type { RoutesRegisterHandler } from "../base/types";

export const trackerSearchRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/individual-tracker/search/:gamertag/esra", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, haloService, logService } = services;

    try {
      const sessionResult = await requireSession(request, authService);
      if (!sessionResult.ok) {
        return sessionResult.response;
      }

      const parsedParams = parsePathParams(request.params, searchEsraParamsSchema, "Invalid gamertag");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { gamertag } = parsedParams.data;

      const { xuid } = await haloService.getUserByGamertag(gamertag);
      const esraData = await haloService.getPlayerEsra(xuid);

      return searchEsraContract.toResponse(
        { esra: { esra: esraData.esra, lastRankedGamePlayed: esraData.lastRankedGamePlayed } },
        { noStore: true },
      );
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker search ESRA error"]]));
      return searchEsraContract.toResponse({ esra: { esra: null, lastRankedGamePlayed: null } }, { noStore: true });
    }
  });
};
