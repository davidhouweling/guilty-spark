import { errorContract } from "@guilty-spark/shared/contracts/error";
import { settingsBodySchema, settingsContract } from "@guilty-spark/shared/contracts/individual-tracker/settings";
import { parseJsonBody } from "@guilty-spark/shared/base/request-parsing";
import type { RoutesRegisterHandler } from "../base/types";
import { requireSession } from "../base/require-session";

export const trackerSettingsRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/individual-tracker/settings", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const settings = await individualTrackerService.getSettings(auth.session.userId);

      return settingsContract.toResponse({ settings }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["message", "Individual tracker settings get error"]]));
      return errorContract.toResponse({ error: "Failed to fetch settings" }, { status: 500, noStore: true });
    }
  });

  router.patch("/api/individual-tracker/settings", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsed = await parseJsonBody(request, settingsBodySchema, "Invalid settings payload");
      if (!parsed.success) {
        return parsed.response;
      }

      const settings = await individualTrackerService.updateSettings(auth.session.userId, parsed.data.settings);

      return settingsContract.toResponse({ settings }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["message", "Individual tracker settings update error"]]));
      return errorContract.toResponse({ error: "Failed to update settings" }, { status: 500, noStore: true });
    }
  });
};
