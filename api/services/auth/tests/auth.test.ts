import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AuthService } from "../auth";
import { aFakeSessionTokenPayload } from "../fakes/data";
import type { AuthSession } from "../types";

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService({
      microsoftClientId: "test-client-id",
      microsoftClientSecret: "test-client-secret",
      microsoftRedirectUri: "http://localhost:8787/auth/microsoft/callback",
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
});
