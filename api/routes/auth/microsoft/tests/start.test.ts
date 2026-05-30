import type { AutoRouterType } from "itty-router";
import { AutoRouter } from "itty-router";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aFakeEnvWith } from "../../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../../services/fakes/services";
import { authMicrosoftStartRoute } from "../start";
import type { AuthService } from "../../../../services/auth/auth";

describe("GET /auth/microsoft/start", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = AutoRouter();
  });

  it("redirects to the Microsoft authorization URL with credentialed CORS headers", async () => {
    let setPkceStateCookieSpy!: MockInstance<AuthService["setPkceStateCookie"]>;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "generateAuthorizationUrl").mockResolvedValue({
        url: new URL("https://login.microsoftonline.com/test"),
        state: "state-123",
        codeVerifier: "verifier-123",
      });
      setPkceStateCookieSpy = vi.spyOn(services.authService, "setPkceStateCookie").mockResolvedValue();
      return services;
    });

    authMicrosoftStartRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/microsoft/start?redirect=%2Findividual-tracker", {
      method: "GET",
      headers: {
        Origin: env.PAGES_URL,
      },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://login.microsoftonline.com/test");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(env.PAGES_URL);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(setPkceStateCookieSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ redirectTo: "/individual-tracker" }),
    );
  });
});
