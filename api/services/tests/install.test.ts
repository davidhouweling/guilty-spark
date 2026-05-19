import { describe, expect, it } from "vitest";
import { aFakeEnvWith } from "../../base/fakes/env.fake";
import { installServices } from "../install";

describe("installServices", () => {
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
