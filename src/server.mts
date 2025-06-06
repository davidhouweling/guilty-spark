import * as Sentry from "@sentry/cloudflare";
import { AutoRouter } from "itty-router";
import { installServices } from "./services/install.mjs";
import { getCommands } from "./commands/commands.mjs";

const router = AutoRouter();

router.get("/", (_request, env: Env) => {
  return new Response(
    `👋 G'day from Guilty Spark (env.DISCORD_APP_ID: ${env.DISCORD_APP_ID})... Interested? https://discord.com/oauth2/authorize?client_id=1290269474536034357&permissions=311385476096&integration_type=0&scope=bot+applications.commands 🚀`,
  );
});

router.post("/interactions", async (request, env: Env, ctx: EventContext<Env, "", unknown>) => {
  try {
    const services = await installServices({ env });
    const { discordService } = services;
    const commands = getCommands(services, env);
    discordService.setCommands(commands);

    const { isValid, interaction } = await discordService.verifyDiscordRequest(request);
    if (!isValid || !interaction) {
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

router.post("/neatqueue", async (request, env: Env, ctx: EventContext<Env, "", unknown>) => {
  try {
    const services = await installServices({ env });
    const { neatQueueService } = services;

    const verifiedRequest = await neatQueueService.verifyRequest(request);
    if (!verifiedRequest.isValid) {
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

router.all("*", () => new Response("Not Found.", { status: 404 }));

const server: ExportedHandler = {
  fetch: router.fetch,
};

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
  server satisfies ExportedHandler<Env>,
);
