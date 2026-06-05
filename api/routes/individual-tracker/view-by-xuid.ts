import { z } from "zod";
import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { trackerViewContract } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";
import type { RoutesRegisterHandler } from "../base/types";
import { fetchTrackerDoViewState, toTrackerView } from "./mapper";

const xuidParamsSchema = z.object({ xuid: z.string().min(1) });

function pickTrackerRow(rows: readonly IndividualTrackersRow[]): IndividualTrackersRow | null {
  return rows.find((r) => r.IsLive === 1) ?? rows[0] ?? null;
}

export const trackerViewByXuidRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/individual-tracker/xuid/:xuid/view", async (request, env: Env) => {
    const services = installServices({ env });
    const { databaseService, individualTrackerService, logService } = services;

    try {
      const parsedParams = parsePathParams(request.params, xuidParamsSchema, "Invalid xuid");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { xuid } = parsedParams.data;

      const rows = await databaseService.findIndividualTrackersByXuids([xuid]);
      const row = pickTrackerRow(rows);
      if (row == null) {
        return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
      }

      const [doState, streamerSettings] = await Promise.all([
        fetchTrackerDoViewState(env, row.UserId, row.TrackerId),
        individualTrackerService.getSettingsForView(row.UserId),
      ]);

      return trackerViewContract.toResponse({ view: toTrackerView(row, doState, streamerSettings) }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker view by xuid error"]]));
      return errorContract.toResponse({ error: "Failed to fetch tracker view" }, { status: 500, noStore: true });
    }
  });

  router.get("/api/individual-tracker/xuid/:xuid/ws", async (request, env: Env) => {
    const services = installServices({ env });
    const { databaseService, logService } = services;

    try {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const parsedParams = parsePathParams(request.params, xuidParamsSchema, "Invalid xuid");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { xuid } = parsedParams.data;

      const rows = await databaseService.findIndividualTrackersByXuids([xuid]);
      const row = pickTrackerRow(rows);
      if (row == null) {
        return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
      }

      const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${row.UserId}:${row.TrackerId}`);
      const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

      const forwardedUrl = new URL(request.url);
      forwardedUrl.pathname = "/websocket";

      return await stub.fetch(new Request(forwardedUrl.toString(), { headers: request.headers }));
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker WebSocket by xuid error"]]));
      return new Response("Internal Server Error", { status: 500 });
    }
  });
};
