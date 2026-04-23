import * as Sentry from "@sentry/cloudflare";
import { AutoRouter } from "itty-router";
import { installServices } from "./services/install";
import { getCommands } from "./commands/commands";
import { Server } from "./server";
import { addCorsHeaders, handleCorsPreflightRequest } from "./base/cors";

// Export Durable Object classes
export { LiveTrackerDO } from "./durable-objects/live-tracker-do";
export { IndividualTrackerDO } from "./durable-objects/individual-tracker/individual-tracker-do";

const server = new Server({
  router: AutoRouter(),
  installServices,
  getCommands,
});

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: "https://76d3531a8ad7eb47ae6e8574e5fd9f9d@o4509134330462208.ingest.us.sentry.io/4509134352285696",
    environment: env.MODE === "development" ? "development" : "production",
    // Set tracesSampleRate to 1.0 to capture 100% of spans for tracing.
    // Learn more at
    // https://docs.sentry.io/platforms/javascript/configuration/options/#traces-sample-rate
    tracesSampleRate: 1.0,
    debug: env.MODE === "development",
    beforeSend: (
      event: Sentry.ErrorEvent,
      hint: Sentry.EventHint,
    ): PromiseLike<Sentry.ErrorEvent | null> | Sentry.ErrorEvent | null => {
      console.log("Sentry event being sent:", {
        environment: event.environment,
        message: event.message,
        level: event.level,
        exception: event.exception,
      });
      const response = hint.originalException as Response | undefined;
      if (response?.status === 404) {
        // Filter out 404 responses
        console.log("Filtered out 404 response");
        return null;
      }
      return event;
    },
  }),
  {
    fetch: async (request: Request, env: Env, context: ExecutionContext): Promise<Response> => {
      const { pathname } = new URL(request.url);
      const isCorsRoute =
        pathname.startsWith("/api/") ||
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/proxy/") ||
        pathname === "/api" ||
        pathname === "/auth" ||
        pathname === "/proxy";

      if (request.method === "OPTIONS" && isCorsRoute) {
        return handleCorsPreflightRequest(request, env);
      }

      const response = (await server.router.fetch(request, env, context)) as Response;

      if (!isCorsRoute) {
        return response;
      }

      return addCorsHeaders(response, request, env);
    },
  },
);
