import type { AutoRouterType } from "itty-router";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiRouter } from "../../../base/router";
import type { DatabaseService } from "../../../services/database/database";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { authLogoutRoute } from "../logout";

describe("POST /auth/logout", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 200, revokes the server session, and clears the session cookie", async () => {
    let deleteUserSessionSpy!: MockInstance<DatabaseService["deleteUserSession"]>;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue({
        sessionId: "session-123",
        userId: "user-123",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 3600000,
        isExpired: false,
      });
      deleteUserSessionSpy = vi.spyOn(services.databaseService, "deleteUserSession").mockResolvedValue();
      return services;
    });

    authLogoutRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/logout", {
      method: "POST",
      headers: {
        Cookie: "auth-session=valid-token",
      },
    });
    const res = (await router.fetch(req, env)) as Response;
    expect(res.status).toBe(200);
    const body = await res.json<{ success: boolean }>();
    expect(body).toEqual({ success: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("auth-session=");
    expect(setCookie).toContain("Max-Age=0");
    expect(deleteUserSessionSpy).toHaveBeenCalledWith("session-123");
  });

  it("returns 200 and clears the session cookie when server-side invalidation fails", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "invalidateSession").mockRejectedValue(new Error("D1 unavailable"));
      return services;
    });
    authLogoutRoute(router, localInstallServices);
    const req = new Request("http://localhost/auth/logout", { method: "POST" });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<{ success: boolean }>();
    expect(body).toEqual({ success: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("auth-session=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("returns 500 with error message when clearSessionCookie throws", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "clearSessionCookie").mockImplementation(() => {
        throw new Error("Cookie error");
      });
      return services;
    });
    authLogoutRoute(router, localInstallServices);
    const req = new Request("http://localhost/auth/logout", { method: "POST" });
    const res = (await router.fetch(req, env)) as Response;
    expect(res.status).toBe(500);
    const body = await res.json<{ error: string }>();
    expect(body).toEqual({ error: "Logout failed" });
  });
});
