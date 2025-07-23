import * as Sentry from "@sentry/cloudflare";
import { AutoRouter } from "itty-router";
import { installServices } from "./services/install.mjs";
import { getCommands } from "./commands/commands.mjs";
import { Server } from "./server.mjs";

const server = new Server({
  router: AutoRouter(),
  installServices,
  getCommands,
});

export default Sentry.withSentry(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (_env) => ({
    dsn: "https://76d3531a8ad7eb47ae6e8574e5fd9f9d@o4509134330462208.ingest.us.sentry.io/4509134352285696",
    // Set tracesSampleRate to 1.0 to capture 100% of spans for tracing.
    // Learn more at
    // https://docs.sentry.io/platforms/javascript/configuration/options/#traces-sample-rate
    tracesSampleRate: 1.0,
    beforeSend: (
      event: Sentry.ErrorEvent,
      hint: Sentry.EventHint,
    ): PromiseLike<Sentry.ErrorEvent | null> | Sentry.ErrorEvent | null => {
      console.debug("Sentry event:", event);
      const response = hint.originalException as Response | undefined;
      if (response?.status === 404) {
        // Filter out 404 responses

        console.debug("Filtered out 404 response");
        return null;
      }
      return event;
    },
  }),
  {
    fetch: server.router.fetch,
  },
);
