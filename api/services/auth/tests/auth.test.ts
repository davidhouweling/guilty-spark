import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { AuthService } from "../auth";
import { SessionManager } from "../session-manager";
import { TokenEncryptor } from "../token-encryptor";
import { aFakeSessionTokenPayload, aFakePKCEState } from "../fakes/data";
import type { AuthSession } from "../types";
import {
  aFakeDatabaseServiceWith,
  aFakeLinkedIdentitiesRow,
  aFakeUserSessionsRow,
} from "../../database/fakes/database.fake";
import type { DatabaseService } from "../../database/database";
import type { TokenInfo } from "../../xbox/types";
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

  it("throws when PKCE state is older than 10 minutes", async () => {
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
            scope: "openid email",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
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

    const { state, codeVerifier } = aFakePKCEState();
    const response = new Response();
    await service.setPkceStateCookie(response, {
      state,
      codeVerifier,
      issuedAt: Date.now() - 11 * 60 * 1000,
      redirectTo: "/individual-tracker",
    });

    const cookieHeader = response.headers.get("Set-Cookie") ?? "";
    const pkceCookie = cookieHeader.split(";")[0] ?? "";
    const request = new Request("http://localhost", {
      headers: {
        Cookie: pkceCookie,
      },
    });

    await expect(service.handleCallback(request, "code", state)).rejects.toThrow("State parameter expired");
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
    const upsertUserCredentialsSpy = vi.spyOn(databaseService, "upsertUserCredentials").mockResolvedValue();

    const { state, codeVerifier } = aFakePKCEState();
    const response = new Response();
    await service.setPkceStateCookie(response, {
      state,
      codeVerifier,
      issuedAt: Date.now(),
      redirectTo: "/individual-tracker",
    });

    const cookieHeader = response.headers.get("Set-Cookie") ?? "";
    const pkceCookie = cookieHeader.split(";")[0] ?? "";
    const request = new Request("http://localhost", {
      headers: {
        Cookie: pkceCookie,
      },
    });

    const { sessionPayload, redirectTo } = await service.handleCallback(request, "code", state);

    expect(sessionPayload.sessionId).toBeTruthy();
    expect(sessionPayload.userId).toBe("user-123");
    expect(redirectTo).toBe("/individual-tracker");
    expect(upsertUserSessionSpy).toHaveBeenCalled();
    const persistedSession = upsertUserSessionSpy.mock.calls[0]?.[0];
    expect(persistedSession?.AccessToken).toContain("enc-v1.");
    expect(persistedSession?.AccessToken).not.toContain("access-token");
    expect(persistedSession?.RefreshToken).toContain("enc-v1.");
    expect(persistedSession?.RefreshToken).not.toContain("refresh-token");

    expect(upsertUserCredentialsSpy).toHaveBeenCalled();
    const persistedCredentials = upsertUserCredentialsSpy.mock.calls[0]?.[0];
    expect(persistedCredentials?.UserId).toBe("user-123");
    expect(persistedCredentials?.RefreshToken).toBe(persistedSession?.RefreshToken);
    expect(persistedCredentials?.RefreshToken).not.toContain("refresh-token");
    expect(typeof persistedCredentials?.UpdatedAt).toBe("number");
  });

  it("normalizes a backslash open-redirect payload to root through the callback round-trip", async () => {
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
            scope: "openid email",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
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
    vi.spyOn(databaseService, "upsertUserSession").mockResolvedValue();

    const { state, codeVerifier } = aFakePKCEState();
    const response = new Response();
    // "/\evil.com" passes a naive "//" prefix check but the URL parser resolves it to https://evil.com/.
    await service.setPkceStateCookie(response, {
      state,
      codeVerifier,
      issuedAt: Date.now(),
      redirectTo: "/\\evil.com",
    });

    const cookieHeader = response.headers.get("Set-Cookie") ?? "";
    const pkceCookie = cookieHeader.split(";")[0] ?? "";
    const request = new Request("http://localhost", { headers: { Cookie: pkceCookie } });

    const { redirectTo } = await service.handleCallback(request, "code", state);
    expect(redirectTo).toBe("/");
  });

  it("sets session cookie in response", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);
    const response = new Response();

    service.setSessionCookie(response, token);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Max-Age=2592000");
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

  it("returns null when the signed session has expired server-side", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-17T23:32:08.160Z"));
      const payload = aFakeSessionTokenPayload({
        issuedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
        expiresAt: Date.now() + 3600 * 1000,
      });
      const token = await service.createSessionToken(payload);
      vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
        aFakeUserSessionsRow({
          SessionId: payload.sessionId,
          UserId: payload.userId,
          ExpiresAt: Math.floor(payload.expiresAt / 1000),
        }),
      );

      const request = new Request("http://localhost", {
        headers: {
          Cookie: `auth-session=${token}`,
        },
      });

      const session = await service.validateSession(request);
      expect(session).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null for invalid session", async () => {
    const request = new Request("http://localhost");

    const session = await service.validateSession(request);
    expect(session).toBeNull();
  });

  it("returns null when session cookie token signature is invalid", async () => {
    const request = new Request("http://localhost", {
      headers: {
        Cookie: "auth-session=invalid-token",
      },
    });

    const session = await service.validateSession(request);

    expect(session).toBeNull();
  });

  it("returns null when signed session cookie payload is not the expected shape", async () => {
    const manager = new SessionManager("a".repeat(64));
    const token = await manager.createSignedToken(JSON.stringify({ foo: "bar" }));

    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-session=${token}`,
      },
    });

    const session = await service.validateSession(request);

    expect(session).toBeNull();
  });

  it("returns null when signed session cookie payload is not valid JSON", async () => {
    const manager = new SessionManager("a".repeat(64));
    const token = await manager.createSignedToken("not-json");

    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-session=${token}`,
      },
    });

    const session = await service.validateSession(request);

    expect(session).toBeNull();
  });

  it("returns null when the session token is valid but no persisted session row exists", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(null);

    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-session=${token}`,
      },
    });

    const session = await service.validateSession(request);

    expect(session).toBeNull();
  });

  it("does nothing when invalidating a request without a valid session", async () => {
    const deleteUserSessionSpy = vi.spyOn(databaseService, "deleteUserSession").mockResolvedValue();

    await service.invalidateSession(new Request("http://localhost"));

    expect(deleteUserSessionSpy).not.toHaveBeenCalled();
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
    const upsertUserSessionSpy = vi.spyOn(databaseService, "upsertUserSession").mockResolvedValue();
    const upsertUserCredentialsSpy = vi.spyOn(databaseService, "upsertUserCredentials").mockResolvedValue();

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

    expect(upsertUserCredentialsSpy).toHaveBeenCalled();
    const persistedCredentials = upsertUserCredentialsSpy.mock.calls[0]?.[0];
    expect(persistedCredentials?.UserId).toBe("user-123");
    expect(persistedCredentials?.RefreshToken).toBe(persistedSession?.RefreshToken);
    expect(persistedCredentials?.RefreshToken).not.toContain("new-refresh-token");
  });

  it("returns null when refreshSession cannot find the persisted session row", async () => {
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
      sessionId: "missing-session",
      userId: "user-123",
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: Date.now() - 1000,
      isExpired: true,
    };

    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(null);

    const refreshed = await service.refreshSession(session);

    expect(refreshed).toBeNull();
  });

  describe("getMicrosoftAccessTokenForUser()", () => {
    const tokenEncryptionSecret = "b".repeat(64);

    it("returns the access token and re-persists a rotated refresh token encrypted", async () => {
      const encryptor = new TokenEncryptor(tokenEncryptionSecret);
      const encryptedStored = await encryptor.encrypt("stored-refresh-token");

      vi.spyOn(databaseService, "getUserCredentials").mockResolvedValue({
        UserId: "user-123",
        RefreshToken: encryptedStored,
        UpdatedAt: Math.floor(Date.now() / 1000),
      });
      const upsertUserCredentialsSpy = vi.spyOn(databaseService, "upsertUserCredentials").mockResolvedValue();

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "fresh-access-token",
            expires_in: 3600,
            refresh_token: "rotated-refresh-token",
            token_type: "Bearer",
            scope: "openid profile",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await service.getMicrosoftAccessTokenForUser("user-123");

      expect(result).toBe("fresh-access-token");
      expect(upsertUserCredentialsSpy).toHaveBeenCalledTimes(1);
      const persisted = upsertUserCredentialsSpy.mock.calls[0]?.[0];
      expect(persisted?.UserId).toBe("user-123");
      expect(persisted?.RefreshToken).toContain("enc-v1.");
      expect(persisted?.RefreshToken).not.toContain("rotated-refresh-token");
      expect(await encryptor.decrypt(persisted?.RefreshToken ?? "")).toBe("rotated-refresh-token");
    });

    it("returns null when the user has no stored credentials", async () => {
      vi.spyOn(databaseService, "getUserCredentials").mockResolvedValue(null);
      const upsertUserCredentialsSpy = vi.spyOn(databaseService, "upsertUserCredentials").mockResolvedValue();

      const result = await service.getMicrosoftAccessTokenForUser("unknown-user");

      expect(result).toBeNull();
      expect(upsertUserCredentialsSpy).not.toHaveBeenCalled();
    });

    it("fails closed when getUserCredentials throws", async () => {
      vi.spyOn(databaseService, "getUserCredentials").mockRejectedValue(new Error("db unavailable"));

      const result = await service.getMicrosoftAccessTokenForUser("user-123");

      expect(result).toBeNull();
    });

    it("fails closed (returns null) when the refresh request throws", async () => {
      const encryptor = new TokenEncryptor(tokenEncryptionSecret);
      vi.spyOn(databaseService, "getUserCredentials").mockResolvedValue({
        UserId: "user-123",
        RefreshToken: await encryptor.encrypt("revoked-refresh-token"),
        UpdatedAt: Math.floor(Date.now() / 1000),
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("invalid_grant", { status: 400, statusText: "Bad Request" }),
      );

      const result = await service.getMicrosoftAccessTokenForUser("user-123");

      expect(result).toBeNull();
    });

    it("retries once with the latest stored refresh token when credentials rotated concurrently", async () => {
      const encryptor = new TokenEncryptor(tokenEncryptionSecret);
      const oldEncryptedRefreshToken = await encryptor.encrypt("old-refresh-token");
      const newEncryptedRefreshToken = await encryptor.encrypt("new-refresh-token");

      const getUserCredentialsSpy = vi
        .spyOn(databaseService, "getUserCredentials")
        .mockResolvedValueOnce({
          UserId: "user-123",
          RefreshToken: oldEncryptedRefreshToken,
          UpdatedAt: Math.floor(Date.now() / 1000),
        })
        .mockResolvedValueOnce({
          UserId: "user-123",
          RefreshToken: newEncryptedRefreshToken,
          UpdatedAt: Math.floor(Date.now() / 1000),
        });

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("invalid_grant", { status: 400, statusText: "Bad Request" }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "recovered-access-token",
              expires_in: 3600,
              token_type: "Bearer",
              scope: "openid profile",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      const result = await service.getMicrosoftAccessTokenForUser("user-123");

      expect(result).toBe("recovered-access-token");
      expect(getUserCredentialsSpy).toHaveBeenCalledTimes(2);
    });

    it("returns null when refresh fails and latest credentials row is missing", async () => {
      const encryptor = new TokenEncryptor(tokenEncryptionSecret);
      const encryptedRefreshToken = await encryptor.encrypt("stale-refresh-token");

      const getUserCredentialsSpy = vi
        .spyOn(databaseService, "getUserCredentials")
        .mockResolvedValueOnce({
          UserId: "user-123",
          RefreshToken: encryptedRefreshToken,
          UpdatedAt: Math.floor(Date.now() / 1000),
        })
        .mockResolvedValueOnce(null);

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("invalid_grant", { status: 400, statusText: "Bad Request" }),
      );

      const result = await service.getMicrosoftAccessTokenForUser("user-123");

      expect(result).toBeNull();
      expect(getUserCredentialsSpy).toHaveBeenCalledTimes(2);
    });

    it("returns null when refresh fails and latest credentials have the same token", async () => {
      const encryptor = new TokenEncryptor(tokenEncryptionSecret);
      const encryptedRefreshToken = await encryptor.encrypt("same-refresh-token");

      const getUserCredentialsSpy = vi
        .spyOn(databaseService, "getUserCredentials")
        .mockResolvedValueOnce({
          UserId: "user-123",
          RefreshToken: encryptedRefreshToken,
          UpdatedAt: Math.floor(Date.now() / 1000),
        })
        .mockResolvedValueOnce({
          UserId: "user-123",
          RefreshToken: encryptedRefreshToken,
          UpdatedAt: Math.floor(Date.now() / 1000),
        });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("invalid_grant", { status: 400, statusText: "Bad Request" }),
      );

      const result = await service.getMicrosoftAccessTokenForUser("user-123");

      expect(result).toBeNull();
      expect(getUserCredentialsSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("merges xbox profile into the persisted session metadata", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: "session-123",
        AuthMetadataJson: JSON.stringify({ email: "user@example.com", name: "User" }),
      }),
    );
    const updateMetadataSpy = vi.spyOn(databaseService, "updateSessionAuthMetadata").mockResolvedValue();
    vi.spyOn(databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([]);
    vi.spyOn(databaseService, "upsertLinkedIdentity").mockResolvedValue();

    await service.attachSessionProfile("session-123", {
      avatarUrl: "https://example.com/avatar.png",
      xboxGamertag: "Spartan117",
      xboxXuid: "2533274",
    });

    const [sessionId, authMetadataJson] = updateMetadataSpy.mock.calls[0] ?? [];
    expect(sessionId).toBe("session-123");
    const metadata = JSON.parse(authMetadataJson ?? "{}") as Record<string, string>;
    expect(metadata).toMatchObject({
      email: "user@example.com",
      name: "User",
      avatarUrl: "https://example.com/avatar.png",
      xboxGamertag: "Spartan117",
      xboxXuid: "2533274",
    });
  });

  it("merges xboxProfileCheckedAt into the persisted session metadata", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: "session-123",
        AuthMetadataJson: JSON.stringify({ email: "user@example.com" }),
      }),
    );
    const updateMetadataSpy = vi.spyOn(databaseService, "updateSessionAuthMetadata").mockResolvedValue();

    await service.attachSessionProfile("session-123", {
      xboxProfileCheckedAt: 123456,
    });

    const [, authMetadataJson] = updateMetadataSpy.mock.calls[0] ?? [];
    const metadata = JSON.parse(authMetadataJson ?? "{}") as Record<string, unknown>;
    expect(metadata["xboxProfileCheckedAt"]).toBe(123456);
  });

  it("does nothing when attaching a profile to a missing session", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(null);
    const updateMetadataSpy = vi.spyOn(databaseService, "updateSessionAuthMetadata").mockResolvedValue();

    await service.attachSessionProfile("missing-session", { avatarUrl: "https://example.com/avatar.png" });

    expect(updateMetadataSpy).not.toHaveBeenCalled();
  });

  it("links the xbox identity from the resolved profile", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({ SessionId: "session-123", UserId: "user-123", AuthMetadataJson: "{}" }),
    );
    vi.spyOn(databaseService, "updateSessionAuthMetadata").mockResolvedValue();
    vi.spyOn(databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([]);
    const upsertSpy: MockInstance<DatabaseService["upsertLinkedIdentity"]> = vi
      .spyOn(databaseService, "upsertLinkedIdentity")
      .mockResolvedValue();

    await service.attachSessionProfile("session-123", { xboxXuid: "2533274", xboxGamertag: "Spartan117" });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        UserId: "user-123",
        Provider: "xbox",
        ProviderUserId: "2533274",
        Gamertag: "Spartan117",
        IsActive: 1,
      }),
    );
  });

  it("deactivates a previously linked xbox identity that has a different xuid", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({ SessionId: "session-123", UserId: "user-123", AuthMetadataJson: "{}" }),
    );
    vi.spyOn(databaseService, "updateSessionAuthMetadata").mockResolvedValue();
    vi.spyOn(databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([
      aFakeLinkedIdentitiesRow({ IdentityId: "old", UserId: "user-123", ProviderUserId: "1111", IsActive: 1 }),
    ]);
    const upsertSpy: MockInstance<DatabaseService["upsertLinkedIdentity"]> = vi
      .spyOn(databaseService, "upsertLinkedIdentity")
      .mockResolvedValue();

    await service.attachSessionProfile("session-123", { xboxXuid: "2533274", xboxGamertag: "Spartan117" });

    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ IdentityId: "old", IsActive: 0 }));
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ProviderUserId: "2533274", IsActive: 1, UserId: "user-123" }),
    );
  });

  it("does not link an identity when the profile has no xuid", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({ SessionId: "session-123", AuthMetadataJson: "{}" }),
    );
    vi.spyOn(databaseService, "updateSessionAuthMetadata").mockResolvedValue();
    const upsertSpy: MockInstance<DatabaseService["upsertLinkedIdentity"]> = vi
      .spyOn(databaseService, "upsertLinkedIdentity")
      .mockResolvedValue();

    await service.attachSessionProfile("session-123", { avatarUrl: "https://example.com/avatar.png" });

    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("surfaces avatar and xbox profile from session metadata", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: payload.sessionId,
        UserId: payload.userId,
        AccessToken: payload.accessToken,
        RefreshToken: payload.refreshToken ?? null,
        ExpiresAt: Math.floor(payload.expiresAt / 1000),
        AuthMetadataJson: JSON.stringify({
          avatarUrl: "https://example.com/avatar.png",
          xboxGamertag: "Spartan117",
          xboxXuid: "2533274",
        }),
      }),
    );

    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-session=${token}`,
      },
    });

    const session = await service.validateSession(request);
    expect(session?.avatarUrl).toBe("https://example.com/avatar.png");
    expect(session?.xboxGamertag).toBe("Spartan117");
    expect(session?.xboxXuid).toBe("2533274");
  });

  it("surfaces xboxProfileCheckedAt from session metadata", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: payload.sessionId,
        UserId: payload.userId,
        AccessToken: payload.accessToken,
        RefreshToken: payload.refreshToken ?? null,
        ExpiresAt: Math.floor(payload.expiresAt / 1000),
        AuthMetadataJson: JSON.stringify({ xboxProfileCheckedAt: 12345 }),
      }),
    );

    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-session=${token}`,
      },
    });

    const session = await service.validateSession(request);
    expect(session?.xboxProfileCheckedAt).toBe(12345);
  });

  it("tolerates malformed auth metadata JSON during session validation", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: payload.sessionId,
        UserId: payload.userId,
        AccessToken: payload.accessToken,
        RefreshToken: payload.refreshToken ?? null,
        ExpiresAt: Math.floor(payload.expiresAt / 1000),
        AuthMetadataJson: "{bad-json",
      }),
    );

    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-session=${token}`,
      },
    });

    const session = await service.validateSession(request);
    expect(session).not.toBeNull();
    expect(session?.avatarUrl).toBeUndefined();
  });

  it("clears PKCE state cookie", () => {
    const response = new Response();

    service.clearPkceStateCookie(response);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("auth-pkce-state=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("throws when signed PKCE payload does not match expected object shape", async () => {
    const manager = new SessionManager("a".repeat(64));
    const token = await manager.createSignedToken(JSON.stringify({ invalid: true }));

    const request = new Request("http://localhost", {
      headers: {
        Cookie: `auth-pkce-state=${token}`,
      },
    });

    await expect(service.handleCallback(request, "code", "state")).rejects.toThrow(
      "Invalid or expired state parameter",
    );
  });

  it("throws when PKCE state cookie is missing", async () => {
    const request = new Request("http://localhost");

    await expect(service.handleCallback(request, "code", "state")).rejects.toThrow(
      "Invalid or expired state parameter",
    );
  });

  it("throws when PKCE state parameter does not match", async () => {
    const { state, codeVerifier } = aFakePKCEState();
    const response = new Response();
    await service.setPkceStateCookie(response, {
      state,
      codeVerifier,
      issuedAt: Date.now(),
      redirectTo: "/individual-tracker",
    });

    const cookieHeader = response.headers.get("Set-Cookie") ?? "";
    const pkceCookie = cookieHeader.split(";")[0] ?? "";
    const request = new Request("http://localhost", {
      headers: {
        Cookie: pkceCookie,
      },
    });

    await expect(service.handleCallback(request, "code", "different-state")).rejects.toThrow(
      "Invalid or expired state parameter",
    );
  });

  it("stores a session-scoped Halo XSTS token encrypted in auth metadata", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: "session-123",
        AuthMetadataJson: JSON.stringify({ email: "user@example.com" }),
      }),
    );
    const updateMetadataSpy = vi.spyOn(databaseService, "updateSessionAuthMetadata").mockResolvedValue();

    const tokenInfo: TokenInfo = {
      XSTSToken: "session-xsts-token",
      userHash: "session-user-hash",
      expiresOn: new Date(Date.now() + 3600_000),
    };

    await service.cacheHaloXstsTokenForSession("session-123", tokenInfo);

    expect(updateMetadataSpy).toHaveBeenCalledTimes(1);
    const [, authMetadataJson] = updateMetadataSpy.mock.calls[0] ?? [];
    const metadata = JSON.parse(authMetadataJson ?? "{}") as Record<string, unknown>;

    expect(metadata["email"]).toBe("user@example.com");
    expect(metadata["haloXstsTokenEncrypted"]).toEqual(expect.any(String));
    expect(String(metadata["haloXstsTokenEncrypted"]).includes("session-xsts-token")).toBe(false);
    expect(metadata["haloXstsUserHash"]).toBe("session-user-hash");
    expect(metadata["haloXstsExpiresAt"]).toBe(tokenInfo.expiresOn.getTime());
  });

  it("returns a cached Halo XSTS token when session metadata contains a valid encrypted token", async () => {
    const encryptor = new TokenEncryptor("b".repeat(64));
    const encryptedToken = await encryptor.encrypt("session-xsts-token");

    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: "session-123",
        AuthMetadataJson: JSON.stringify({
          haloXstsTokenEncrypted: encryptedToken,
          haloXstsUserHash: "session-user-hash",
          haloXstsExpiresAt: Date.now() + 3600_000,
        }),
      }),
    );

    const cached = await service.getCachedHaloXstsTokenForSession("session-123");

    expect(cached).not.toBeNull();
    expect(cached?.XSTSToken).toBe("session-xsts-token");
    expect(cached?.userHash).toBe("session-user-hash");
    expect(cached?.expiresOn).toBeInstanceOf(Date);
  });

  it("returns null for cached Halo XSTS token when session is missing", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(null);

    const cached = await service.getCachedHaloXstsTokenForSession("missing-session");

    expect(cached).toBeNull();
  });

  it("returns null for cached Halo XSTS token when required metadata fields are missing", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: "session-123",
        AuthMetadataJson: JSON.stringify({ haloXstsUserHash: "session-user-hash" }),
      }),
    );

    const cached = await service.getCachedHaloXstsTokenForSession("session-123");

    expect(cached).toBeNull();
  });

  it("returns null for cached Halo XSTS token when token is inside expiry skew", async () => {
    const encryptor = new TokenEncryptor("b".repeat(64));
    const encryptedToken = await encryptor.encrypt("session-xsts-token");

    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: "session-123",
        AuthMetadataJson: JSON.stringify({
          haloXstsTokenEncrypted: encryptedToken,
          haloXstsUserHash: "session-user-hash",
          haloXstsExpiresAt: Date.now() + 30_000,
        }),
      }),
    );

    const cached = await service.getCachedHaloXstsTokenForSession("session-123");

    expect(cached).toBeNull();
  });

  it("returns null for cached Halo XSTS token when encrypted token cannot be decrypted", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(
      aFakeUserSessionsRow({
        SessionId: "session-123",
        AuthMetadataJson: JSON.stringify({
          haloXstsTokenEncrypted: "enc-v1.invalid-token",
          haloXstsUserHash: "session-user-hash",
          haloXstsExpiresAt: Date.now() + 3_600_000,
        }),
      }),
    );

    const cached = await service.getCachedHaloXstsTokenForSession("session-123");

    expect(cached).toBeNull();
  });

  it("does nothing when caching a Halo XSTS token for a missing session", async () => {
    vi.spyOn(databaseService, "getUserSession").mockResolvedValue(null);
    const updateMetadataSpy = vi.spyOn(databaseService, "updateSessionAuthMetadata").mockResolvedValue();

    await service.cacheHaloXstsTokenForSession("missing-session", {
      XSTSToken: "session-xsts-token",
      userHash: "session-user-hash",
      expiresOn: new Date(Date.now() + 3_600_000),
    });

    expect(updateMetadataSpy).not.toHaveBeenCalled();
  });
});
