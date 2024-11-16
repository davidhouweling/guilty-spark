/**
 * The core server that runs on a Cloudflare worker.
 * Based on https://github.com/discord/cloudflare-sample-app
 */

import { AutoRouter } from "itty-router";
import { installServices } from "./services/install.mjs";
import { getCommands } from "./commands/commands.mjs";

const router = AutoRouter();

router.get("/", (_request, env: Env) => {
  return new Response(
    `👋 G'day from Guilty Spark (env.DISCORD_APP_ID: ${env.DISCORD_APP_ID})... Interested? https://discord.com/oauth2/authorize?client_id=1290269474536034357 🚀`,
  );
});

router.post("/interactions", async (request, env: Env, ctx: EventContext<Env, "", unknown>) => {
  try {
    const services = await installServices({ env });
    const { discordService } = services;
    const commands = getCommands(services);
    discordService.setCommands(commands);

    const { isValid, interaction } = await discordService.verifyDiscordRequest(request);
    if (!isValid || !interaction) {
      return new Response("Bad request signature.", { status: 401 });
    }

    const { response, jobToComplete } = discordService.handleInteraction(interaction);

    if (jobToComplete) {
      ctx.waitUntil(jobToComplete);
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

export default server;
