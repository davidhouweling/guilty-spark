import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  searchEsraContract,
  searchEsraParamsSchema,
} from "@guilty-spark/shared/contracts/individual-tracker/search-esra";
import type { SearchEsra } from "@guilty-spark/shared/contracts/individual-tracker/search-esra";
import type { LogService } from "../../services/log/types";
import type { HaloService } from "../../services/halo/halo";
import { requireSession } from "../base/require-session";
import type { RoutesRegisterHandler } from "../base/types";

async function resolveSearchEsra(
  haloService: HaloService,
  logService: LogService,
  gamertag: string,
): Promise<SearchEsra> {
  let xuid: string;
  try {
    ({ xuid } = await haloService.getUserByGamertag(gamertag));
  } catch {
    return { esra: null, lastRankedGamePlayed: null };
  }

  try {
    const esraData = await haloService.getPlayerEsra(xuid);
    return { esra: esraData.esra, lastRankedGamePlayed: esraData.lastRankedGamePlayed };
  } catch (error) {
    logService.warn(
      error,
      new Map([
        ["context", "Individual tracker search ESRA fetch failed"],
        ["xuid", xuid],
      ]),
    );
    return { esra: null, lastRankedGamePlayed: null };
  }
}

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

      const esra = await resolveSearchEsra(haloService, logService, parsedParams.data.gamertag);
      return searchEsraContract.toResponse({ esra }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker search ESRA error"]]));
      return errorContract.toResponse({ error: "Failed to fetch ESRA" }, { status: 500, noStore: true });
    }
  });
};
