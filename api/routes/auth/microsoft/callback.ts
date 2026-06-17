import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { authCallbackQuerySchema } from "@guilty-spark/shared/contracts/auth/microsoft/callback";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { XboxUserInfo } from "../../../services/xbox/types";
import type { RoutesRegisterHandler } from "../../base/types";

export const authMicrosoftCallbackRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/microsoft/callback", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, xboxService, databaseService, logService } = services;

    try {
      const url = new URL(request.url);
      const parsedQuery = parseQueryParams(url, authCallbackQuerySchema, "Authentication failed");
      if (!parsedQuery.success) {
        return parsedQuery.response;
      }

      const { code, state } = parsedQuery.data;

      const { sessionPayload, redirectTo } = await authService.handleCallback(request, code, state);

      let xboxUser: XboxUserInfo;
      try {
        xboxUser = await xboxService.getUserFromMicrosoftAccessToken(sessionPayload.accessToken);
      } catch (xboxError) {
        logService.error(xboxError, new Map([["message", "Xbox profile required for sign-in"]]));
        await databaseService.deleteUserSession(sessionPayload.sessionId);
        const rejectUrl = new URL("/login", env.PAGES_URL);
        rejectUrl.searchParams.set("error", "xbox-required");
        const rejectResponse = new Response(null, { status: 302, headers: { Location: rejectUrl.toString() } });
        authService.clearPkceStateCookie(rejectResponse);
        return rejectResponse;
      }

      try {
        await authService.attachSessionProfile(sessionPayload.sessionId, {
          xboxXuid: xboxUser.xuid,
          xboxProfileCheckedAt: Date.now(),
          ...(xboxUser.avatarUrl != null ? { avatarUrl: xboxUser.avatarUrl } : {}),
          ...(xboxUser.gamertag !== "" && xboxUser.gamertag !== "Unknown" ? { xboxGamertag: xboxUser.gamertag } : {}),
        });
      } catch (attachError) {
        await databaseService.deleteUserSession(sessionPayload.sessionId);
        throw attachError;
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

      return response;
    } catch (error) {
      logService.error(error, new Map([["message", "Auth callback error"]]));
      return errorContract.toResponse({ error: "Authentication failed" }, { status: 400, noStore: true });
    }
  });
};
