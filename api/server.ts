import type { AutoRouterType } from "itty-router";
import type { installServices } from "./services/install";
import type { getCommands } from "./commands/commands";
import type { LiveTrackerIndividualWebStartRequest } from "./durable-objects/individual/types";
import { addCorsHeaders, handleCorsPreflightRequest } from "./base/cors";

interface ServerOpts {
  router: AutoRouterType;
  installServices: typeof installServices;
  getCommands: typeof getCommands;
}

// Result types for helper methods
type ValidationResult = { valid: true; gamertag: string } | { valid: false; response: Response };
type StubResult = { success: true; stub: DurableObjectStub } | { success: false; response: Response };

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

  // Helper: Resolve gamertag to Individual Tracker DO stub
  private async resolveIndividualTrackerStub(
    gamertag: string,
    services: ReturnType<typeof installServices>,
    request: Request,
    operation: string,
  ): Promise<StubResult> {
    try {
      const stub = await services.liveTrackerService.getIndividualTrackerDOStub(gamertag);
      return { success: true, stub };
    } catch (error) {
      services.logService.warn(
        `Failed to resolve gamertag for ${operation}`,
        new Map([
          ["gamertag", gamertag],
          ["error", String(error)],
        ]),
      );
      return {
        success: false,
        response: addCorsHeaders(
          new Response(JSON.stringify({ error: "not_found", message: `User with gamertag ${gamertag} not found` }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }),
          request,
        ),
      };
    }
  }

  // Helper: Forward request to DO and wrap with CORS
  private async forwardToDO(
    stub: DurableObjectStub,
    path: string,
    method: string,
    body: unknown,
    request: Request,
  ): Promise<Response> {
    const doRequest = new Request(`${new URL(request.url).origin}${path}`, {
      method,
      ...(body !== undefined && { body: JSON.stringify(body) }),
      headers: { "Content-Type": "application/json" },
    });

    const doResponse = await stub.fetch(doRequest);
    return addCorsHeaders(doResponse, request);
  }

  // Helper: Create error response with CORS
  private createErrorResponse(error: string, message: string, status: number, request: Request): Response {
    return addCorsHeaders(
      new Response(JSON.stringify({ error, message }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
      request,
    );
  }

  // Helper: Validate gamertag for API routes (with CORS)
  private validateGamertagParam(params: Record<string, string | undefined>, request: Request): ValidationResult {
    const { gamertag } = params;
    if (gamertag == null || gamertag === "") {
      return {
        valid: false,
        response: this.createErrorResponse("missing_gamertag", "Missing required parameter: gamertag", 400, request),
      };
    }
    return { valid: true, gamertag };
  }

  // Helper: Validate array body parameter
  private validateArrayParam(value: unknown, fieldName: string, request: Request): Response | null {
    if (!Array.isArray(value)) {
      return this.createErrorResponse(
        `invalid_${fieldName}`,
        `Invalid ${fieldName} parameter (must be array)`,
        400,
        request,
      );
    }
    return null;
  }

  // Helper: Validate gamertag for WebSocket routes (no CORS)
  private validateGamertagParamWS(params: Record<string, string | undefined>): ValidationResult {
    const { gamertag } = params;
    if (gamertag == null || gamertag === "") {
      return {
        valid: false,
        response: new Response("Missing required parameter: gamertag", { status: 400 }),
      };
    }
    return { valid: true, gamertag };
  }

  // Helper: Resolve gamertag for WebSocket routes (no CORS)
  private async resolveIndividualTrackerStubWS(
    gamertag: string,
    services: ReturnType<typeof installServices>,
    operation: string,
  ): Promise<StubResult> {
    try {
      const stub = await services.liveTrackerService.getIndividualTrackerDOStub(gamertag);
      return { success: true, stub };
    } catch (error) {
      services.logService.warn(
        `Failed to resolve gamertag for ${operation}`,
        new Map([
          ["gamertag", gamertag],
          ["error", String(error)],
        ]),
      );
      return {
        success: false,
        response: new Response(`User with gamertag ${gamertag} not found`, { status: 404 }),
      };
    }
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
          return this.createErrorResponse("missing_gamertag", "Missing required parameter: gamertag", 400, request);
        }

        const matchesError = this.validateArrayParam(body.selectedMatchIds, "selectedMatchIds", request);
        if (matchesError) {
          return matchesError;
        }

        const groupingsError = this.validateArrayParam(body.groupings, "groupings", request);
        if (groupingsError) {
          return groupingsError;
        }

        const services = this.installServices({ env });
        const { liveTrackerService, haloService, logService } = services;

        let xuid: string;
        try {
          const user = await haloService.getUserByGamertag(body.gamertag);
          ({ xuid } = user);
        } catch (error) {
          logService.warn(
            "Failed to resolve gamertag for tracker start",
            new Map([
              ["gamertag", body.gamertag],
              ["error", String(error)],
            ]),
          );
          return this.createErrorResponse("not_found", `User with gamertag ${body.gamertag} not found`, 404, request);
        }

        const stub = liveTrackerService.getIndividualTrackerDOStubByXuid(xuid);

        const doRequest: LiveTrackerIndividualWebStartRequest = {
          xuid,
          gamertag: body.gamertag,
          searchStartTime: new Date().toISOString(),
          selectedMatchIds: body.selectedMatchIds,
          groupings: body.groupings,
        };

        const doUrl = new URL(request.url);
        doUrl.pathname = "/web-start";

        const doResponse = await stub.fetch(
          new Request(doUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(doRequest),
          }),
        );

        return addCorsHeaders(doResponse, request);
      } catch (error) {
        console.error("Tracker start route error:", error);
        return this.createErrorResponse("internal_error", "Internal Server Error", 500, request);
      }
    });
    this.router.post("/api/tracker/individual/:gamertag/subscribe", async (request, env: Env) => {
      try {
        const validation = this.validateGamertagParam(request.params as Record<string, string>, request);
        if (!validation.valid) {
          return validation.response;
        }

        const body = await request.json<{ target: unknown }>();
        if (body.target == null || typeof body.target !== "object") {
          return this.createErrorResponse("invalid_target", "Invalid or missing target parameter", 400, request);
        }

        const services = this.installServices({ env });
        const stubResult = await this.resolveIndividualTrackerStub(validation.gamertag, services, request, "subscribe");
        if (!stubResult.success) {
          return stubResult.response;
        }

        return await this.forwardToDO(stubResult.stub, "/subscribe", "POST", { target: body.target }, request);
      } catch (error) {
        console.error("Subscribe route error:", error);
        return this.createErrorResponse("internal_error", "Internal Server Error", 500, request);
      }
    });

    this.router.delete("/api/tracker/individual/:gamertag/unsubscribe/:targetId", async (request, env: Env) => {
      try {
        const validation = this.validateGamertagParam(request.params as Record<string, string>, request);
        if (!validation.valid) {
          return validation.response;
        }

        const { targetId } = request.params as { targetId: string };
        if (!targetId || targetId === "") {
          return this.createErrorResponse("missing_target_id", "Missing required parameter: targetId", 400, request);
        }

        const services = this.installServices({ env });
        const stubResult = await this.resolveIndividualTrackerStub(
          validation.gamertag,
          services,
          request,
          "unsubscribe",
        );
        if (!stubResult.success) {
          return stubResult.response;
        }

        return await this.forwardToDO(stubResult.stub, "/unsubscribe", "POST", { targetId }, request);
      } catch (error) {
        console.error("Unsubscribe route error:", error);
        return this.createErrorResponse("internal_error", "Internal Server Error", 500, request);
      }
    });

    this.router.get("/api/tracker/individual/:gamertag/targets", async (request, env: Env) => {
      try {
        const validation = this.validateGamertagParam(request.params as Record<string, string>, request);
        if (!validation.valid) {
          return validation.response;
        }

        const services = this.installServices({ env });
        const stubResult = await this.resolveIndividualTrackerStub(
          validation.gamertag,
          services,
          request,
          "targets list",
        );
        if (!stubResult.success) {
          return stubResult.response;
        }

        return await this.forwardToDO(stubResult.stub, "/targets", "GET", undefined, request);
      } catch (error) {
        console.error("Targets route error:", error);
        return this.createErrorResponse("internal_error", "Internal Server Error", 500, request);
      }
    });
    this.router.get("/api/tracker/individual/:gamertag/matches", async (request, env: Env) => {
      try {
        const validation = this.validateGamertagParam(request.params as Record<string, string>, request);
        if (!validation.valid) {
          return validation.response;
        }
        const { gamertag } = validation;

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
            return this.createErrorResponse("not_found", `User with gamertag ${gamertag} not found`, 404, request);
          }

          logService.error(
            "Failed to fetch match history",
            new Map([
              ["gamertag", gamertag],
              ["error", String(error)],
            ]),
          );

          return this.createErrorResponse("internal_error", "Failed to retrieve match history", 500, request);
        }
      } catch (error) {
        console.error("Match history route error:", error);
        return this.createErrorResponse("internal_error", "Internal Server Error", 500, request);
      }
    });

    this.router.get("/ws/tracker/individual/:gamertag", async (request, env: Env) => {
      try {
        const validation = this.validateGamertagParamWS(request.params as Record<string, string>);
        if (!validation.valid) {
          return validation.response;
        }

        const services = this.installServices({ env });
        const stubResult = await this.resolveIndividualTrackerStubWS(
          validation.gamertag,
          services,
          "individual tracker",
        );
        if (!stubResult.success) {
          return stubResult.response;
        }

        // Forward WebSocket upgrade request to DO
        const doUrl = new URL(request.url);
        doUrl.pathname = "/websocket";

        return await stubResult.stub.fetch(
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

        const isFunctionProperty = <T>(
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
