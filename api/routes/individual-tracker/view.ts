import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { trackerParamsSchema } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { trackerViewContract } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { RoutesRegisterHandler } from "../base/types";
import { fetchTrackerDoViewState, toTrackerView } from "./mapper";

export const trackerViewRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/individual-tracker/:trackerId/view", async (request, env: Env) => {
    const services = installServices({ env });
    const { databaseService, individualTrackerService, logService } = services;

    try {
      const parsedParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { trackerId } = parsedParams.data;

      const row = await databaseService.getIndividualTracker(trackerId);
      if (row == null) {
        return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
      }

      const settingsPromise = individualTrackerService.getSettingsForView(row.UserId);
      const [streamerSettings, doState] = await Promise.all([
        settingsPromise,
        settingsPromise.then((s) => fetchTrackerDoViewState(env, row.UserId, trackerId, s.visibleSections?.topBarStatSlots)),
      ]);

      return trackerViewContract.toResponse({ view: toTrackerView(row, doState, streamerSettings) }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker view error"]]));
      return errorContract.toResponse({ error: "Failed to fetch tracker view" }, { status: 500, noStore: true });
    }
  });

  router.get("/api/individual-tracker/:trackerId/ws", async (request, env: Env) => {
    const services = installServices({ env });
    const { databaseService, logService } = services;

    try {
      const parsedParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { trackerId } = parsedParams.data;

      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const row = await databaseService.getIndividualTracker(trackerId);
      if (row == null) {
        return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
      }

      const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${row.UserId}:${trackerId}`);
      const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

      const forwardedUrl = new URL(request.url);
      forwardedUrl.pathname = "/websocket";

      return await stub.fetch(new Request(forwardedUrl.toString(), { headers: request.headers }));
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker WebSocket error"]]));
      return new Response("Internal Server Error", { status: 500 });
    }
  });
};
