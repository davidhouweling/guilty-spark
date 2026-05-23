import { addCorsHeaders } from "../../base/cors";
import { createNoStoreJsonResponse } from "../../base/response";
import type { RoutesRegisterHandler } from "../base/types";

export const authLogoutRoute: RoutesRegisterHandler = (router, installServices) => {
  router.post("/auth/logout", async (request, env: Env) => {
    const services = installServices({ env });

    try {
      const { authService, logService } = services;
      const response = createNoStoreJsonResponse({ success: true }, 200);

      await authService.invalidateSession(request).catch((error: unknown) => {
        logService.error(error as Error, new Map([["message", "Failed to invalidate session during logout"]]));
      });

      authService.clearSessionCookie(response);

      return addCorsHeaders(response, request, true);
    } catch (error) {
      const { logService } = services;
      logService.error(error as Error, new Map([["message", "Auth logout error"]]));
      return addCorsHeaders(createNoStoreJsonResponse({ error: "Logout failed" }, 500), request, true);
    }
  });
};
