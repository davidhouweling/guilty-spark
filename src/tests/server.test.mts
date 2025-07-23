import { describe, it, beforeEach, expect, vi } from "vitest";
import { AutoRouter } from "itty-router";
import { installFakeServicesWith } from "../services/fakes/services.mjs";
import { Server } from "../server.mjs";
import { getCommands } from "../commands/commands.mjs";
import { aFakeEnvWith } from "../base/fakes/env.fake.mjs";
import { aFakeHaloInfiniteClient } from "../services/halo/fakes/infinite-client.fake.mjs";

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
});
