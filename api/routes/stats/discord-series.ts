import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import {
  discordSeriesStatsContract,
  discordSeriesStatsParamsSchema,
  type DiscordSeriesStats,
  type DiscordSeriesStatsForbidden,
  type DiscordSeriesStatsResolved,
} from "@guilty-spark/shared/contracts/stats/discord-series";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { DiscordSeriesLookupResult, DiscordService } from "../../services/discord/discord";
import {
  buildDiscordSeriesRenderDataFromMatches,
  DISCORD_SERIES_STATS_RESOLVED_CACHE_CONTROL_HEADER,
} from "../../services/discord/discord-series-stats";
import type { RoutesRegisterHandler } from "../base/types";
import type { HaloService } from "../../services/halo/halo";
import type { LogService } from "../../services/log/types";

function getResponseOptions(response: DiscordSeriesStats): {
  status: number;
  noStore?: boolean;
  headers?: Record<string, string>;
} {
  switch (response.status) {
    case "resolved": {
      return { status: 200, headers: { "Cache-Control": DISCORD_SERIES_STATS_RESOLVED_CACHE_CONTROL_HEADER } };
    }
    case "pending-index": {
      return {
        status: 503,
        noStore: true,
        headers: { "Retry-After": Math.ceil(response.retryAfterSeconds).toString() },
      };
    }
    case "not-found": {
      return { status: 404 };
    }
    case "forbidden": {
      return { status: 403 };
    }
    default: {
      throw new UnreachableError(response);
    }
  }
}

function toLookupResponse(
  lookupResult: DiscordSeriesStats | DiscordSeriesLookupResult | DiscordSeriesStatsForbidden,
): Response {
  switch (lookupResult.status) {
    case "lookup-resolved": {
      return Response.json(
        {
          status: "resolved",
          guildId: lookupResult.guildId,
          queueNumber: lookupResult.queueNumber,
          matchIds: lookupResult.matchIds,
        },
        { status: 200, headers: { "Cache-Control": DISCORD_SERIES_STATS_RESOLVED_CACHE_CONTROL_HEADER } },
      );
    }
    case "resolved": {
      return Response.json(
        {
          status: "resolved",
          guildId: lookupResult.guildId,
          queueNumber: lookupResult.queueNumber,
          matchIds: lookupResult.matchIds,
        },
        { status: 200, headers: { "Cache-Control": DISCORD_SERIES_STATS_RESOLVED_CACHE_CONTROL_HEADER } },
      );
    }
    case "pending-index": {
      return discordSeriesStatsContract.toResponse(lookupResult, getResponseOptions(lookupResult));
    }
    case "not-found": {
      return discordSeriesStatsContract.toResponse(lookupResult, { status: 404 });
    }
    case "forbidden": {
      return discordSeriesStatsContract.toResponse(lookupResult, { status: 403 });
    }
    default: {
      throw new UnreachableError(lookupResult);
    }
  }
}

async function tryBuildRenderData({
  discordService,
  logService,
  haloService,
  guildId,
  queueNumber,
  matchIds,
}: {
  discordService: DiscordService;
  logService: LogService;
  haloService: HaloService;
  guildId: string;
  queueNumber: number;
  matchIds: string[];
}): Promise<DiscordSeriesStatsResolved["renderData"]> {
  const matches = await haloService.getMatchDetails(matchIds);

  return buildDiscordSeriesRenderDataFromMatches({
    discordService,
    logService,
    haloService,
    guildId,
    queueNumber,
    matches,
  });
}

export const statsDiscordSeriesRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/discord/:guildId/:queueNumber", async (request, env: Env) => {
    const services = installServices({ env });
    const { discordService, logService, haloService } = services;
    const parsedParams = parsePathParams(
      request.params,
      discordSeriesStatsParamsSchema,
      "Invalid guildId or queueNumber",
    );
    if (!parsedParams.success) {
      return parsedParams.response;
    }

    const { guildId, queueNumber } = parsedParams.data;

    try {
      const response = await discordService.getSeriesStats({
        guildId,
        queueNumber,
        resolveRenderData: async (matchIds: string[]) =>
          tryBuildRenderData({
            discordService,
            logService,
            haloService,
            guildId,
            queueNumber,
            matchIds,
          }),
      });

      return discordSeriesStatsContract.toResponse(response, getResponseOptions(response));
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve discord series stats route"]]));
      return errorContract.toResponse(
        { error: "Failed to resolve discord series stats" },
        { status: 500, noStore: true },
      );
    }
  });

  router.get("/api/stats/discord/:guildId/:queueNumber/lookup", async (request, env: Env) => {
    const services = installServices({ env });
    const { discordService, logService } = services;
    const parsedParams = parsePathParams(
      request.params,
      discordSeriesStatsParamsSchema,
      "Invalid guildId or queueNumber",
    );
    if (!parsedParams.success) {
      return parsedParams.response;
    }

    const { guildId, queueNumber } = parsedParams.data;

    try {
      const lookupOrCached = await discordService.getSeriesStatsLookup(guildId, queueNumber);
      return toLookupResponse(lookupOrCached);
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve discord series stats lookup route"]]));
      return errorContract.toResponse(
        { error: "Failed to resolve discord series stats lookup" },
        { status: 500, noStore: true },
      );
    }
  });
};
