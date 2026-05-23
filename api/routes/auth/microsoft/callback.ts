import { addCorsHeaders } from "../../../base/cors";
import { createNoStoreJsonResponse } from "../../../base/response";
import type { RoutesRegisterHandler } from "../../base/types";

export const authMicrosoftCallbackRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/microsoft/callback", async (request, env: Env) => {
    const services = installServices({ env });

    try {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (code == null || state == null) {
        return addCorsHeaders(createNoStoreJsonResponse({ error: "Authentication failed" }, 400), request, true);
      }

      const { authService } = services;

      // Exchange code for tokens and create session
      const sessionPayload = await authService.handleCallback(request, code, state);
      const sessionToken = await authService.createSessionToken(sessionPayload);

      // Create response with Set-Cookie header
      const response = createNoStoreJsonResponse(
        {
          success: true,
          userId: sessionPayload.userId,
        },
        200,
      );

      // Set session cookie
      authService.setSessionCookie(response, sessionToken);
      authService.clearPkceStateCookie(response);

      return addCorsHeaders(response, request, true);
    } catch (error) {
      services.logService.error(error as Error, new Map([["message", "Auth callback error"]]));
      return addCorsHeaders(
        createNoStoreJsonResponse(
          {
            error: "Authentication failed",
          },
          400,
        ),
        request,
        true,
      );
    }
  });
};
