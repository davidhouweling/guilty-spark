import type { AutoRouterType } from "itty-router";
import { AutoRouter } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aFakeEnvWith } from "../../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../../services/fakes/services";
import { authMicrosoftStartRoute } from "../start";

describe("GET /auth/microsoft/start", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = AutoRouter();
  });

  it("adds credentialed CORS headers for allowed origins", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "generateAuthorizationUrl").mockResolvedValue({
        url: new URL("https://login.microsoftonline.com/test"),
        state: "state-123",
        codeVerifier: "verifier-123",
      });
      vi.spyOn(services.authService, "setPkceStateCookie").mockResolvedValue();
      return services;
    });

    authMicrosoftStartRoute(router, localInstallServices);

    const req = new Request("http://localhost/auth/microsoft/start", {
      method: "GET",
      headers: {
        Origin: env.PAGES_URL,
      },
    });
    const res = (await router.fetch(req, env)) as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(env.PAGES_URL);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
