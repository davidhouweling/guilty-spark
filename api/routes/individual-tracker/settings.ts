import { parseJsonBody, parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { settingsBodySchema, settingsContract } from "@guilty-spark/shared/contracts/individual-tracker/settings";
import { trackerParamsSchema } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { parseStreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { RoutesRegisterHandler } from "../base/types";
import { requireSession } from "../base/require-session";

export const trackerSettingsRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/individual-tracker/:trackerId/settings", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, databaseService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsedParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { trackerId } = parsedParams.data;

      const row = await databaseService.getIndividualTracker(trackerId);
      if (row?.UserId !== auth.session.userId) {
        return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
      }

      const settings = parseStreamerViewSettings(row.StreamerViewSettingsJson);

      return settingsContract.toResponse({ settings }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker get settings error"]]));
      return errorContract.toResponse({ error: "Failed to fetch tracker settings" }, { status: 500, noStore: true });
    }
  });

  router.patch("/api/individual-tracker/:trackerId/settings", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, databaseService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsedParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { trackerId } = parsedParams.data;

      const row = await databaseService.getIndividualTracker(trackerId);
      if (row?.UserId !== auth.session.userId) {
        return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
      }

      const parsed = await parseJsonBody(request, settingsBodySchema, "Invalid settings payload");
      if (!parsed.success) {
        return parsed.response;
      }

      await databaseService.updateIndividualTrackerSettings(trackerId, JSON.stringify(parsed.data.settings));

      return settingsContract.toResponse({ settings: parsed.data.settings }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker update settings error"]]));
      return errorContract.toResponse({ error: "Failed to update tracker settings" }, { status: 500, noStore: true });
    }
  });
};
