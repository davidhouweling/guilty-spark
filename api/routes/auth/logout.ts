import { errorContract } from "@guilty-spark/shared/contracts/error";
import { logoutContract } from "@guilty-spark/shared/contracts/auth/logout";
import type { RoutesRegisterHandler } from "../base/types";

export const authLogoutRoute: RoutesRegisterHandler = (router, installServices) => {
  router.post("/auth/logout", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, logService } = services;

    try {
      const response = logoutContract.toResponse({ success: true }, { noStore: true });

      try {
        await authService.invalidateSession(request);
      } catch (error: unknown) {
        logService.error(error as Error, new Map([["message", "Failed to invalidate session during logout"]]));
      }

      authService.clearSessionCookie(response);

      return response;
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Auth logout error"]]));
      return errorContract.toResponse({ error: "Logout failed" }, { status: 500, noStore: true });
    }
  });
};
