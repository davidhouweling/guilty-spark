import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  discordSeriesStatsContract,
  discordSeriesStatsParamsSchema,
} from "@guilty-spark/shared/contracts/stats/discord-series";
import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import { prepareMatchDetails } from "../../services/halo/prepare-match-details";
import { mapSeriesDetail } from "../../services/halo/series-detail";
import type { RoutesRegisterHandler } from "../base/types";

export const statsDiscordSeriesDetailRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/discord/:guildId/:queueNumber/detail", async (request, env: Env) => {
    const { discordService, haloService, logService } = installServices({ env });
    const params = parsePathParams(request.params, discordSeriesStatsParamsSchema, "Invalid guildId or queueNumber");
    if (!params.success) {
      return params.response;
    }
    const { guildId, queueNumber } = params.data;

    try {
      const lookup = await discordService.getSeriesStatsDetailLookup(guildId, queueNumber);
      if (lookup.status !== "lookup-resolved") {
        return discordSeriesStatsContract.toResponse(lookup, {
          status: lookup.status === "pending-index" ? 503 : lookup.status === "forbidden" ? 403 : 404,
          noStore: true,
          headers:
            lookup.status === "pending-index" ? { "Retry-After": Math.ceil(lookup.retryAfterSeconds).toString() } : {},
        });
      }
      const { batch, rawMatches, rosterOptions } = await prepareMatchDetails(haloService, lookup.matchIds, logService);
      const detail = mapSeriesDetail(
        `${guildId}:${queueNumber.toString()}`,
        batch.matchIds,
        batch.results,
        rawMatches,
        {
          ...rosterOptions,
          isManualSeries: lookup.isManualSeries === true,
        },
      );
      return seriesDetailContract.toResponse(detail, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve discord series detail route"]]));
      return errorContract.toResponse(
        { error: "Failed to resolve discord series detail" },
        { status: 500, noStore: true },
      );
    }
  });
};
