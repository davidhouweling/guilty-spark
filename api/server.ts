import type { AutoRouterType } from "itty-router";
import { AutoTokenProvider, HaloInfiniteClient } from "halo-infinite-api";
import type { installServices } from "./services/install";
import type { getCommands } from "./commands/commands";
import type { SessionTokenPayload } from "./services/auth/types";
import { handleCorsPreflightRequest } from "./base/cors";
import { ProfileNotFoundError, InvalidReorderError } from "./services/individual-tracker/errors";

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

    this.router.get("/auth/microsoft/start", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const { authService } = services;
        const url = new URL(request.url);
        const redirect = url.searchParams.get("redirect") ?? undefined;

        const { url: authorizationUrl, state } = await authService.generateAuthorizationUrl(redirect);

        // Return the auth URL + state for frontend to navigate to
        return new Response(
          JSON.stringify({
            authUrl: authorizationUrl.toString(),
            state,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      } catch (error) {
        console.error("Auth start error:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to generate authorization URL",
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }
    });

    this.router.get("/auth/microsoft/callback", async (request, env: Env) => {
      try {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (code == null || state == null) {
          return new Response("Missing authorization code or state", { status: 400 });
        }

        const services = this.installServices({ env });
        const { authService } = services;

        // Exchange code for tokens and create session
        const { sessionPayload, redirectTo } = await authService.handleCallback(code, state);
        const sessionToken = await authService.createSessionToken(sessionPayload);
        const pagesRedirectUrl = new URL(redirectTo, env.PAGES_URL);

        // Create redirect response with Set-Cookie header
        const response = new Response(null, {
          status: 302,
          headers: {
            Location: pagesRedirectUrl.toString(),
          },
        });

        // Set session cookie
        authService.setSessionCookie(response, sessionToken, sessionPayload.expiresAt);

        return response;
      } catch (error) {
        console.error("Auth callback error:", error);
        return new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Authentication failed",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }
    });

    this.router.post("/auth/logout", (_request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const { authService } = services;

        const response = new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });

        authService.clearSessionCookie(response);

        return response;
      } catch (error) {
        console.error("Auth logout error:", error);
        return new Response(JSON.stringify({ error: "Logout failed" }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
    });

    this.router.get("/auth/session", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const { authService } = services;

        const session = await authService.validateSession(request);

        if (session === null) {
          return new Response(JSON.stringify({ authenticated: false }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (session.isExpired) {
          return new Response(JSON.stringify({ authenticated: false, expired: true }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ authenticated: true, userId: session.userId, expiresAt: session.expiresAt }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("Auth session error:", error);
        return new Response(JSON.stringify({ error: "Failed to retrieve session" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.get("/api/individual-tracker/profile", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

        const response = await services.individualTrackerService.getProfile({ userId: session.userId });

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual tracker profile get error:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch profile" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/profile", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body: unknown = await request.json();
        const createProfileRequest = { userId: session.userId };
        const nameVal = (body as { name?: unknown }).name;
        if (typeof nameVal === "string") {
          Object.assign(createProfileRequest, { name: nameVal });
        }
        const activeIdentityIdVal = (body as { activeIdentityId?: unknown }).activeIdentityId;
        if (Object.prototype.hasOwnProperty.call(body as object, "activeIdentityId")) {
          Object.assign(createProfileRequest, {
            activeIdentityId: typeof activeIdentityIdVal === "string" ? activeIdentityIdVal : null,
          });
        }

        const response = await services.individualTrackerService.createProfile(
          createProfileRequest as Parameters<typeof services.individualTrackerService.createProfile>[0],
        );

        return new Response(JSON.stringify(response), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Individual tracker profile create error:", error);
        return new Response(JSON.stringify({ error: "Failed to create profile" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.patch("/api/individual-tracker/profile", async (request, env: Env) => {
      try {
        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body: unknown = await request.json();
        const { profileId } = body as { profileId?: unknown };
        if (typeof profileId !== "string" || profileId === "") {
          return new Response("Missing profileId", { status: 400 });
        }

        const updates: { name?: string; activeIdentityId?: string | null } = {};

        const { name } = body as { name?: unknown };
        if (typeof name === "string") {
          updates.name = name;
        }

        if (Object.prototype.hasOwnProperty.call(body as object, "activeIdentityId")) {
          const { activeIdentityId } = body as { activeIdentityId?: unknown };
          updates.activeIdentityId = typeof activeIdentityId === "string" ? activeIdentityId : null;
        }

        try {
          const response = await services.individualTrackerService.updateProfile({
            userId: session.userId,
            profileId,
            updates,
          });

          return new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            return new Response("Profile not found", { status: 404 });
          }
          throw error;
        }
      } catch (error) {
        console.error("Individual tracker profile update error:", error);
        return new Response(JSON.stringify({ error: "Failed to update profile" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    this.router.post("/api/individual-tracker/:action", async (request, env: Env) => {
      try {
        const { action } = request.params as { action: string };
        if (action !== "games:add" && action !== "games:remove" && action !== "games:reorder") {
          return new Response("Not Found.", { status: 404 });
        }

        const services = this.installServices({ env });
        const session = await services.authService.validateSession(request);

        if (session === null || session.isExpired) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body: unknown = await request.json();
        const { profileId } = body as { profileId?: unknown };
        if (typeof profileId !== "string" || profileId === "") {
          return new Response("Missing profileId", { status: 400 });
        }

        try {
          switch (action) {
            case "games:add": {
              const { matchId } = body as { matchId?: unknown };
              if (typeof matchId !== "string" || matchId === "") {
                return new Response("Missing matchId", { status: 400 });
              }

              const response = await services.individualTrackerService.addGame({
                userId: session.userId,
                profileId,
                matchId,
              });

              return new Response(JSON.stringify(response), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            case "games:remove": {
              const { matchId } = body as { matchId?: unknown };
              if (typeof matchId !== "string" || matchId === "") {
                return new Response("Missing matchId", { status: 400 });
              }

              const response = await services.individualTrackerService.removeGame({
                userId: session.userId,
                profileId,
                matchId,
              });

              return new Response(JSON.stringify(response), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            case "games:reorder": {
              const { orderedMatchIds } = body as { orderedMatchIds?: unknown };
              if (!Array.isArray(orderedMatchIds) || orderedMatchIds.some((matchId) => typeof matchId !== "string")) {
                return new Response("Invalid reorder payload", { status: 400 });
              }

              const response = await services.individualTrackerService.reorderGames({
                userId: session.userId,
                profileId,
                orderedMatchIds: orderedMatchIds as string[],
              });

              return new Response(JSON.stringify(response), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            default: {
              return new Response("Not Found.", { status: 404 });
            }
          }
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            return new Response("Profile not found", { status: 404 });
          }
          if (error instanceof InvalidReorderError) {
            return new Response(error.message, { status: 400 });
          }
          throw error;
        }
      } catch (error) {
        console.error("Individual tracker games action error:", error);
        return new Response(JSON.stringify({ error: "Failed to process games action" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
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
        if (authHeader != null && authHeader !== env.PROXY_WORKER_TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }

        const hasValidWorkerToken = authHeader === env.PROXY_WORKER_TOKEN;

        let services: ReturnType<typeof this.installServices> | null = null;
        let sessionAccessToken: string | null = null;
        let refreshedSessionPayload: SessionTokenPayload | null = null;

        if (!hasValidWorkerToken) {
          services = this.installServices({ env });
          const session = await services.authService.validateSession(request);
          if (session === null) {
            return new Response("Unauthorized", { status: 401 });
          }

          if (session.isExpired) {
            try {
              refreshedSessionPayload = await services.authService.refreshSession(session);
            } catch {
              const response = new Response("Unauthorized", { status: 401 });
              services.authService.clearSessionCookie(response);
              return response;
            }

            if (refreshedSessionPayload === null) {
              const response = new Response("Unauthorized", { status: 401 });
              services.authService.clearSessionCookie(response);
              return response;
            }

            sessionAccessToken = refreshedSessionPayload.accessToken;
          } else {
            sessionAccessToken = session.accessToken;
          }
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

        let haloInfiniteClient: HaloInfiniteClient;
        if (sessionAccessToken !== null) {
          const token = sessionAccessToken;
          haloInfiniteClient = new HaloInfiniteClient(new AutoTokenProvider(async () => Promise.resolve(token)));
        } else {
          ({ haloInfiniteClient } = services ?? this.installServices({ env }));
        }

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

        const response = new Response(JSON.stringify({ result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

        if (refreshedSessionPayload !== null && services !== null) {
          const refreshedToken = await services.authService.createSessionToken(refreshedSessionPayload);
          services.authService.setSessionCookie(response, refreshedToken, refreshedSessionPayload.expiresAt);
        }

        return response;
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
