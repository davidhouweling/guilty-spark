import z from "zod";
import { addCorsHeaders } from "../../../base/cors";
import { parseQueryParams } from "../../../base/request-parsing";
import { createNoStoreJsonResponse } from "../../../base/response";
import type { RoutesRegisterHandler } from "../../base/types";

const authCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});

export const authMicrosoftCallbackRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/microsoft/callback", async (request, env: Env) => {
    try {
      const url = new URL(request.url);
      const parsedQuery = parseQueryParams(url, authCallbackQuerySchema, "Authentication failed");
      if (!parsedQuery.success) {
        return addCorsHeaders(createNoStoreJsonResponse({ error: "Authentication failed" }, 400), request, true);
      }

      const { code, state } = parsedQuery.data;

      const services = installServices({ env });
      const { authService } = services;

      // Exchange code for tokens and create session
      const { sessionPayload, redirectTo } = await authService.handleCallback(request, code, state);
      const sessionToken = await authService.createSessionToken(sessionPayload);
      const pagesRedirectUrl = new URL(redirectTo, env.PAGES_URL);

      const response = new Response(null, {
        status: 302,
        headers: {
          Location: pagesRedirectUrl.toString(),
        },
      });

      // Set session cookie
      authService.setSessionCookie(response, sessionToken);
      authService.clearPkceStateCookie(response);

      return addCorsHeaders(response, request, true);
    } catch (error) {
      console.error("Auth callback error:", error);
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
