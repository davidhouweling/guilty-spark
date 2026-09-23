import { errorContract } from "@guilty-spark/shared/contracts/error";
import { activeSeriesListContract } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import type { RoutesRegisterHandler } from "../base/types";
import { requireSession } from "../base/require-session";
import { toActiveSeriesSummary } from "./mapper";

export const neatQueueRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/neatqueue/active-series", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, neatQueueService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const series = await neatQueueService.listActiveSeries();

      return activeSeriesListContract.toResponse({ series: series.map(toActiveSeriesSummary) }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Active NeatQueue series list error"]]));
      return errorContract.toResponse({ error: "Failed to fetch active series" }, { status: 500, noStore: true });
    }
  });
};
