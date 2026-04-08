import { describe, it, beforeEach, expect, vi } from "vitest";
import { AutoRouter } from "itty-router";
import { InteractionType } from "discord-api-types/v10";
import { HaloInfiniteClient } from "halo-infinite-api";
import { installFakeServicesWith } from "../services/fakes/services";
import { Server } from "../server";
import { getCommands } from "../commands/commands";
import { aFakeEnvWith } from "../base/fakes/env.fake";
import { aFakeHaloInfiniteClient } from "../services/halo/fakes/infinite-client.fake";
import { pingInteraction } from "../services/discord/fakes/data";

vi.mock("halo-infinite-api", async () => {
  const actual = await import("halo-infinite-api");
  return {
    ...actual,
    AutoTokenProvider: vi.fn(),
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
      router: AutoRouter(),
      installServices,
      getCommands,
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

  describe("POST /auth/logout", () => {
    it("returns 200 and clears the session cookie", async () => {
      const req = new Request("http://localhost/auth/logout", { method: "POST" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json<{ success: boolean }>();
      expect(body).toEqual({ success: true });
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
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/auth/logout", { method: "POST" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(500);
      const body = await res.json<{ error: string }>();
      expect(body).toEqual({ error: "Logout failed" });
    });
  });

  describe("GET /auth/session", () => {
    it("returns 401 with authenticated false when no session cookie is present", async () => {
      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const body = await res.json<{ authenticated: boolean }>();
      expect(body).toEqual({ authenticated: false });
    });

    it("returns 401 with expired flag when session is expired", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() - 1000,
          isExpired: true,
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const body = await res.json<{ authenticated: boolean; expired: boolean }>();
      expect(body).toEqual({ authenticated: false, expired: true });
    });

    it("returns 200 with user info when session is valid", async () => {
      const expiresAt = Date.now() + 3600000;
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt,
          isExpired: false,
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json<{ authenticated: boolean; userId: string; expiresAt: number }>();
      expect(body).toEqual({ authenticated: true, userId: "user-123", expiresAt });
    });

    it("returns 500 with error message when validateSession throws", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockRejectedValue(new Error("Session error"));
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/auth/session", { method: "GET" });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(500);
      const body = await res.json<{ error: string }>();
      expect(body).toEqual({ error: "Failed to retrieve session" });
    });
  });

  describe("POST /proxy/halo-infinite", () => {
    it("returns 401 if x-proxy-auth header is missing", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: [] }),
        headers: { "content-type": "application/json" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
    });

    it("returns 401 if x-proxy-auth header is invalid", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: [] }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": "wrong-token",
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
    });

    it("returns 401 with no authentication and no session cookie", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: [] }),
        headers: { "content-type": "application/json" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
    });

    it("returns 401 with expired session cookie", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() - 1000,
          isExpired: true,
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: [] }),
        headers: { "content-type": "application/json", cookie: "auth-session=expired-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toBe("Unauthorized");
    });

    it("returns 200 and result with valid session cookie", async () => {
      const fakeClient = aFakeHaloInfiniteClient();
      vi.mocked(HaloInfiniteClient).mockImplementation(function () {
        return fakeClient;
      });

      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.authService, "validateSession").mockResolvedValue({
          userId: "user-123",
          accessToken: "access-token",
          refreshToken: undefined,
          expiresAt: Date.now() + 3600000,
          isExpired: false,
        });
        return services;
      });
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: ["discord_user_01"] }),
        headers: { "content-type": "application/json", cookie: "auth-session=valid-token" },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        result: {
          xuid: "0000000000001",
          gamerpic: {
            small: "small01.png",
            medium: "medium01.png",
            large: "large01.png",
            xlarge: "xlarge01.png",
          },
          gamertag: "gamertag01",
        },
      });
    });

    it("returns 400 with invalid JSON", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: "{not-json}",
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("Invalid JSON body");
    });

    it("returns 400 with invalid request format", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ foo: "bar" }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toBe("Invalid request format");
    });

    it("returns 404 if method does not exist on client", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "notARealMethod", args: [] }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toContain("Method not found");
    });

    it("returns 200 and result for valid method", async () => {
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: ["discord_user_01"] }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        result: {
          xuid: "0000000000001",
          gamerpic: {
            small: "small01.png",
            medium: "medium01.png",
            large: "large01.png",
            xlarge: "xlarge01.png",
          },
          gamertag: "gamertag01",
        },
      });
    });

    it("returns 500 and error details if the method throws", async () => {
      const localHaloInfiniteClient = aFakeHaloInfiniteClient();
      vi.spyOn(localHaloInfiniteClient, "getUser").mockRejectedValue(new Error("fail!"));
      const localInstallServices = vi.fn<typeof installServices>(() => ({
        ...installFakeServicesWith({ env }),
        haloInfiniteClient: localHaloInfiniteClient,
      }));
      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });
      const req = new Request("http://localhost/proxy/halo-infinite", {
        method: "POST",
        body: JSON.stringify({ method: "getUser", args: ["discord_user_01"] }),
        headers: {
          "content-type": "application/json",
          "x-proxy-auth": env.PROXY_WORKER_TOKEN,
        },
      });
      const res = (await server.router.fetch(req, env)) as Response;
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toHaveProperty("message", "fail!");
      expect(body).toHaveProperty("stack");
      expect(body).toHaveProperty("name", "Error");
    });
  });

  describe("POST /interactions", () => {
    it("returns 401 when Discord verification fails", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        const mockVerifyDiscordRequest = vi.spyOn(services.discordService, "verifyDiscordRequest").mockResolvedValue({
          isValid: false,
          rawBody: "invalid-body",
        });
        return { ...services, verifyDiscordRequest: mockVerifyDiscordRequest };
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/interactions", {
        method: "POST",
        body: JSON.stringify({ type: 1 }),
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": "invalid-signature",
          "x-signature-timestamp": "123456789",
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

    it("handles PING interaction successfully", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.discordService, "verifyDiscordRequest").mockResolvedValue({
          isValid: true,
          interaction: pingInteraction,
          rawBody: JSON.stringify(pingInteraction),
        });
        return services;
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/interactions", {
        method: "POST",
        body: JSON.stringify(pingInteraction),
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": "valid-signature",
          "x-signature-timestamp": "123456789",
        },
      });

      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const res = (await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("type", InteractionType.Ping);
    });

    it("returns 500 on internal error", async () => {
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.discordService, "verifyDiscordRequest").mockRejectedValue(new Error("Internal failure"));
        return services;
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/interactions", {
        method: "POST",
        body: JSON.stringify({ type: 1 }),
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": "valid-signature",
          "x-signature-timestamp": "123456789",
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

    it("calls waitUntil when jobToComplete is provided", async () => {
      const jobToCompleteMock = vi.fn(async () => {
        // Empty implementation
      });
      const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
        const services = installFakeServicesWith({ env });
        vi.spyOn(services.discordService, "verifyDiscordRequest").mockResolvedValue({
          isValid: true,
          interaction: pingInteraction,
          rawBody: JSON.stringify(pingInteraction),
        });
        vi.spyOn(services.discordService, "handleInteraction").mockReturnValue({
          response: new Response(JSON.stringify({ type: 1 })),
          jobToComplete: jobToCompleteMock,
        });
        return services;
      });

      server = new Server({
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
      });

      const req = new Request("http://localhost/interactions", {
        method: "POST",
        body: JSON.stringify(pingInteraction),
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": "valid-signature",
          "x-signature-timestamp": "123456789",
        },
      });

      const waitUntilSpy = vi.fn();
      const ctx: Partial<EventContext<Env, "", unknown>> = {
        waitUntil: waitUntilSpy,
        passThroughOnException: vi.fn(),
      };

      await server.router.fetch(req, env, ctx as EventContext<Env, "", unknown>);
      expect(waitUntilSpy).toHaveBeenCalledWith(expect.any(Promise));
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
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
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
        router: AutoRouter(),
        installServices: localInstallServices,
        getCommands,
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
