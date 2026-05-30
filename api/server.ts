import type { AutoRouterType } from "itty-router";
import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import type { installServices } from "./services/install";
import type { SessionTokenPayload } from "./services/auth/types";
import { addCorsHeaders, handleCorsPreflightRequest } from "./base/cors";
import { authRoutesRegisterHandler } from "./routes/auth/auth";
import { discordInteractionsRoute } from "./routes/discord/interactions";
import { individualTrackerRoutesRegisterHandler } from "./routes/individual-tracker/individual-tracker";

interface ServerOpts {
  router: AutoRouterType;
  installServices: typeof installServices;
}

export class Server {
  readonly router: AutoRouterType;
  private readonly installServices: typeof installServices;

  constructor({ router, installServices }: ServerOpts) {
    this.router = router;
    this.installServices = installServices;

    this.addRoutes();
  }

  private addRoutes(): void {
    // Handle CORS preflight requests for API routes
    this.router.options("/api/*", (request) => {
      return handleCorsPreflightRequest(request, true);
    });
    this.router.options("/auth/*", (request) => {
      return handleCorsPreflightRequest(request, true);
    });
    this.router.options("/proxy/halo-infinite", (request) => {
      return handleCorsPreflightRequest(request, true);
    });

    this.router.get("/", (_request, env: Env) => {
      return new Response(
        `👋 G'day from Guilty Spark (env.DISCORD_APP_ID: ${env.DISCORD_APP_ID})... Interested? https://discord.com/oauth2/authorize?client_id=1290269474536034357&permissions=311385476096&integration_type=0&scope=bot+applications.commands 🚀`,
      );
    });

    authRoutesRegisterHandler(this.router, this.installServices);

    individualTrackerRoutesRegisterHandler(this.router, this.installServices);

    discordInteractionsRoute(this.router, this.installServices);

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
        const withCorsHeaders = (response: Response): Response => {
          return addCorsHeaders(response, request, true);
        };

        const authHeader = request.headers.get("x-proxy-auth");
        if (authHeader != null && authHeader !== env.PROXY_WORKER_TOKEN) {
          return withCorsHeaders(new Response("Unauthorized", { status: 401 }));
        }

        const hasValidWorkerToken = authHeader === env.PROXY_WORKER_TOKEN;

        let services: ReturnType<typeof this.installServices> | null = null;
        let microsoftAccessToken: string | null = null;
        let refreshedSessionPayload: SessionTokenPayload | null = null;

        if (!hasValidWorkerToken) {
          services = this.installServices({ env });
          const session = await services.authService.validateSession(request);
          if (session === null) {
            return withCorsHeaders(new Response("Unauthorized", { status: 401 }));
          }

          if (session.isExpired) {
            try {
              refreshedSessionPayload = await services.authService.refreshSession(session);
            } catch {
              const response = new Response("Unauthorized", { status: 401 });
              services.authService.clearSessionCookie(response);
              return withCorsHeaders(response);
            }

            if (refreshedSessionPayload === null) {
              const response = new Response("Unauthorized", { status: 401 });
              services.authService.clearSessionCookie(response);
              return withCorsHeaders(response);
            }

            microsoftAccessToken = refreshedSessionPayload.accessToken;
          } else {
            microsoftAccessToken = session.accessToken;
          }
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return withCorsHeaders(new Response("Invalid JSON body", { status: 400 }));
        }

        if (
          typeof body !== "object" ||
          body === null ||
          typeof (body as { method?: unknown }).method !== "string" ||
          !Array.isArray((body as { args?: unknown[] }).args)
        ) {
          return withCorsHeaders(new Response("Invalid request format", { status: 400 }));
        }

        const { method, args } = body as { method: string; args: unknown[] };

        const activeServices = services ?? this.installServices({ env });
        let haloInfiniteClient: HaloInfiniteClient;
        if (microsoftAccessToken !== null) {
          const xstsTokenInfo =
            await activeServices.xboxService.exchangeMicrosoftAccessTokenForXstsToken(microsoftAccessToken);
          haloInfiniteClient = new HaloInfiniteClient(
            new StaticXstsTicketTokenSpartanTokenProvider(xstsTokenInfo.XSTSToken),
          );
        } else {
          ({ haloInfiniteClient } = activeServices);
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
          return withCorsHeaders(new Response(`Method not found: ${method}`, { status: 404 }));
        }

        const targetMethod = haloInfiniteClient[method] as (...a: unknown[]) => unknown;

        const result: unknown = await targetMethod.apply(haloInfiniteClient, args);

        const response = new Response(JSON.stringify({ result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

        return withCorsHeaders(response);
      } catch (error) {
        console.error("Halo proxy error:", error);
        return addCorsHeaders(
          new Response(JSON.stringify({ error: "Proxy request failed" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
          request,
          true,
        );
      }
    });

    this.router.all("*", () => new Response("Not Found.", { status: 404 }));
  }
}
