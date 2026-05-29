import type { AutoRouterType } from "itty-router";
import { AutoRouter } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aFakeEnvWith } from "../../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../../services/fakes/services";
import { authMicrosoftCallbackRoute } from "../callback";

describe("GET /auth/microsoft/callback", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = AutoRouter();
  });

  it("sets a long-lived session cookie separate from access token expiry", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-17T23:05:18.409Z"));

      const accessTokenExpiresAt = Date.now() + 3600 * 1000;
      let attachSessionProfileSpy!: ReturnType<typeof vi.spyOn>;
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
        vi.spyOn(services.authService, "createSessionToken").mockResolvedValue("signed-session-token");
        vi.spyOn(services.xboxService, "getUserFromMicrosoftAccessToken").mockResolvedValue({
          xuid: "2533274",
          gamertag: "Spartan117",
          avatarUrl: "https://avatar.example/pic.png",
        });
        attachSessionProfileSpy = vi.spyOn(services.authService, "attachSessionProfile").mockResolvedValue();
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

      expect(attachSessionProfileSpy).toHaveBeenCalledWith(
        "session-123",
        expect.objectContaining({
          avatarUrl: "https://avatar.example/pic.png",
          xboxGamertag: "Spartan117",
          xboxXuid: "2533274",
        }),
      );

      const expiresAtMatch = setCookie?.match(/auth-session=[^]*?Expires=([^;]+GMT)/);
      expect(expiresAtMatch).not.toBeNull();
      const cookieExpiresAt = Date.parse(expiresAtMatch?.[1] ?? "");
      expect(cookieExpiresAt).toBeGreaterThan(accessTokenExpiresAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes login even when the Xbox profile lookup fails", async () => {
    let attachSessionProfileSpy!: ReturnType<typeof vi.spyOn>;
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
        redirectTo: "/",
      });
      vi.spyOn(services.authService, "createSessionToken").mockResolvedValue("signed-session-token");
      vi.spyOn(services.xboxService, "getUserFromMicrosoftAccessToken").mockRejectedValue(
        new Error("Xbox unavailable"),
      );
      attachSessionProfileSpy = vi.spyOn(services.authService, "attachSessionProfile").mockResolvedValue();
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
    expect(res.headers.get("Location")).toBe(`${env.PAGES_URL}/`);
    expect(res.headers.get("Set-Cookie")).toContain("auth-session=signed-session-token");
    // Lookup failed, but the attempt is still recorded (marker only) so the session route's
    // lazy re-enrichment won't retry on every request.
    expect(attachSessionProfileSpy).toHaveBeenCalledTimes(1);
    expect(attachSessionProfileSpy).toHaveBeenCalledWith("session-123", expect.anything());
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
