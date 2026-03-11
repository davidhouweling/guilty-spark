import type { AutoRouterType } from "itty-router";
import type { installServices } from "./services/install.mjs";
import type { getCommands } from "./commands/commands.mjs";
import type { LiveTrackerIndividualWebStartRequest } from "./durable-objects/individual/types.mjs";
import { addCorsHeaders, handleCorsPreflightRequest } from "./base/cors.mjs";

interface ServerOpts {
  router: AutoRouterType;
  installServices: typeof installServices;
  getCommands: typeof getCommands;
}

export class Server {
  readonly router: AutoRouterType;
  private readonly installServices: typeof installServices;
  private readonly getCommands: typeof getCommands;

  constructor({ router, installServices, getCommands }: ServerOpts) {
    this.router = router;
    this.installServices = installServices;
    this.getCommands = getCommands;

    this.addRoutes();
  }

  private addRoutes(): void {
    // Handle CORS preflight requests for API routes
    this.router.options("/api/*", (request) => {
      return handleCorsPreflightRequest(request);
    });

    this.router.get("/", (_request, env: Env) => {
      return new Response(
        `👋 G'day from Guilty Spark (env.DISCORD_APP_ID: ${env.DISCORD_APP_ID})... Interested? https://discord.com/oauth2/authorize?client_id=1290269474536034357&permissions=311385476096&integration_type=0&scope=bot+applications.commands 🚀`,
      );
    });

    this.router.post("/api/tracker/individual/start", async (request, env: Env) => {
      try {
        const body = await request.json<{
          gamertag: string;
          selectedMatchIds: string[];
          groupings: string[][];
        }>();

        if (!body.gamertag || body.gamertag === "") {
          return addCorsHeaders(
            new Response(
              JSON.stringify({ error: "missing_gamertag", message: "Missing required parameter: gamertag" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            ),
            request,
          );
        }

        if (!Array.isArray(body.selectedMatchIds) || body.selectedMatchIds.length === 0) {
          return addCorsHeaders(
            new Response(
              JSON.stringify({
                error: "missing_matches",
                message: "Missing required parameter: selectedMatchIds (must be non-empty array)",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            ),
            request,
          );
        }

        if (!Array.isArray(body.groupings)) {
          return addCorsHeaders(
            new Response(
              JSON.stringify({
                error: "invalid_groupings",
                message: "Invalid groupings parameter (must be array)",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            ),
            request,
          );
        }

        const services = this.installServices({ env });
        const { liveTrackerService, xboxService, logService } = services;

        // Resolve gamertag to XUID
        let xuid: string;
        try {
          const user = await xboxService.getUserByGamertag(body.gamertag);
          ({ xuid } = user);
        } catch (error) {
          logService.warn(
            "Failed to resolve gamertag for tracker start",
            new Map([
              ["gamertag", body.gamertag],
              ["error", String(error)],
            ]),
          );
          return addCorsHeaders(
            new Response(
              JSON.stringify({ error: "not_found", message: `User with gamertag ${body.gamertag} not found` }),
              {
                status: 404,
                headers: { "Content-Type": "application/json" },
              },
            ),
            request,
          );
        }

        // Get Individual DO stub (keyed by XUID)
        const stub = liveTrackerService.getIndividualTrackerDOStubByXuid(xuid);

        // Build DO request
        const doRequest: LiveTrackerIndividualWebStartRequest = {
          xuid,
          gamertag: body.gamertag,
          searchStartTime: new Date().toISOString(),
          selectedMatchIds: body.selectedMatchIds,
          groupings: body.groupings,
        };

        // Call DO's web-start endpoint
        const doUrl = new URL(request.url);
        doUrl.pathname = "/web-start";

        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(doRequest),
          }),
        );

        // Forward DO response to client with CORS headers
        return addCorsHeaders(doResponse, request);
      } catch (error) {
        console.error("Tracker start route error:", error);
        return addCorsHeaders(
          new Response(JSON.stringify({ error: "internal_error", message: "Internal Server Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
          request,
        );
      }
    });

    this.router.get("/api/tracker/individual/:gamertag/matches", async (request, env: Env) => {
      try {
        const { gamertag } = request.params as { gamertag: string };

        if (!gamertag || gamertag === "") {
          return addCorsHeaders(
            new Response(
              JSON.stringify({ error: "missing_gamertag", message: "Missing required parameter: gamertag" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            ),
            request,
          );
        }

        const services = this.installServices({ env });
        const { haloService, logService } = services;

        try {
          const matchHistory = await haloService.getEnrichedMatchHistory(gamertag, "en-US");

          return addCorsHeaders(
            new Response(JSON.stringify(matchHistory), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
            request,
          );
        } catch (error) {
          if (error instanceof Error && error.message.includes("not found")) {
            logService.info("Gamertag not found for match history", new Map([["gamertag", gamertag]]));
            return addCorsHeaders(
              new Response(
                JSON.stringify({ error: "not_found", message: `User with gamertag ${gamertag} not found` }),
                {
                  status: 404,
                  headers: { "Content-Type": "application/json" },
                },
              ),
              request,
            );
          }

          logService.error(
            "Failed to fetch match history",
            new Map([
              ["gamertag", gamertag],
              ["error", String(error)],
            ]),
          );

          return addCorsHeaders(
            new Response(JSON.stringify({ error: "internal_error", message: "Failed to retrieve match history" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }),
            request,
          );
        }
      } catch (error) {
        console.error("Match history route error:", error);
        return addCorsHeaders(
          new Response(JSON.stringify({ error: "internal_error", message: "Internal Server Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
          request,
        );
      }
    });

    this.router.get("/ws/tracker/individual/:gamertag", async (request, env: Env) => {
      try {
        const { gamertag } = request.params as { gamertag: string };

        if (!gamertag || gamertag === "") {
          return new Response("Missing required parameter: gamertag", { status: 400 });
        }

        const services = this.installServices({ env });
        const { liveTrackerService, logService } = services;

        let stub;
        try {
          stub = await liveTrackerService.getIndividualTrackerDOStub(gamertag);
        } catch (error) {
          logService.warn(
            "Failed to resolve gamertag for individual tracker",
            new Map([
              ["gamertag", gamertag],
              ["error", String(error)],
            ]),
          );
          return new Response(`User with gamertag ${gamertag} not found`, { status: 404 });
        }

        // Forward the WebSocket upgrade request to the DO
        const doUrl = new URL(request.url);
        doUrl.pathname = "/websocket";

        return await stub.fetch(
          new Request(doUrl.toString(), {
            headers: request.headers,
          }),
        );
      } catch (error) {
        console.error("Individual tracker WebSocket route error:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });

    this.router.get("/ws/tracker/:guildId/:queueNumber", async (request, env: Env) => {
      try {
        // Extract parameters from itty-router
        const { guildId, queueNumber } = request.params as {
          guildId: string;
          queueNumber: string;
        };

        if (guildId === "" || queueNumber === "") {
          return new Response("Missing required parameters: guildId, queueNumber", { status: 400 });
        }

        const queueNum = parseInt(queueNumber, 10);
        if (isNaN(queueNum)) {
          return new Response("Invalid queue number", { status: 400 });
        }

        // Get the Durable Object stub using the same naming pattern
        const doId = env.LIVE_TRACKER_DO.idFromName(`${guildId}:${queueNum.toString()}`);
        const stub = env.LIVE_TRACKER_DO.get(doId);

        // Forward the WebSocket upgrade request to the DO
        const doUrl = new URL(request.url);
        doUrl.pathname = "/websocket";

        return await stub.fetch(
          new Request(doUrl.toString(), {
            headers: request.headers,
          }),
        );
      } catch (error) {
        console.error("WebSocket route error:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });

    this.router.post("/interactions", async (request, env: Env, ctx: EventContext<Env, "", unknown>) => {
      try {
        const services = this.installServices({ env });
        const { discordService } = services;
        const commands = this.getCommands(services, env);
        discordService.setCommands(commands);

        const { isValid, interaction, rawBody } = await discordService.verifyDiscordRequest(request);
        if (!isValid || !interaction) {
          services.logService.warn(
            "Invalid Discord request (failed verification)",
            new Map([
              ["rawBody", rawBody],
              ["headers", JSON.stringify(Array.from(request.headers.entries()))],
            ]),
          );
          return new Response("Bad request signature.", { status: 401 });
        }

        const { response, jobToComplete } = discordService.handleInteraction(interaction);

        if (jobToComplete) {
          ctx.waitUntil(jobToComplete());
        }

        return response;
      } catch (error) {
        console.error(error);
        console.trace();

        return new Response("Internal error", { status: 500 });
      }
    });

    this.router.post("/neatqueue", async (request, env: Env, ctx: EventContext<Env, "", unknown>) => {
      try {
        const services = this.installServices({ env });
        const { neatQueueService } = services;

        const verifiedRequest = await neatQueueService.verifyRequest(request);
        if (!verifiedRequest.isValid) {
          services.logService.info(
            "Invalid NeatQueue request (failed verification)",
            new Map([
              ["rawBody", verifiedRequest.rawBody],
              ["headers", JSON.stringify(Array.from(request.headers.entries()))],
            ]),
          );
          return new Response("Bad request signature.", { status: 401 });
        }

        const { interaction, neatQueueConfig } = verifiedRequest;
        const { response, jobToComplete } = neatQueueService.handleRequest(interaction, neatQueueConfig);

        if (jobToComplete) {
          ctx.waitUntil(jobToComplete());
        }

        return response;
      } catch (error) {
        console.error(error);
        console.trace();

        return new Response("Internal error", { status: 500 });
      }
    });

    this.router.post("/proxy/halo-infinite", async (request, env: Env) => {
      try {
        const authHeader = request.headers.get("x-proxy-auth");
        if (authHeader == null || authHeader !== env.PROXY_WORKER_TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        if (
          typeof body !== "object" ||
          body === null ||
          typeof (body as { method?: unknown }).method !== "string" ||
          !Array.isArray((body as { args?: unknown[] }).args)
        ) {
          return new Response("Invalid request format", { status: 400 });
        }

        const { method, args } = body as { method: string; args: unknown[] };
        const services = this.installServices({ env });
        const { haloInfiniteClient } = services;

        const isFunctionProperty = <T,>(
          obj: T,
          key: string,
        ): obj is T & Record<string, (...args: unknown[]) => unknown> => {
          return (
            Object.prototype.hasOwnProperty.call(obj, key) &&
            typeof (obj as Record<string, unknown>)[key] === "function"
          );
        };
        if (!isFunctionProperty(haloInfiniteClient, method)) {
          return new Response(`Method not found: ${method}`, { status: 404 });
        }

        const targetMethod = haloInfiniteClient[method] as (...a: unknown[]) => unknown;

        const result: unknown = await targetMethod.apply(haloInfiniteClient, args);
        return new Response(JSON.stringify({ result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch (error) {
        let errorBody: Record<string, unknown> = {};
        if (error instanceof Error) {
          errorBody = {
            message: error.message,
            stack: error.stack,
            name: error.name,
          };
        } else {
          errorBody = { error: String(error) };
        }
        return new Response(JSON.stringify(errorBody), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    });

    this.router.all("*", () => new Response("Not Found.", { status: 404 }));
  }
}
