import { errorContract } from "@guilty-spark/shared/contracts/error";
import { addCorsHeaders } from "../../base/cors";
import type { AuthService } from "../../services/auth/auth";
import type { AuthSession } from "../../services/auth/types";

export type RequireSessionResult = { ok: true; session: AuthSession } | { ok: false; response: Response };

export async function requireSession(request: Request, authService: AuthService): Promise<RequireSessionResult> {
  const unauthorized = (clearCookie: boolean): RequireSessionResult => {
    const response = errorContract.toResponse({ error: "Unauthorized" }, { status: 401, noStore: true });
    if (clearCookie) {
      authService.clearSessionCookie(response);
    }
    return { ok: false, response: addCorsHeaders(response, request, true) };
  };

  const session = await authService.validateSession(request);
  if (session === null) {
    return unauthorized(false);
  }

  if (!session.isExpired) {
    return { ok: true, session };
  }

  try {
    const refreshed = await authService.refreshSession(session);
    if (refreshed === null) {
      return unauthorized(true);
    }

    return {
      ok: true,
      session: {
        ...session,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        isExpired: false,
      },
    };
  } catch {
    return unauthorized(true);
  }
}
