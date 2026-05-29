import { errorContract } from "@guilty-spark/shared/contracts/error";
import { sessionContract } from "@guilty-spark/shared/contracts/auth/session";
import { addCorsHeaders } from "../../base/cors";
import type { RoutesRegisterHandler } from "../base/types";
import { enrichSessionProfile } from "./profile-enrichment";

export const authSessionRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/session", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, logService } = services;

    try {
      const session = await authService.validateSession(request);

      if (session === null) {
        return addCorsHeaders(
          sessionContract.toResponse({ authenticated: false }, { status: 401, noStore: true }),
          request,
          true,
        );
      }

      let authenticatedSession = session;
      if (session.isExpired) {
        try {
          const refreshedSession = await authService.refreshSession(session);
          if (refreshedSession == null) {
            const response = sessionContract.toResponse(
              { authenticated: false, expired: true },
              { status: 401, noStore: true },
            );
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
          const response = sessionContract.toResponse(
            { authenticated: false, expired: true },
            { status: 401, noStore: true },
          );
          authService.clearSessionCookie(response);
          return addCorsHeaders(response, request, true);
        }
      }

      // Self-heal: if the Xbox profile has never been resolved AND we haven't attempted it
      // yet, try once. The xboxProfileCheckedAt marker (stamped on every attempt) keeps this
      // off the hot path for sessions whose profile can't be resolved, instead of re-running
      // the Xbox token exchange on every request.
      if (authenticatedSession.xboxXuid == null && authenticatedSession.xboxProfileCheckedAt == null) {
        const profile = await enrichSessionProfile(
          services,
          authenticatedSession.sessionId,
          Date.now(),
          authenticatedSession.accessToken,
        );
        if (profile != null) {
          authenticatedSession = { ...authenticatedSession, ...profile };
        }
      }

      return addCorsHeaders(
        sessionContract.toResponse(
          {
            authenticated: true,
            userId: authenticatedSession.userId,
            expiresAt: authenticatedSession.expiresAt,
            ...(authenticatedSession.avatarUrl != null ? { avatarUrl: authenticatedSession.avatarUrl } : {}),
            ...(authenticatedSession.xboxGamertag != null ? { xboxGamertag: authenticatedSession.xboxGamertag } : {}),
            ...(authenticatedSession.xboxXuid != null ? { xboxXuid: authenticatedSession.xboxXuid } : {}),
          },
          { noStore: true },
        ),
        request,
        true,
      );
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Auth session error"]]));
      return addCorsHeaders(
        errorContract.toResponse({ error: "Failed to retrieve session" }, { status: 500, noStore: true }),
        request,
        true,
      );
    }
  });
};
