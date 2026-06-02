import type { AutoRouterType } from "itty-router";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as HaloInfiniteApi from "halo-infinite-api";
import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import type { TokenInfo } from "../../../services/xbox/types";
import type { XboxService } from "../../../services/xbox/xbox";
import type { UserTokenProvider } from "../../../services/halo/user-token-provider";
import type { DatabaseService } from "../../../services/database/database";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeCacheStorage } from "../../../base/fakes/cache.fake";
import { aFakeHaloInfiniteClient } from "../../../services/halo/fakes/infinite-client.fake";
import { aFakeLinkedIdentitiesRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { haloProxyRoutesRegisterHandler } from "../halo-proxy";

vi.mock("halo-infinite-api", async (importOriginal) => {
  const actual = await importOriginal<typeof HaloInfiniteApi>();
  return {
    ...actual,
    StaticXstsTicketTokenSpartanTokenProvider: vi.fn(),
    HaloInfiniteClient: vi.fn(),
  };
});

function getRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("/proxy/halo-infinite/:operation route", () => {
  let env: Env;
  let router: AutoRouterType;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
    ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
    vi.stubGlobal("caches", aFakeCacheStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 404 for an operation outside the allowlist", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      getRequest("http://localhost/proxy/halo-infinite/deleteUser"),
      env,
      ctx,
    )) as Response;

    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Operation not found");
  });

  it("returns 405 for a non-GET method on an allowlisted operation", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/proxy/halo-infinite/getUser", { method: "POST" });
    const res = (await router.fetch(req, env, ctx)) as Response;

    expect(res.status).toBe(405);
    expect(await res.text()).toBe("Method not allowed");
  });

  it("derives the client from a valid session via the session XSTS token", async () => {
    const sessionClient = aFakeHaloInfiniteClient();
    const sessionGetUserSpy = vi.spyOn(sessionClient, "getUser");
    let exchangeSpy!: MockInstance<XboxService["exchangeMicrosoftAccessTokenForXstsToken"]>;
    vi.mocked(StaticXstsTicketTokenSpartanTokenProvider).mockClear();
    vi.mocked(HaloInfiniteClient).mockClear();
    vi.mocked(HaloInfiniteClient).mockImplementation(function () {
      return sessionClient;
    });

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue({
        sessionId: "session-123",
        userId: "user-123",
        accessToken: "access-token",
        refreshToken: undefined,
        expiresAt: Date.now() + 3600000,
        isExpired: false,
      });
      exchangeSpy = vi.spyOn(services.xboxService, "exchangeMicrosoftAccessTokenForXstsToken").mockResolvedValue({
        XSTSToken: "session-xsts-token",
        userHash: "session-user-hash",
        expiresOn: new Date("2025-01-01T06:00:00.000Z"),
      } satisfies TokenInfo);
      return services;
    });
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22", {
      method: "GET",
      headers: { cookie: "auth-session=valid-token" },
    });
    const res = (await router.fetch(req, env, ctx)) as Response;

    expect(res.status).toBe(200);
    expect(exchangeSpy).toHaveBeenCalledWith("access-token");
    expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).toHaveBeenCalledWith("session-xsts-token");
    expect(sessionGetUserSpy).toHaveBeenCalledWith("discord_user_01");
  });

  it("prefers the session client and ignores the gamertag when both are present", async () => {
    const sessionClient = aFakeHaloInfiniteClient();
    const sessionGetUserSpy = vi.spyOn(sessionClient, "getUser");
    vi.mocked(HaloInfiniteClient).mockClear();
    vi.mocked(HaloInfiniteClient).mockImplementation(function () {
      return sessionClient;
    });
    let getClientForUserSpy!: MockInstance<UserTokenProvider["getClientForUser"]>;
    let findIdentitySpy!: MockInstance<DatabaseService["findActiveXboxIdentityByGamertag"]>;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.authService, "validateSession").mockResolvedValue({
        sessionId: "session-123",
        userId: "user-123",
        accessToken: "access-token",
        refreshToken: undefined,
        expiresAt: Date.now() + 3600000,
        isExpired: false,
      });
      vi.spyOn(services.xboxService, "exchangeMicrosoftAccessTokenForXstsToken").mockResolvedValue({
        XSTSToken: "session-xsts-token",
        userHash: "session-user-hash",
        expiresOn: new Date("2025-01-01T06:00:00.000Z"),
      } satisfies TokenInfo);
      findIdentitySpy = vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag");
      getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser");
      return services;
    });
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const req = new Request(
      "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22&gamertag=OwnerTag",
      {
        method: "GET",
        headers: { cookie: "auth-session=valid-token" },
      },
    );
    const res = (await router.fetch(req, env, ctx)) as Response;

    expect(res.status).toBe(200);
    expect(sessionGetUserSpy).toHaveBeenCalledWith("discord_user_01");
    expect(findIdentitySpy).not.toHaveBeenCalled();
    expect(getClientForUserSpy).not.toHaveBeenCalled();
  });

  it("uses the owner client when a gamertag resolves to an active xbox identity without a session", async () => {
    const ownerClient = aFakeHaloInfiniteClient();
    const ownerGetUserSpy = vi.spyOn(ownerClient, "getUser");
    let getClientForUserSpy!: MockInstance<UserTokenProvider["getClientForUser"]>;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(
        aFakeLinkedIdentitiesRow({ UserId: "owner-user-1", Gamertag: "OwnerTag", IsActive: 1, Provider: "xbox" }),
      );
      getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(ownerClient);
      return services;
    });
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const req = getRequest("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22&gamertag=OwnerTag");
    const res = (await router.fetch(req, env, ctx)) as Response;

    expect(res.status).toBe(200);
    expect(getClientForUserSpy).toHaveBeenCalledWith("owner-user-1");
    expect(ownerGetUserSpy).toHaveBeenCalledWith("discord_user_01");
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("xsts");
  });

  it("falls back to the bot client when there is no session and no gamertag", async () => {
    const botClient = aFakeHaloInfiniteClient();
    const botGetUserSpy = vi.spyOn(botClient, "getUser");
    vi.mocked(StaticXstsTicketTokenSpartanTokenProvider).mockClear();
    let getClientForUserSpy!: MockInstance<UserTokenProvider["getClientForUser"]>;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env, haloInfiniteClient: botClient });
      getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser");
      return services;
    });
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const req = getRequest("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22");
    const res = (await router.fetch(req, env, ctx)) as Response;

    expect(res.status).toBe(200);
    expect(botGetUserSpy).toHaveBeenCalledWith("discord_user_01");
    expect(getClientForUserSpy).not.toHaveBeenCalled();
    expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).not.toHaveBeenCalled();
  });

  it("falls back to the bot client when the gamertag has no active xbox identity", async () => {
    const botClient = aFakeHaloInfiniteClient();
    const botGetUserSpy = vi.spyOn(botClient, "getUser");
    let getClientForUserSpy!: MockInstance<UserTokenProvider["getClientForUser"]>;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env, haloInfiniteClient: botClient });
      vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(null);
      getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser");
      return services;
    });
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const req = getRequest("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22&gamertag=Unknown");
    const res = (await router.fetch(req, env, ctx)) as Response;

    expect(res.status).toBe(200);
    expect(botGetUserSpy).toHaveBeenCalledWith("discord_user_01");
    expect(getClientForUserSpy).not.toHaveBeenCalled();
  });

  it("serves a second request with a different gamertag from the gamertag-stripped cache entry", async () => {
    const cache = caches.default;
    const ownerClient = aFakeHaloInfiniteClient();
    const ownerGetUserSpy = vi.spyOn(ownerClient, "getUser");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(
        aFakeLinkedIdentitiesRow({ UserId: "owner-user-1", Gamertag: "OwnerTag" }),
      );
      vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(ownerClient);
      return services;
    });
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const baseUrl = "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22";

    const firstRes = (await router.fetch(getRequest(`${baseUrl}&gamertag=OwnerTag`), env, ctx)) as Response;
    expect(firstRes.status).toBe(200);
    expect(ownerGetUserSpy).toHaveBeenCalledTimes(1);

    const stored = await cache.match(getRequest(baseUrl));
    expect(stored).toBeDefined();

    const secondRes = (await router.fetch(getRequest(`${baseUrl}&gamertag=SomeoneElse`), env, ctx)) as Response;
    expect(secondRes.status).toBe(200);
    expect(ownerGetUserSpy).toHaveBeenCalledTimes(1);
  });

  it("stores a successful 200 response in the cache", async () => {
    const cache = caches.default;
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const url = "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22";
    const res = (await router.fetch(getRequest(url), env, ctx)) as Response;
    expect(res.status).toBe(200);

    const stored = await cache.match(getRequest(url));
    expect(stored).toBeDefined();
    expect(stored?.status).toBe(200);
  });

  it("does not cache a non-200 error response", async () => {
    const cache = caches.default;
    const botClient = aFakeHaloInfiniteClient();
    vi.spyOn(botClient, "getUser").mockRejectedValue(new Error("fail!"));
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() =>
      installFakeServicesWith({ env, haloInfiniteClient: botClient }),
    );
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const url = "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22";
    const res = (await router.fetch(getRequest(url), env, ctx)) as Response;
    expect(res.status).toBe(500);

    const stored = await cache.match(getRequest(url));
    expect(stored).toBeUndefined();
  });

  it("sets the per-operation Cache-Control header on a successful response", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const url = "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22";
    const res = (await router.fetch(getRequest(url), env, ctx)) as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400, stale-while-revalidate=3600");
  });
});
