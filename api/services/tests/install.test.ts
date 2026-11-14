import { afterEach, describe, expect, it, vi } from "vitest";
import { aFakeEnvWith } from "../../base/fakes/env.fake";
import { installServices } from "../install";
import { CustomSpartanTokenProvider } from "../halo/custom-spartan-token-provider";

describe("installServices", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the authenticated Halo API in development", async () => {
    vi.spyOn(CustomSpartanTokenProvider.prototype, "getSpartanToken").mockResolvedValue("bot-spartan-token");
    const user = { xuid: "123", gamertag: "example" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(user)));
    const services = installServices({
      env: aFakeEnvWith({ MODE: "development" }),
    });

    await expect(services.haloInfiniteClient.getUser("example")).resolves.toEqual(user);

    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "https://profile.svc.halowaypoint.com:443/users/gt(example)",
      expect.objectContaining({ method: "get" }),
    );
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("x-343-authorization-spartan")).toBe("bot-spartan-token");
  });

  it("passes configured Microsoft tenant and scopes into the auth service", async () => {
    const services = installServices({
      env: aFakeEnvWith({
        MICROSOFT_SCOPES: "openid email XboxLive.signin",
        MICROSOFT_TENANT: "common",
      }),
    });

    const { url } = await services.authService.generateAuthorizationUrl();

    expect(url.pathname).toContain("/common/oauth2/v2.0/authorize");
    expect(url.searchParams.get("scope")).toBe("openid email XboxLive.signin");
  });

  it("uses the dedicated token encryption secret instead of the csrf secret", () => {
    expect(() =>
      installServices({
        env: aFakeEnvWith({
          TOKEN_ENCRYPTION_SECRET: "c".repeat(64),
        }),
      }),
    ).not.toThrow();
  });
});
