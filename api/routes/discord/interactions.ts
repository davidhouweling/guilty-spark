import type { APIInteraction } from "discord-api-types/v10";
import { getCommands } from "../../commands/commands";
import { JobProgressLogger } from "../../services/log/job-progress-logger";
import type { JsonAny } from "../../services/log/types";
import type { RoutesRegisterHandler } from "../base/types";

function getInteractionName(interaction: APIInteraction): string | null {
  if (!("data" in interaction) || interaction.data == null) {
    return null;
  }
  if ("name" in interaction.data) {
    return interaction.data.name;
  }
  if ("custom_id" in interaction.data) {
    return interaction.data.custom_id;
  }
  return null;
}

function getInteractionLogContext(interaction: APIInteraction): ReadonlyMap<string, JsonAny> {
  return new Map<string, JsonAny>([
    ["interactionType", interaction.type],
    ["interactionName", getInteractionName(interaction)],
    ["guildId", interaction.guild_id ?? null],
    ["channelId", "channel" in interaction ? interaction.channel.id : null],
  ]);
}

async function runInteractionJob(job: () => Promise<void>, progress: JobProgressLogger): Promise<void> {
  progress.step("started");
  try {
    await job();
    progress.step("completed");
  } catch (error) {
    progress.failed(error);
    throw error;
  }
}

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
        const progress = new JobProgressLogger(
          logService,
          "Discord interaction background job",
          getInteractionLogContext(interaction),
        );
        ctx.waitUntil(runInteractionJob(jobToComplete, progress));
      }

      return response;
    } catch (error) {
      logService.error(error, new Map([["context", "Discord interaction error"]]));

      return new Response("Internal error", { status: 500 });
    }
  });
};
