import type { MockInstance } from "vitest";
import { describe, it, beforeEach, expect, vi } from "vitest";
import type * as HaloInfiniteApi from "halo-infinite-api";
import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import { installFakeServicesWith } from "../services/fakes/services";
import { createApiRouter } from "../base/router";
import { Server } from "../server";
import { aFakeEnvWith } from "../base/fakes/env.fake";
import { aFakeHaloInfiniteClient } from "../services/halo/fakes/infinite-client.fake";
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
      const res = (await server.router.fetch(req, env)) as Response;
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
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400, stale-while-revalidate=3600");
    });

    it("returns 200 for a POST operation with arguments parsed from the JSON body", async () => {
      vi.mocked(StaticXstsTicketTokenSpartanTokenProvider).mockClear();
      const req = new Request("http://localhost/proxy/halo-infinite/getUsers", {
        method: "POST",
        body: JSON.stringify({ args: [["xuid0000000000001"]] }),
        headers: { "content-type": "application/json" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
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

    it("returns 400 for a POST operation with an invalid JSON body", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite/getUsers", {
        method: "POST",
        body: "{not-json}",
        headers: { "content-type": "application/json" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("Invalid JSON body");
    });

    it("returns 400 for a POST operation when the body args field is missing", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite/getUsers", {
        method: "POST",
        body: JSON.stringify({ foo: "bar" }),
        headers: { "content-type": "application/json" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("Invalid request format");
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
      const res = (await server.router.fetch(req, env)) as Response;
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
      const res = (await server.router.fetch(req, env)) as Response;
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
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(500);
      const body = await res.json<{ error: string }>();
      expect(body).toEqual({ error: "Proxy request failed" });
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
