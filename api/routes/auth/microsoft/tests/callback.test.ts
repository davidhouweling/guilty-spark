import type { AutoRouterType } from "itty-router";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiRouter } from "../../../../base/router";
import { aFakeEnvWith } from "../../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../../services/fakes/services";
import { authMicrosoftCallbackRoute } from "../callback";
import type { DatabaseService } from "../../../../services/database/database";

describe("GET /auth/microsoft/callback", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("attaches the xbox profile and sets a long-lived session cookie on success", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-17T23:05:18.409Z"));

      const accessTokenExpiresAt = Date.now() + 3600 * 1000;
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "handleCallback").mockResolvedValue({
          sessionPayload: {
            sessionId: "session-123",
            userId: "user-123",
            accessToken: "access-token",
            refreshToken: "refresh-token",
            expiresAt: accessTokenExpiresAt,
            issuedAt: Date.now(),
          },
          redirectTo: "/individual-tracker",
        });
        vi.spyOn(services.xboxService, "getUserFromMicrosoftAccessToken").mockResolvedValue({
          xuid: "2533274",
          gamertag: "Spartan117",
          avatarUrl: "https://avatar.example/pic.png",
        });
        vi.spyOn(services.authService, "attachSessionProfile").mockResolvedValue();
        vi.spyOn(services.authService, "createSessionToken").mockResolvedValue("signed-session-token");
        return services;
      });

      authMicrosoftCallbackRoute(router, localInstallServices);

      const req = new Request("http://localhost/auth/microsoft/callback?code=code-123&state=state-123", {
        method: "GET",
        headers: {
          Origin: env.PAGES_URL,
        },
      });

      const res = (await router.fetch(req, env)) as Response;

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(`${env.PAGES_URL}/individual-tracker`);
      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toContain("auth-session=signed-session-token");
      expect(setCookie).toContain("Max-Age=2592000");

      const expiresAtMatch = setCookie?.match(/auth-session=[^]*?Expires=([^;]+GMT)/);
      expect(expiresAtMatch).not.toBeNull();
      const cookieExpiresAt = Date.parse(expiresAtMatch?.[1] ?? "");
      expect(cookieExpiresAt).toBeGreaterThan(accessTokenExpiresAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects sign-in and redirects to login with xbox-required when the xbox profile cannot be resolved", async () => {
    let deleteSessionSpy!: MockInstance<DatabaseService["deleteUserSession"]>;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "handleCallback").mockResolvedValue({
        sessionPayload: {
          sessionId: "session-123",
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 3600 * 1000,
          issuedAt: Date.now(),
        },
        redirectTo: "/individual-tracker",
      });
      vi.spyOn(services.xboxService, "getUserFromMicrosoftAccessToken").mockRejectedValue(new Error("no xbox account"));
      deleteSessionSpy = vi.spyOn(services.databaseService, "deleteUserSession").mockResolvedValue();
      return services;
    });

    authMicrosoftCallbackRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/microsoft/callback?code=code-123&state=state-123", {
      method: "GET",
      headers: {
        Origin: env.PAGES_URL,
      },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${env.PAGES_URL}/login?error=xbox-required`);
    expect(res.headers.get("Set-Cookie") ?? "").not.toContain("auth-session=");
    expect(deleteSessionSpy).toHaveBeenCalledWith("session-123");
  });

  it("returns a generic auth error and cleans up the session when attaching the xbox profile fails", async () => {
    let deleteSessionSpy!: MockInstance<DatabaseService["deleteUserSession"]>;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "handleCallback").mockResolvedValue({
        sessionPayload: {
          sessionId: "session-123",
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 3600 * 1000,
          issuedAt: Date.now(),
        },
        redirectTo: "/individual-tracker",
      });
      vi.spyOn(services.xboxService, "getUserFromMicrosoftAccessToken").mockResolvedValue({
        xuid: "2533274",
        gamertag: "Spartan117",
      });
      vi.spyOn(services.authService, "attachSessionProfile").mockRejectedValue(new Error("d1 write failed"));
      deleteSessionSpy = vi.spyOn(services.databaseService, "deleteUserSession").mockResolvedValue();
      return services;
    });

    authMicrosoftCallbackRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/microsoft/callback?code=code-123&state=state-123", {
      method: "GET",
      headers: {
        Origin: env.PAGES_URL,
      },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body).toEqual({ error: "Authentication failed" });
    expect(deleteSessionSpy).toHaveBeenCalledWith("session-123");
  });

  it("returns a generic authentication error when callback handling fails", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "handleCallback").mockRejectedValue(new Error("upstream microsoft response body"));
      return services;
    });

    authMicrosoftCallbackRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/microsoft/callback?code=code-123&state=state-123", {
      method: "GET",
      headers: {
        Origin: env.PAGES_URL,
      },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body).toEqual({ error: "Authentication failed" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(env.PAGES_URL);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
