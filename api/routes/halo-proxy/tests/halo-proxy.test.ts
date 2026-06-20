import type { AutoRouterType } from "itty-router";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as HaloInfiniteApi from "halo-infinite-api";
import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import * as haloProxyOperations from "@guilty-spark/shared/halo/halo-infinite-proxy-operations";
import type { TokenInfo } from "../../../services/xbox/types";
import type { XboxService } from "../../../services/xbox/xbox";
import type { UserTokenProvider } from "../../../services/halo/user-token-provider";
import type { DatabaseService } from "../../../services/database/database";
import type { AuthService } from "../../../services/auth/auth";
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

  it("returns 404 when an allowlisted operation cannot be resolved", async () => {
    const resolveSpy = vi.spyOn(haloProxyOperations, "resolveHaloProxyOperation").mockReturnValue(null);
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(getRequest("http://localhost/proxy/halo-infinite/getUser"), env, ctx)) as Response;

    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Operation not found: getUser");
    resolveSpy.mockRestore();
  });

  it("derives the client from a valid session via the session XSTS token", async () => {
    const sessionClient = aFakeHaloInfiniteClient();
    const sessionGetUserSpy = vi.spyOn(sessionClient, "getUser");
    let exchangeSpy!: MockInstance<XboxService["exchangeMicrosoftAccessTokenForXstsToken"]>;
    let cacheHaloXstsTokenSpy!: MockInstance<AuthService["cacheHaloXstsTokenForSession"]>;
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
      vi.spyOn(services.authService, "getCachedHaloXstsTokenForSession").mockResolvedValue(null);
      cacheHaloXstsTokenSpy = vi.spyOn(services.authService, "cacheHaloXstsTokenForSession").mockResolvedValue();
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
    expect(cacheHaloXstsTokenSpy).toHaveBeenCalledWith(
      "session-123",
      expect.objectContaining({ XSTSToken: "session-xsts-token" }),
    );
    expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).toHaveBeenCalledWith("session-xsts-token");
    expect(sessionGetUserSpy).toHaveBeenCalledWith("discord_user_01");
  });

  it("reuses cached session XSTS token and skips token exchange", async () => {
    const sessionClient = aFakeHaloInfiniteClient();
    const sessionGetUserSpy = vi.spyOn(sessionClient, "getUser");
    let exchangeSpy!: MockInstance<XboxService["exchangeMicrosoftAccessTokenForXstsToken"]>;
    let cacheHaloXstsTokenSpy!: MockInstance<AuthService["cacheHaloXstsTokenForSession"]>;

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
      vi.spyOn(services.authService, "getCachedHaloXstsTokenForSession").mockResolvedValue({
        XSTSToken: "cached-session-xsts-token",
        userHash: "cached-user-hash",
        expiresOn: new Date(Date.now() + 3600_000),
      });
      cacheHaloXstsTokenSpy = vi.spyOn(services.authService, "cacheHaloXstsTokenForSession").mockResolvedValue();
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
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(cacheHaloXstsTokenSpy).not.toHaveBeenCalled();
    expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).toHaveBeenCalledWith("cached-session-xsts-token");
    expect(sessionGetUserSpy).toHaveBeenCalledWith("discord_user_01");
  });

  it("refreshes an expired session and exchanges token using refreshed access token", async () => {
    const sessionClient = aFakeHaloInfiniteClient();
    const sessionGetUserSpy = vi.spyOn(sessionClient, "getUser");
    let refreshSessionSpy!: MockInstance<AuthService["refreshSession"]>;
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
        accessToken: "expired-access-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() - 1000,
        isExpired: true,
      });
      vi.spyOn(services.authService, "getCachedHaloXstsTokenForSession").mockResolvedValue(null);
      refreshSessionSpy = vi.spyOn(services.authService, "refreshSession").mockResolvedValue({
        sessionId: "session-123",
        userId: "user-123",
        accessToken: "refreshed-access-token",
        refreshToken: "rotated-refresh-token",
        expiresAt: Date.now() + 3600_000,
        issuedAt: Date.now(),
      });
      vi.spyOn(services.authService, "cacheHaloXstsTokenForSession").mockResolvedValue();
      exchangeSpy = vi.spyOn(services.xboxService, "exchangeMicrosoftAccessTokenForXstsToken").mockResolvedValue({
        XSTSToken: "refreshed-session-xsts-token",
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
    expect(refreshSessionSpy).toHaveBeenCalledOnce();
    expect(exchangeSpy).toHaveBeenCalledWith("refreshed-access-token");
    expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).toHaveBeenCalledWith("refreshed-session-xsts-token");
    expect(sessionGetUserSpy).toHaveBeenCalledWith("discord_user_01");
  });

  it("returns 401 and clears cookie when refreshing an expired session throws", async () => {
    let clearSessionCookieSpy!: MockInstance<AuthService["clearSessionCookie"]>;
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
      vi.spyOn(services.authService, "getCachedHaloXstsTokenForSession").mockResolvedValue(null);
      vi.spyOn(services.authService, "refreshSession").mockRejectedValue(new Error("refresh failed"));
      clearSessionCookieSpy = vi.spyOn(services.authService, "clearSessionCookie");
      return services;
    });
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22", {
      method: "GET",
      headers: { cookie: "auth-session=valid-token" },
    });
    const res = (await router.fetch(req, env, ctx)) as Response;

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
    expect(clearSessionCookieSpy).toHaveBeenCalledOnce();
  });

  it("returns 401 and clears cookie when refreshing an expired session returns null", async () => {
    let clearSessionCookieSpy!: MockInstance<AuthService["clearSessionCookie"]>;
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
      vi.spyOn(services.authService, "getCachedHaloXstsTokenForSession").mockResolvedValue(null);
      vi.spyOn(services.authService, "refreshSession").mockResolvedValue(null);
      clearSessionCookieSpy = vi.spyOn(services.authService, "clearSessionCookie");
      return services;
    });
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22", {
      method: "GET",
      headers: { cookie: "auth-session=valid-token" },
    });
    const res = (await router.fetch(req, env, ctx)) as Response;

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
    expect(clearSessionCookieSpy).toHaveBeenCalledOnce();
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

  it("falls back to the bot client when owner identity lookup throws", async () => {
    const botClient = aFakeHaloInfiniteClient();
    const botGetUserSpy = vi.spyOn(botClient, "getUser");
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env, haloInfiniteClient: botClient });
      vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockRejectedValue(new Error("db down"));
      return services;
    });
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const req = getRequest("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22&gamertag=OwnerTag");
    const res = (await router.fetch(req, env, ctx)) as Response;

    expect(res.status).toBe(200);
    expect(botGetUserSpy).toHaveBeenCalledWith("discord_user_01");
  });

  it("returns 400 when proxy args cannot be parsed", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => installFakeServicesWith({ env }));
    haloProxyRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      getRequest("http://localhost/proxy/halo-infinite/getUser?arg=not-json"),
      env,
      ctx,
    )) as Response;

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid query arguments");
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
