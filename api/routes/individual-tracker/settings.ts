import { errorContract } from "@guilty-spark/shared/contracts/error";
import { settingsBodySchema, settingsContract } from "@guilty-spark/shared/contracts/individual-tracker/settings";
import { parseJsonBody } from "@guilty-spark/shared/base/request-parsing";
import type { RoutesRegisterHandler } from "../base/types";
import { requireSession } from "../base/require-session";
import type { LogService } from "../../services/log/types";

function getUserTrackerSettingsChangedUrl(): string {
  return "http://do/settings-changed";
}

async function notifyUserTrackerSettingsChanged(env: Env, userId: string, logService: LogService): Promise<void> {
  try {
    const doId = env.USER_TRACKER_DO.idFromName(userId);
    const stub = env.USER_TRACKER_DO.get(doId);
    await stub.fetch(new Request(getUserTrackerSettingsChangedUrl(), { method: "POST" }));
  } catch (error) {
    logService.warn(
      error,
      new Map([
        ["context", "User tracker settings changed notification error"],
        ["userId", userId],
      ]),
    );
  }
}

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
      logService.error(error, new Map([["context", "Individual tracker settings get error"]]));
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

      void notifyUserTrackerSettingsChanged(env, auth.session.userId, logService);

      return settingsContract.toResponse({ settings }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker settings update error"]]));
      return errorContract.toResponse({ error: "Failed to update settings" }, { status: 500, noStore: true });
    }
  });
};
