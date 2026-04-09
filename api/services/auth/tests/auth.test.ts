import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AuthService } from "../auth";
import { MicrosoftAuthService } from "../microsoft-auth";
import { aFakeSessionTokenPayload } from "../fakes/data";
import type { AuthSession } from "../types";

describe("AuthService", () => {
  let service: AuthService;
  let microsoftAuthService: MicrosoftAuthService;

  beforeEach(() => {
    microsoftAuthService = new MicrosoftAuthService({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:8787/auth/microsoft/callback",
    });

    service = new AuthService({
      microsoftAuthService,
      sessionSecret: "a".repeat(64),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates authorization URL with state", async () => {
    const { url, state } = await service.generateAuthorizationUrl();

    expect(url).toBeInstanceOf(URL);
    expect(url.toString()).toContain("login.microsoftonline.com");
    expect(state).toBeTruthy();
  });

  it("throws on invalid state in callback", async () => {
    await expect(service.handleCallback("code", "invalid-state")).rejects.toThrow("Invalid or expired state parameter");
  });

  it("creates session token from payload", async () => {
    const payload = aFakeSessionTokenPayload();
    const token = await service.createSessionToken(payload);

    expect(token).toContain(".");
    expect(token.split(".")).toHaveLength(2);
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

  it("returns null when refreshing a session without refresh token", async () => {
    const session: AuthSession = {
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
      userId: "user-123",
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: Date.now() - 1000,
      isExpired: true,
    };

    const refreshed = await service.refreshSession(session);

    expect(refreshed).not.toBeNull();
    expect(refreshed?.userId).toBe("user-123");
    expect(refreshed?.accessToken).toBe("new-access-token");
    expect(refreshed?.refreshToken).toBe("new-refresh-token");
    expect(typeof refreshed?.expiresAt).toBe("number");
    expect(typeof refreshed?.issuedAt).toBe("number");
  });

  it("returns callback redirect path from PKCE state", async () => {
    vi.spyOn(microsoftAuthService, "generateState").mockReturnValue("known-state");
    vi.spyOn(microsoftAuthService, "generatePKCE").mockResolvedValue({
      codeVerifier: "verifier",
      codeChallenge: "challenge",
    });
    vi.spyOn(microsoftAuthService, "exchangeCodeForTokens").mockResolvedValue({
      access_token: "access-token",
      expires_in: 3600,
      refresh_token: "refresh-token",
      id_token: "id-token",
      token_type: "Bearer",
      scope: "openid profile email",
    });
    vi.spyOn(microsoftAuthService, "parseIdToken").mockReturnValue({
      sub: "user-123",
      email: "user@example.com",
      name: "Test User",
      preferredUsername: "testuser",
    });

    await service.generateAuthorizationUrl("/individual-tracker?queue=3");
    const result = await service.handleCallback("code", "known-state");

    expect(result.redirectTo).toBe("/individual-tracker?queue=3");
    expect(result.sessionPayload.userId).toBe("user-123");
  });

  it("normalizes unsafe redirect paths to root", async () => {
    vi.spyOn(microsoftAuthService, "generateState").mockReturnValue("unsafe-state");
    vi.spyOn(microsoftAuthService, "generatePKCE").mockResolvedValue({
      codeVerifier: "verifier",
      codeChallenge: "challenge",
    });
    vi.spyOn(microsoftAuthService, "exchangeCodeForTokens").mockResolvedValue({
      access_token: "access-token",
      expires_in: 3600,
      refresh_token: "refresh-token",
      id_token: "id-token",
      token_type: "Bearer",
      scope: "openid profile email",
    });
    vi.spyOn(microsoftAuthService, "parseIdToken").mockReturnValue({
      sub: "user-123",
      email: "user@example.com",
      name: "Test User",
      preferredUsername: "testuser",
    });

    await service.generateAuthorizationUrl("https://malicious.example.com/steal");
    const result = await service.handleCallback("code", "unsafe-state");

    expect(result.redirectTo).toBe("/");
  });
});
