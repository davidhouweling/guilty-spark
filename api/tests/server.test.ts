import type { MockInstance } from "vitest";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import type * as HaloInfiniteApi from "halo-infinite-api";
import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import { installFakeServicesWith } from "../services/fakes/services";
import { createApiRouter } from "../base/router";
import { Server } from "../server";
import { aFakeEnvWith } from "../base/fakes/env.fake";
import { aFakeCacheStorage } from "../base/fakes/cache.fake";
import { aFakeHaloInfiniteClient } from "../services/halo/fakes/infinite-client.fake";
import { aFakeLinkedIdentitiesRow } from "../services/database/fakes/database.fake";
import type { TokenInfo } from "../services/xbox/types";

vi.mock("halo-infinite-api", async (importOriginal) => {
  const actual = await importOriginal<typeof HaloInfiniteApi>();
  return {
    ...actual,
    AutoTokenProvider: vi.fn(),
    StaticXstsTicketTokenSpartanTokenProvider: vi.fn(),
    HaloInfiniteClient: vi.fn(),
  };
});

describe("Server", () => {
  let env: Env;
  let installServices: typeof installFakeServicesWith;
  let server: Server;

  beforeEach(() => {
    env = aFakeEnvWith();
    installServices = installFakeServicesWith;
    server = new Server({
      router: createApiRouter(),
      installServices,
    });
  });

  describe("GET /", () => {
    it("responds with a welcome message containing the DISCORD_APP_ID", async () => {
      const req = new Request("http://localhost/", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(text).toContain(env.DISCORD_APP_ID);
      expect(text).toContain("Guilty Spark");
    });
  });

  describe("Unknown route", () => {
    it("responds with 404", async () => {
      const req = new Request("http://localhost/unknown", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe("Not Found.");
    });
  });

  describe("OPTIONS /auth/*", () => {
    it("returns credentialed preflight headers for allowed origins", async () => {
      const req = new Request("http://localhost/auth/session", {
        method: "OPTIONS",
        headers: {
          Origin: env.PAGES_URL,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(env.PAGES_URL);
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });
  });

  describe("/proxy/halo-infinite/:operation", () => {
    let ctx: EventContext<Env, "", unknown>;

    beforeEach(() => {
      vi.stubGlobal("caches", aFakeCacheStorage());
      ctx = { waitUntil: vi.fn() } as unknown as EventContext<Env, "", unknown>;
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns 404 when the operation is not in the allowlist", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite/notARealMethod", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toContain("Operation not found");
    });

    it("returns 405 when the HTTP method does not match the operation definition", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite/getUser", {
        method: "POST",
        body: JSON.stringify({ args: ["discord_user_01"] }),
        headers: { "content-type": "application/json" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(405);
      const text = await res.text();
      expect(text).toBe("Method not allowed");
    });

    it("falls back to the bot account client when there is no session", async () => {
      vi.mocked(StaticXstsTicketTokenSpartanTokenProvider).mockClear();
      const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22", {
        method: "GET",
      });
      const res = (await server.router.fetch(req, env, ctx)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        xuid: "0000000000001",
        gamerpic: {
          small: "small01.png",
          medium: "medium01.png",
          large: "large01.png",
          xlarge: "xlarge01.png",
        },
        gamertag: "gamertag01",
      });

      expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).not.toHaveBeenCalled();
    });

    it("sets a Cache-Control header derived from the operation TTL", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22", {
        method: "GET",
      });
      const res = (await server.router.fetch(req, env, ctx)) as Response;
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400, stale-while-revalidate=3600");
    });

    it("returns 200 for the multi-user GET operation with the array argument round-tripped through the query", async () => {
      vi.mocked(StaticXstsTicketTokenSpartanTokenProvider).mockClear();
      const arg = encodeURIComponent(JSON.stringify(["xuid0000000000001"]));
      const req = new Request(`http://localhost/proxy/halo-infinite/getUsers?arg=${arg}`, {
        method: "GET",
      });
      const res = (await server.router.fetch(req, env, ctx)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([
        {
          xuid: "0000000000001",
          gamerpic: {
            small: "small0000000000001.png",
            medium: "medium0000000000001.png",
            large: "large0000000000001.png",
            xlarge: "xlarge0000000000001.png",
          },
          gamertag: "gamertag0000000000001",
        },
      ]);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=3600");
    });

    it("returns 400 for a GET operation with non-JSON query arguments", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=not-json", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("Invalid query arguments");
    });

    it("derives the user spartan token from a valid session", async () => {
      const fakeClient = aFakeHaloInfiniteClient();
      let exchangeMicrosoftAccessTokenForXstsTokenSpy!: MockInstance;
      vi.mocked(StaticXstsTicketTokenSpartanTokenProvider).mockClear();
      vi.mocked(HaloInfiniteClient).mockClear();
      vi.mocked(HaloInfiniteClient).mockImplementation(function () {
        return fakeClient;
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
        exchangeMicrosoftAccessTokenForXstsTokenSpy = vi
          .spyOn(services.xboxService, "exchangeMicrosoftAccessTokenForXstsToken")
          .mockResolvedValue({
            XSTSToken: "valid-xsts-token",
            userHash: "valid-user-hash",
            expiresOn: new Date("2025-01-01T06:00:00.000Z"),
          } satisfies TokenInfo);
        return services;
      });
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22", {
        method: "GET",
        headers: { cookie: "auth-session=valid-token", Origin: env.PAGES_URL },
      });
      const res = (await server.router.fetch(req, env, ctx)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        xuid: "0000000000001",
        gamerpic: {
          small: "small01.png",
          medium: "medium01.png",
          large: "large01.png",
          xlarge: "xlarge01.png",
        },
        gamertag: "gamertag01",
      });

      expect(exchangeMicrosoftAccessTokenForXstsTokenSpy).toHaveBeenCalledWith("access-token");
      expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).toHaveBeenCalledWith("valid-xsts-token");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(env.PAGES_URL);
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    it("refreshes an expired session without rotating the cookie", async () => {
      const fakeClient = aFakeHaloInfiniteClient();
      let exchangeMicrosoftAccessTokenForXstsTokenSpy!: MockInstance;
      vi.mocked(StaticXstsTicketTokenSpartanTokenProvider).mockClear();
      vi.mocked(HaloInfiniteClient).mockClear();
      vi.mocked(HaloInfiniteClient).mockImplementation(function () {
        return fakeClient;
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
        vi.spyOn(services.authService, "refreshSession").mockResolvedValue({
          sessionId: "session-123",
          userId: "user-123",
          accessToken: "fresh-access-token",
          refreshToken: "fresh-refresh-token",
          expiresAt: Date.now() + 3600000,
          issuedAt: Date.now(),
        });
        exchangeMicrosoftAccessTokenForXstsTokenSpy = vi
          .spyOn(services.xboxService, "exchangeMicrosoftAccessTokenForXstsToken")
          .mockResolvedValue({
            XSTSToken: "fresh-xsts-token",
            userHash: "fresh-user-hash",
            expiresOn: new Date("2025-01-01T06:00:00.000Z"),
          } satisfies TokenInfo);
        return services;
      });
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22", {
        method: "GET",
        headers: { cookie: "auth-session=expired-token" },
      });
      const res = (await server.router.fetch(req, env, ctx)) as Response;
      expect(res.status).toBe(200);
      expect(res.headers.get("Set-Cookie")).toBeNull();

      expect(exchangeMicrosoftAccessTokenForXstsTokenSpy).toHaveBeenCalledWith("fresh-access-token");
      expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).toHaveBeenCalledWith("fresh-xsts-token");
    });

    it("returns 401 and clears the cookie when an expired session cannot be refreshed", async () => {
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
        vi.spyOn(services.authService, "refreshSession").mockResolvedValue(null);
        return services;
      });
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22", {
        method: "GET",
        headers: { cookie: "auth-session=expired-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
      expect(res.headers.get("Set-Cookie")).toContain("auth-session=");
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("returns 500 with a generic error if the operation throws", async () => {
      const localHaloInfiniteClient = aFakeHaloInfiniteClient();
      vi.spyOn(localHaloInfiniteClient, "getUser").mockRejectedValue(new Error("fail!"));
      const localInstallServices = vi.fn<typeof installServices>(() => ({
        ...installFakeServicesWith({ env }),
        haloInfiniteClient: localHaloInfiniteClient,
      }));
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });
      const req = new Request("http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22", {
        method: "GET",
      });
      const res = (await server.router.fetch(req, env, ctx)) as Response;
      expect(res.status).toBe(500);
      const body = await res.json<{ error: string }>();
      expect(body).toEqual({ error: "Proxy request failed" });
    });

    it("stores a successful GET response into the edge cache on a miss", async () => {
      const cache = caches.default;
      const url = "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22";

      const firstReq = new Request(url, { method: "GET" });
      const firstRes = (await server.router.fetch(firstReq, env, ctx)) as Response;
      expect(firstRes.status).toBe(200);
      expect(firstRes.headers.get("Cache-Control")).toBe("public, max-age=86400, stale-while-revalidate=3600");

      const stored = await cache.match(new Request(url, { method: "GET" }));
      expect(stored).toBeDefined();
      expect(stored?.status).toBe(200);
      expect(await stored?.json()).toEqual({
        xuid: "0000000000001",
        gamerpic: {
          small: "small01.png",
          medium: "medium01.png",
          large: "large01.png",
          xlarge: "xlarge01.png",
        },
        gamertag: "gamertag01",
      });
    });

    it("serves a cache hit without invoking the Halo client a second time", async () => {
      const localHaloInfiniteClient = aFakeHaloInfiniteClient();
      const getUserSpy = vi.spyOn(localHaloInfiniteClient, "getUser");
      const localInstallServices = vi.fn<typeof installServices>(() => ({
        ...installFakeServicesWith({ env }),
        haloInfiniteClient: localHaloInfiniteClient,
      }));
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const url = "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22";

      const firstRes = (await server.router.fetch(new Request(url, { method: "GET" }), env, ctx)) as Response;
      expect(firstRes.status).toBe(200);
      expect(getUserSpy).toHaveBeenCalledTimes(1);

      const secondRes = (await server.router.fetch(new Request(url, { method: "GET" }), env, ctx)) as Response;
      expect(secondRes.status).toBe(200);
      expect(await secondRes.json()).toEqual({
        xuid: "0000000000001",
        gamerpic: {
          small: "small01.png",
          medium: "medium01.png",
          large: "large01.png",
          xlarge: "xlarge01.png",
        },
        gamertag: "gamertag01",
      });
      expect(getUserSpy).toHaveBeenCalledTimes(1);
    });

    it("does not cache a non-200 response", async () => {
      const cache = caches.default;
      const localHaloInfiniteClient = aFakeHaloInfiniteClient();
      vi.spyOn(localHaloInfiniteClient, "getUser").mockRejectedValue(new Error("fail!"));
      const localInstallServices = vi.fn<typeof installServices>(() => ({
        ...installFakeServicesWith({ env }),
        haloInfiniteClient: localHaloInfiniteClient,
      }));
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const url = "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22";
      const res = (await server.router.fetch(new Request(url, { method: "GET" }), env, ctx)) as Response;
      expect(res.status).toBe(500);

      const stored = await cache.match(new Request(url, { method: "GET" }));
      expect(stored).toBeUndefined();
    });

    it("uses the owner's client when a known gamertag resolves to an active xbox identity", async () => {
      const ownerClient = aFakeHaloInfiniteClient();
      let getClientForUserSpy!: MockInstance;
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(
          aFakeLinkedIdentitiesRow({ UserId: "owner-user-1", Gamertag: "OwnerTag", IsActive: 1, Provider: "xbox" }),
        );
        getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(ownerClient);
        return services;
      });
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const req = new Request(
        "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22&gamertag=OwnerTag",
        {
          method: "GET",
        },
      );
      const res = (await server.router.fetch(req, env, ctx)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(getClientForUserSpy).toHaveBeenCalledWith("owner-user-1");
      expect(ownerClient.getUser).toHaveBeenCalledWith("discord_user_01");
      // The owner's spartan/XSTS/access token is never returned to the browser; only the Halo result is.
      expect(JSON.stringify(body)).not.toContain("xsts");
      expect(JSON.stringify(body)).not.toContain("token");
    });

    it("falls back to the bot client when the gamertag has no active xbox identity", async () => {
      const botClient = aFakeHaloInfiniteClient();
      const botGetUserSpy = vi.spyOn(botClient, "getUser");
      let getClientForUserSpy!: MockInstance;
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env, haloInfiniteClient: botClient });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(null);
        getClientForUserSpy = vi.spyOn(services.userTokenProvider, "getClientForUser");
        return services;
      });
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const req = new Request(
        "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22&gamertag=Unknown",
        {
          method: "GET",
        },
      );
      const res = (await server.router.fetch(req, env, ctx)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ xuid: "0000000000001", gamertag: "gamertag01" });

      expect(getClientForUserSpy).not.toHaveBeenCalled();
      expect(botGetUserSpy).toHaveBeenCalledWith("discord_user_01");
    });

    it("falls back to the bot client when owner credentials cannot mint a client", async () => {
      const botClient = aFakeHaloInfiniteClient();
      const botGetUserSpy = vi.spyOn(botClient, "getUser");
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env, haloInfiniteClient: botClient });
        vi.spyOn(services.databaseService, "findActiveXboxIdentityByGamertag").mockResolvedValue(
          aFakeLinkedIdentitiesRow({ UserId: "owner-user-1", Gamertag: "OwnerTag" }),
        );
        vi.spyOn(services.userTokenProvider, "getClientForUser").mockResolvedValue(null);
        return services;
      });
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const req = new Request(
        "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22&gamertag=OwnerTag",
        {
          method: "GET",
        },
      );
      const res = (await server.router.fetch(req, env, ctx)) as Response;
      expect(res.status).toBe(200);
      expect(botGetUserSpy).toHaveBeenCalledWith("discord_user_01");
    });

    it("shares the same cache key whether or not the gamertag query param is present", async () => {
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
      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const baseUrl = "http://localhost/proxy/halo-infinite/getUser?arg=%22discord_user_01%22";

      // Populate the cache via a request that carries ?gamertag=.
      const ownerReq = new Request(`${baseUrl}&gamertag=OwnerTag`, { method: "GET" });
      const ownerRes = (await server.router.fetch(ownerReq, env, ctx)) as Response;
      expect(ownerRes.status).toBe(200);
      expect(ownerGetUserSpy).toHaveBeenCalledTimes(1);

      // The cache entry is keyed without the gamertag param, so a plain request hits the SAME entry.
      const storedWithoutGamertag = await cache.match(new Request(baseUrl, { method: "GET" }));
      expect(storedWithoutGamertag).toBeDefined();

      // A subsequent route request with a DIFFERENT gamertag is served from that shared entry
      // (the gamertag is stripped before keying), so the Halo client is not invoked again.
      const otherReq = new Request(`${baseUrl}&gamertag=SomeoneElse`, { method: "GET" });
      const otherRes = (await server.router.fetch(otherReq, env, ctx)) as Response;
      expect(otherRes.status).toBe(200);
      expect(ownerGetUserSpy).toHaveBeenCalledTimes(1);

      // And a plain request (no gamertag) is likewise served from the same shared entry.
      const plainReq = new Request(baseUrl, { method: "GET" });
      const plainRes = (await server.router.fetch(plainReq, env, ctx)) as Response;
      expect(plainRes.status).toBe(200);
      expect(ownerGetUserSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("OPTIONS /proxy/halo-infinite/:operation", () => {
    it("returns credentialed preflight headers for allowed origins", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite/getUser", {
        method: "OPTIONS",
        headers: {
          Origin: env.PAGES_URL,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(env.PAGES_URL);
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });
  });

  describe("POST /neatqueue", () => {
    it("returns 401 when verification fails", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.neatQueueService, "verifyRequest").mockResolvedValue({
          isValid: false,
          rawBody: "invalid-body",
        });
        return services;
      });

      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const req = new Request("http://localhost/neatqueue", {
        method: "POST",
        body: JSON.stringify({ action: "test" }),
        headers: {
          "content-type": "application/json",
          "x-neatqueue-signature": "invalid-signature",
        },
      });

      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const res = (await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Bad request signature.");
    });

    it("returns 500 on internal error", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.neatQueueService, "verifyRequest").mockRejectedValue(new Error("Internal failure"));
        return services;
      });

      server = new Server({
        router: createApiRouter(),
        installServices: localInstallServices,
      });

      const req = new Request("http://localhost/neatqueue", {
        method: "POST",
        body: JSON.stringify({ action: "test" }),
        headers: {
          "content-type": "application/json",
          "x-neatqueue-signature": "valid-signature",
        },
      });

      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const res = (await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toBe("Internal error");
    });
  });

  describe("GET /ws/tracker/:guildId/:queueNumber", () => {
    it("returns 400 when queueNumber is not a valid number", async () => {
      const req = new Request("http://localhost/ws/tracker/guild123/notanumber", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("Invalid queue number");
    });

    it("returns 500 on internal error", async () => {
      const fakeEnv = aFakeEnvWith();

      vi.spyOn(fakeEnv.LIVE_TRACKER_DO, "idFromName").mockImplementation(() => {
        throw new Error("DO error");
      });

      const req = new Request("http://localhost/ws/tracker/guild123/42", { method: "GET" });
      const res = (await server.router.fetch(req, fakeEnv)) as Response;
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toBe("Internal Server Error");
    });
  });
});
