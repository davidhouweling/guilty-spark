import type { AutoRouterType } from "itty-router";
import type { installServices } from "./services/install";
import { authRoutesRegisterHandler } from "./routes/auth/auth";
import { discordInteractionsRoute } from "./routes/discord/interactions";
import { individualTrackerRoutesRegisterHandler } from "./routes/individual-tracker/individual-tracker";
import { haloProxyRoutesRegisterHandler } from "./routes/halo-proxy/halo-proxy";
import { statsRoutesRegisterHandler } from "./routes/stats/stats";

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
    this.router.get("/", (_request, env: Env) => {
      return new Response(
        `👋 G'day from Guilty Spark (env.DISCORD_APP_ID: ${env.DISCORD_APP_ID})... Interested? https://discord.com/oauth2/authorize?client_id=1290269474536034357&permissions=311385476096&integration_type=0&scope=bot+applications.commands 🚀`,
      );
    });

    authRoutesRegisterHandler(this.router, this.installServices);

    individualTrackerRoutesRegisterHandler(this.router, this.installServices);

    haloProxyRoutesRegisterHandler(this.router, this.installServices);

    statsRoutesRegisterHandler(this.router, this.installServices);

    discordInteractionsRoute(this.router, this.installServices);

    this.router.get("/tracker/:guildId/:queueNumber/status", async (request, env: Env) => {
      const { guildId, queueNumber } = request.params as {
        guildId: string;
        queueNumber: string;
      };

      const queueNum = parseInt(queueNumber, 10);
      if (isNaN(queueNum)) {
        return new Response("Invalid queue number", { status: 400 });
      }

      const doId = env.LIVE_TRACKER_DO.idFromName(`${guildId}:${queueNum.toString()}`);
      const stub = env.LIVE_TRACKER_DO.get(doId);

      const doUrl = new URL(request.url);
      doUrl.pathname = "/status";

      return await stub.fetch(new Request(doUrl.toString()));
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

    this.router.all("*", () => new Response("Not Found.", { status: 404 }));
  }
}
