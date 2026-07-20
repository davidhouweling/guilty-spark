import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { authCallbackQuerySchema } from "@guilty-spark/shared/contracts/auth/microsoft/callback";
import type { XboxUserInfo } from "../../../services/xbox/types";
import type { RoutesRegisterHandler } from "../../base/types";

export const authMicrosoftCallbackRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/microsoft/callback", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, xboxService, databaseService, logService } = services;

    function redirectToLoginWithError(errorCode: string): Response {
      const rejectUrl = new URL("/login", env.PAGES_URL);
      rejectUrl.searchParams.set("error", errorCode);
      const rejectResponse = new Response(null, {
        status: 302,
        headers: { Location: rejectUrl.toString(), "Cache-Control": "no-store" },
      });
      authService.clearPkceStateCookie(rejectResponse);
      return rejectResponse;
    }

    try {
      logService.info("Auth callback initiated");

      const url = new URL(request.url);

      const providerError = url.searchParams.get("error");
      if (providerError != null) {
        logService.warn(
          "Microsoft returned an OAuth error before issuing a code",
          new Map([
            ["error", providerError],
            ["errorDescription", url.searchParams.get("error_description") ?? ""],
          ]),
        );
        return redirectToLoginWithError("auth-failed");
      }

      const parsedQuery = parseQueryParams(url, authCallbackQuerySchema, "Authentication failed");
      if (!parsedQuery.success) {
        logService.warn("OAuth query parameter validation failed", new Map([["error", "invalid params"]]));
        return redirectToLoginWithError("auth-failed");
      }

      const { code, state } = parsedQuery.data;
      logService.info(
        "OAuth query parameters validated, Exchanging OAuth code for tokens",
        new Map([
          ["code", code],
          ["state", state],
        ]),
      );

      const { sessionPayload, redirectTo } = await authService.handleCallback(request, code, state);
      logService.info(
        "Session created in database",
        new Map([
          ["userId", sessionPayload.userId],
          ["sessionId", sessionPayload.sessionId],
          ["redirectTo", redirectTo],
        ]),
      );

      let xboxUser: XboxUserInfo;
      try {
        logService.info("Fetching Xbox profile from Microsoft", new Map([["userId", sessionPayload.userId]]));
        xboxUser = await xboxService.getUserFromMicrosoftAccessToken(sessionPayload.accessToken);
        logService.info("Xbox profile fetched successfully", new Map([["xuid", xboxUser.xuid]]));
      } catch (xboxError) {
        logService.error(xboxError, new Map([["context", "Xbox profile required for sign-in"]]));
        logService.info(
          "Deleting session due to Xbox profile failure",
          new Map([["sessionId", sessionPayload.sessionId]]),
        );
        await databaseService.deleteUserSession(sessionPayload.sessionId);
        return redirectToLoginWithError("xbox-required");
      }

      try {
        logService.info("Attaching Xbox identity to session", new Map([["xuid", xboxUser.xuid]]));
        await authService.attachSessionProfile(sessionPayload.sessionId, {
          xboxXuid: xboxUser.xuid,
          xboxProfileCheckedAt: Date.now(),
          ...(xboxUser.avatarUrl != null ? { avatarUrl: xboxUser.avatarUrl } : {}),
          ...(xboxUser.gamertag !== "" && xboxUser.gamertag !== "Unknown" ? { xboxGamertag: xboxUser.gamertag } : {}),
        });
        logService.info("Xbox identity attached successfully", new Map([["xuid", xboxUser.xuid]]));
      } catch (attachError) {
        logService.error(
          attachError,
          new Map([
            ["context", "attachSessionProfile failed"],
            ["xuid", xboxUser.xuid],
            ["sessionId", sessionPayload.sessionId],
          ]),
        );
        logService.info(
          "Deleting session due to profile attachment failure",
          new Map([["sessionId", sessionPayload.sessionId]]),
        );
        await databaseService.deleteUserSession(sessionPayload.sessionId);
        throw attachError;
      }

      logService.info("Creating session token", new Map([["userId", sessionPayload.userId]]));
      const sessionToken = await authService.createSessionToken(sessionPayload);
      const pagesRedirectUrl = new URL(redirectTo, env.PAGES_URL);
      logService.info(
        "Auth callback successful, redirecting to pages",
        new Map([
          ["userId", sessionPayload.userId],
          ["redirectUrl", pagesRedirectUrl.toString()],
        ]),
      );

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
      logService.error(
        error,
        new Map([
          ["context", "Auth callback error"],
          ["errorType", error instanceof Error ? error.constructor.name : "unknown"],
        ]),
      );
      return redirectToLoginWithError("auth-failed");
    }
  });
};
