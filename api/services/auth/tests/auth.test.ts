import type { MockInstance } from "vitest";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AuthService } from "../auth";
import { aFakeSessionTokenPayload, aFakePKCEState } from "../fakes/data";
import type { AuthSession } from "../types";
import type { DatabaseService } from "../../database/database";
import { aFakeDatabaseServiceWith, aFakeUserSessionsRow } from "../../database/fakes/database.fake";
import { aSignedMicrosoftIdTokenWith } from "./id-token-signing";

describe("AuthService", () => {
  let service: AuthService;
  let databaseService: ReturnType<typeof aFakeDatabaseServiceWith>;

  beforeEach(() => {
    databaseService = aFakeDatabaseServiceWith();
    service = new AuthService({
      microsoftClientId: "test-client-id",
      microsoftClientSecret: "test-client-secret",
      microsoftRedirectUri: "http://localhost:8787/auth/microsoft/callback",
      microsoftTenant: "common",
      microsoftScopes: "openid email",
      sessionSecret: "a".repeat(64),
      tokenEncryptionSecret: "b".repeat(64),
      databaseService,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates authorization URL with state", async () => {
    const { url, state } = await service.generateAuthorizationUrl();

    expect(url).toBeInstanceOf(URL);
    expect(url.toString()).toContain("login.microsoftonline.com");
    expect(url.pathname).toContain("/common/oauth2/v2.0/authorize");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(state).toBeTruthy();
  });

  it("throws on invalid state in callback", async () => {
    const request = new Request("http://localhost", {
      headers: {
        Cookie: "auth-pkce-state=invalid-token",
      },
    });

    await expect(service.handleCallback(request, "code", "invalid-state")).rejects.toThrow(
      "Invalid or expired state parameter",
    );
  });

  it("creates session token from payload", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);

    expect(token).toContain(".");
    expect(token.split(".")).toHaveLength(2);
  });

  it("handles callback with pkce cookie and persists the session", async () => {
    const signedToken = await aSignedMicrosoftIdTokenWith({
      clientId: "test-client-id",
      issuerTemplate: "https://login.microsoftonline.com/{tenantid}/v2.0",
      tenantId: "test-tenant-id",
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token",
            expires_in: 3600,
            refresh_token: "refresh-token",
            id_token: signedToken.token,
            token_type: "Bearer",
            scope: "openid email XboxLive.signin XboxLive.offline_access",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.openIdConfiguration), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(signedToken.jwkSet), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const upsertUserSessionSpy = vi.spyOn(databaseService, "upsertUserSession").mockResolvedValue();

    const { state, codeVerifier } = aFakePKCEState();
    const response = new Response();
    await service.setPkceStateCookie(response, {
      state,
      codeVerifier,
      issuedAt: Date.now(),
    });

    const cookieHeader = response.headers.get("Set-Cookie") ?? "";
    const pkceCookie = cookieHeader.split(";")[0] ?? "";
    const request = new Request("http://localhost", {
      headers: {
        Cookie: pkceCookie,
      },
    });

    const session = await service.handleCallback(request, "code", state);

    expect(session.sessionId).toBeTruthy();
    expect(session.userId).toBe("user-123");
    expect(upsertUserSessionSpy).toHaveBeenCalled();
    const persistedSession = upsertUserSessionSpy.mock.calls[0]?.[0];
    expect(persistedSession?.AccessToken).toContain("enc-v1.");
    expect(persistedSession?.AccessToken).not.toContain("access-token");
    expect(persistedSession?.RefreshToken).toContain("enc-v1.");
    expect(persistedSession?.RefreshToken).not.toContain("refresh-token");
  });

  it("sets session cookie in response", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);
    const response = new Response();

    service.setSessionCookie(response, token, payload.expiresAt);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("HttpOnly");
  });

  it("clears session cookie", () => {
    const response = new Response();
    service.clearSessionCookie(response);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("validates session from request", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: payload.sessionId,
        UserId: payload.userId,
        AccessToken: payload.accessToken,
        RefreshToken: payload.refreshToken ?? null,
        ExpiresAt: Math.floor(payload.expiresAt / 1000),
        LastRefreshedAt: Math.floor(Date.now() / 1000),
      }),
    );

    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-session=${token}`,
      },
    });

    const session = await service.validateSession(request);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(payload.userId);
  });

  it("returns null for invalid session", async () => {
    const request = new Request("http://localhost");

    const session = await service.validateSession(request);
    expect(session).toBeNull();
  });

  it("deletes the persisted session for a valid request", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);
    const deleteUserSessionSpy = vi.spyOn(databaseService, "deleteUserSession").mockResolvedValue();
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: payload.sessionId,
        UserId: payload.userId,
        AccessToken: payload.accessToken,
        RefreshToken: payload.refreshToken ?? null,
        ExpiresAt: Math.floor(payload.expiresAt / 1000),
      }),
    );
    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-session=${token}`,
      },
    });

    await service.invalidateSession(request);

    expect(deleteUserSessionSpy).toHaveBeenCalledWith(payload.sessionId);
  });

  it("returns null when refreshing a session without refresh token", async () => {
    const session: AuthSession = {
      sessionId: "session-123",
      userId: "user-123",
      accessToken: "access-token",
      refreshToken: undefined,
      expiresAt: Date.now() - 1000,
      isExpired: true,
    };

    const refreshed = await service.refreshSession(session);
    expect(refreshed).toBeNull();
  });

  it("refreshes session and returns updated token payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          expires_in: 3600,
          refresh_token: "new-refresh-token",
          token_type: "Bearer",
          scope: "openid profile",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const session: AuthSession = {
      sessionId: "session-123",
      userId: "user-123",
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: Date.now() - 1000,
      isExpired: true,
    };

    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({ SessionId: session.sessionId }),
    );
    const upsertUserSessionSpy: MockInstance<DatabaseService["upsertUserSession"]> = vi
      .spyOn(databaseService, "upsertUserSession")
      .mockResolvedValue();

    const refreshed = await service.refreshSession(session);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.sessionId).toBe(session.sessionId);
    expect(refreshed?.userId).toBe("user-123");
    expect(refreshed?.accessToken).toBe("new-access-token");
    expect(refreshed?.refreshToken).toBe("new-refresh-token");
    expect(typeof refreshed?.expiresAt).toBe("number");
    expect(typeof refreshed?.issuedAt).toBe("number");
    const persistedSession = upsertUserSessionSpy.mock.calls[0]?.[0];
    expect(persistedSession?.AccessToken).toContain("enc-v1.");
    expect(persistedSession?.RefreshToken).toContain("enc-v1.");
  });
});
