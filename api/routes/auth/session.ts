import { addCorsHeaders } from "../../base/cors";
import { createNoStoreJsonResponse } from "../../base/response";
import type { RoutesRegisterHandler } from "../base/types";

export const authSessionRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/session", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, logService } = services;

    try {
      const session = await authService.validateSession(request);

      if (session === null) {
        return addCorsHeaders(createNoStoreJsonResponse({ authenticated: false }, 401), request, true);
      }

      let authenticatedSession = session;
      if (session.isExpired) {
        try {
          const refreshedSession = await authService.refreshSession(session);
          if (refreshedSession == null) {
            const response = createNoStoreJsonResponse({ authenticated: false, expired: true }, 401);
            authService.clearSessionCookie(response);
            return addCorsHeaders(response, request, true);
          }

          authenticatedSession = {
            ...session,
            accessToken: refreshedSession.accessToken,
            refreshToken: refreshedSession.refreshToken,
            expiresAt: refreshedSession.expiresAt,
            isExpired: false,
          };
        } catch {
          const response = createNoStoreJsonResponse({ authenticated: false, expired: true }, 401);
          authService.clearSessionCookie(response);
          return addCorsHeaders(response, request, true);
        }
      }

      return addCorsHeaders(
        createNoStoreJsonResponse(
          { authenticated: true, userId: authenticatedSession.userId, expiresAt: authenticatedSession.expiresAt },
          200,
        ),
        request,
        true,
      );
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Auth session error"]]));
      return addCorsHeaders(createNoStoreJsonResponse({ error: "Failed to retrieve session" }, 500), request, true);
    }
  });
};
