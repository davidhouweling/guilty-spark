import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { authSessionRoute } from "../session";

describe("GET /auth/session", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 401 with authenticated false when no session cookie is present", async () => {
    authSessionRoute(router, () => installFakeServicesWith({ env }));

    const req = new Request("http://localhost/auth/session", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json<{ authenticated: boolean }>();
    expect(body).toEqual({ authenticated: false });
  });

  it("adds credentialed CORS headers for allowed origins", async () => {
    authSessionRoute(router, () => installFakeServicesWith({ env }));

    const req = new Request("http://localhost/auth/session", {
      method: "GET",
      headers: {
        Origin: env.PAGES_URL,
      },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(env.PAGES_URL);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("returns 401 with expired flag when session is expired", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue({
        sessionId: "session-123",
        userId: "user-123",
        accessToken: "access-token",
        refreshToken: undefined,
        expiresAt: Date.now() - 1000,
        isExpired: true,
      });
      return services;
    });

    authSessionRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/session", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;
    expect(res.status).toBe(401);
    const body = await res.json<{ authenticated: boolean; expired: boolean }>();
    expect(body).toEqual({ authenticated: false, expired: true });
    expect(res.headers.get("Set-Cookie")).toContain("auth-session=");
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("returns 200 with refreshed session info when access token is expired but refresh succeeds", async () => {
    const refreshedExpiresAt = Date.now() + 3600000;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue({
        sessionId: "session-123",
        userId: "user-123",
        accessToken: "expired-access-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() - 1000,
        isExpired: true,
      });
      vi.spyOn(services.authService, "refreshSession").mockResolvedValue({
        sessionId: "session-123",
        userId: "user-123",
        accessToken: "fresh-access-token",
        refreshToken: "fresh-refresh-token",
        expiresAt: refreshedExpiresAt,
        issuedAt: Date.now(),
      });
      return services;
    });

    authSessionRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/session", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json<{ authenticated: boolean; userId: string; expiresAt: number }>();
    expect(body).toEqual({ authenticated: true, userId: "user-123", expiresAt: refreshedExpiresAt });
  });

  it("returns 200 with user info when session is valid", async () => {
    const expiresAt = Date.now() + 3600000;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue({
        sessionId: "session-123",
        userId: "user-123",
        accessToken: "access-token",
        refreshToken: undefined,
        expiresAt,
        isExpired: false,
      });
      return services;
    });

    authSessionRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/session", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json<{ authenticated: boolean; userId: string; expiresAt: number }>();
    expect(body).toEqual({ authenticated: true, userId: "user-123", expiresAt });
  });

  it("includes the xbox avatar and profile when present on the session", async () => {
    const expiresAt = Date.now() + 3600000;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue({
        sessionId: "session-123",
        userId: "user-123",
        accessToken: "access-token",
        refreshToken: undefined,
        expiresAt,
        isExpired: false,
        avatarUrl: "https://avatar.example/pic.png",
        xboxGamertag: "Spartan117",
        xboxXuid: "2533274",
      });
      return services;
    });

    authSessionRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/session", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;
    expect(res.status).toBe(200);
    const body = await res.json<{
      authenticated: boolean;
      userId: string;
      expiresAt: number;
      avatarUrl: string;
      xboxGamertag: string;
      xboxXuid: string;
    }>();
    expect(body).toEqual({
      authenticated: true,
      userId: "user-123",
      expiresAt,
      avatarUrl: "https://avatar.example/pic.png",
      xboxGamertag: "Spartan117",
      xboxXuid: "2533274",
    });
  });

  it("returns 500 with error message when validateSession throws", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockRejectedValue(new Error("Session error"));
      return services;
    });

    authSessionRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/session", { method: "GET" });
    const res = (await router.fetch(req, env)) as Response;
    expect(res.status).toBe(500);
    const body = await res.json<{ error: string }>();
    expect(body).toEqual({ error: "Failed to retrieve session" });
  });
});
