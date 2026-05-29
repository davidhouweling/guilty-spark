import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { authCallbackQuerySchema } from "@guilty-spark/shared/contracts/auth/microsoft/callback";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { addCorsHeaders } from "../../../base/cors";
import type { RoutesRegisterHandler } from "../../base/types";

export const authMicrosoftCallbackRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/microsoft/callback", async (request, env: Env) => {
    try {
      const url = new URL(request.url);
      const parsedQuery = parseQueryParams(url, authCallbackQuerySchema, "Authentication failed");
      if (!parsedQuery.success) {
        return addCorsHeaders(
          errorContract.toResponse({ error: "Authentication failed" }, { status: 400, noStore: true }),
          request,
          true,
        );
      }

      const { code, state } = parsedQuery.data;

      const services = installServices({ env });
      const { authService, xboxService, logService } = services;

      // Exchange code for tokens and create session
      const { sessionPayload, redirectTo } = await authService.handleCallback(request, code, state);

      // Best-effort: enrich the session with the user's Xbox profile (avatar, gamertag, xuid).
      // A failed lookup must not block login.
      try {
        const xboxUser = await xboxService.getUserFromMicrosoftAccessToken(sessionPayload.accessToken);
        await authService.attachSessionProfile(sessionPayload.sessionId, {
          ...(xboxUser.avatarUrl != null ? { avatarUrl: xboxUser.avatarUrl } : {}),
          xboxGamertag: xboxUser.gamertag,
          xboxXuid: xboxUser.xuid,
        });
      } catch (error) {
        logService.error(error as Error, new Map([["message", "Failed to resolve Xbox profile during auth callback"]]));
      }

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
        errorContract.toResponse({ error: "Authentication failed" }, { status: 400, noStore: true }),
        request,
        true,
      );
    }
  });
};
