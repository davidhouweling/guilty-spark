import { z } from "zod";
import { parsePathParams, parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { condensedMatchHistoryPageContract } from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import { prepareMatchHistoryPage } from "../../services/halo/prepare-match-history";
import { resolveHaloProxyClient } from "../halo-proxy/halo-proxy";
import type { RoutesRegisterHandler } from "../base/types";

const integer = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .transform(Number)
  .pipe(z.number().int());
const querySchema = z.object({
  start: integer.default(0),
  count: integer.pipe(z.number().min(1).max(25)).default(25),
  category: z.enum(["all", "custom"]).default("all"),
});
const paramsSchema = z.object({ xuid: z.string().regex(/^\d{1,20}$/) });

export const trackerMatchHistoryRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/individual-tracker/search/:xuid/matches", async (request, env: Env) => {
    const services = installServices({ env });
    try {
      const params = parsePathParams(request.params, paramsSchema, "Invalid xuid");
      if (!params.success) {
        return params.response;
      }
      const url = new URL(request.url);
      if (["start", "count", "category", "gamertag"].some((key) => url.searchParams.getAll(key).length > 1)) {
        return errorContract.toResponse({ error: "Invalid history query" }, { status: 400, noStore: true });
      }
      const query = parseQueryParams(url, querySchema, "Invalid history query");
      if (!query.success) {
        return query.response;
      }
      const resolved = await resolveHaloProxyClient(request, services);
      if (!resolved.ok) {
        return resolved.response;
      }
      const page = await prepareMatchHistoryPage(
        resolved.resolved.client,
        services.haloService,
        services.logService,
        params.data.xuid,
        query.data,
      );
      return condensedMatchHistoryPageContract.toResponse(page, { noStore: true });
    } catch (error) {
      services.logService.error(error, new Map([["context", "Individual tracker match history error"]]));
      return errorContract.toResponse({ error: "Failed to fetch match history" }, { status: 500, noStore: true });
    }
  });
};
