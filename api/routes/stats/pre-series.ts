import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { discordSeriesStatsParamsSchema } from "@guilty-spark/shared/contracts/stats/discord-series";
import { livePreSeriesContract } from "@guilty-spark/shared/contracts/stats/pre-series";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { RoutesRegisterHandler } from "../base/types";

export const statsPreSeriesRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/stats/discord/:guildId/:queueNumber/pre-series", async (request, env: Env) => {
    const parsed = parsePathParams(request.params, discordSeriesStatsParamsSchema, "Invalid guildId or queueNumber");
    if (!parsed.success) {
      parsed.response.headers.set("Cache-Control", "no-store");
      return parsed.response;
    }
    const { guildId, queueNumber } = parsed.data;
    const { logService } = installServices({ env });
    try {
      const id = env.LIVE_TRACKER_DO.idFromName(`${guildId}:${queueNumber.toString()}`);
      const response = await env.LIVE_TRACKER_DO.get(id).fetch(new Request("https://live-tracker/pre-series"));
      const data = await livePreSeriesContract.fromResponse(response);
      const status = data.status === "resolved" ? 200 : 404;
      if (response.status !== status) {
        throw new Error("Unexpected live pre-series response status");
      }
      return livePreSeriesContract.toResponse(data, { status, noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to load captured live pre-series data"]]));
      return errorContract.toResponse(
        { error: "Failed to load captured pre-series data" },
        { status: 500, noStore: true },
      );
    }
  });
};
