/**
 * The core server that runs on a Cloudflare worker.
 * Based on https://github.com/discord/cloudflare-sample-app
 */

import { AutoRouter } from "itty-router";
import { installServices } from "./services/install.mjs";
import { getCommands } from "./commands/commands.mjs";

const router = AutoRouter();

router.get("/", (_request, env: Env) => {
  return new Response(`👋 ${env.DISCORD_APP_ID}`);
});

router.post("/interactions", async (request, env: Env) => {
  const services = installServices({ env });
  const { discordService } = services;
  const commands = getCommands(services);
  discordService.setCommands(commands);

  const { isValid, interaction } = await discordService.verifyDiscordRequest(request);
  if (!isValid || !interaction) {
    return new Response("Bad request signature.", { status: 401 });
  }

  const response = await discordService.handleInteraction(interaction);

  return response;
});
router.all("*", () => new Response("Not Found.", { status: 404 }));

const server: ExportedHandler = {
  fetch: router.fetch,
};

export default server;
