import { getCommands } from "../../commands/commands";
import type { RoutesRegisterHandler } from "../base/types";

export const discordInteractionsRoute: RoutesRegisterHandler = (router, installServices) => {
  router.post("/interactions", async (request, env: Env, ctx: EventContext<Env, "", unknown>) => {
    const services = installServices({ env });
    const { discordService, logService } = services;

    try {
      const commands = getCommands(services, env);
      discordService.setCommands(commands);

      const { isValid, interaction, rawBody } = await discordService.verifyDiscordRequest(request);
      if (!isValid || !interaction) {
        logService.warn(
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
      logService.error(error as Error, new Map([["message", "Discord interaction error"]]));

      return new Response("Internal error", { status: 500 });
    }
  });
};
