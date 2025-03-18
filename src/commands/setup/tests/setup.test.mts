import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import type { APIApplicationCommandInteraction, APIInteractionResponse } from "discord-api-types/v10";
import {
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
  InteractionType,
  Locale,
} from "discord-api-types/v10";
import { SetupCommand } from "../setup.mjs";
import type { Services } from "../../../services/install.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import { StatsReturnType } from "../../../services/database/types/guild_config.mjs";
import type { GuildConfigRow } from "../../../services/database/types/guild_config.mjs";
import { apiMessage, fakeBaseAPIApplicationCommandInteraction } from "../../../services/discord/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

const applicationCommandInteractionSetup: APIApplicationCommandInteraction = {
  ...fakeBaseAPIApplicationCommandInteraction,
  type: InteractionType.ApplicationCommand,
  guild: {
    features: [],
    id: "fake-guild-id",
    locale: Locale.EnglishUS,
  },
  guild_id: "fake-guild-id",
  data: {
    id: "1296081783443685377",
    name: "setup",
    options: [],
    resolved: {},
    type: ApplicationCommandType.ChatInput,
  },
};

describe("SetupCommand", () => {
  let setupCommand: SetupCommand;
  let services: Services;
  let updateDeferredReplySpy: MockInstance<typeof services.discordService.updateDeferredReply>;

  beforeEach(() => {
    vi.setSystemTime("2025-02-10T00:00:00.000Z");
    services = installFakeServicesWith();
    setupCommand = new SetupCommand(services);

    updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue(apiMessage);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("execute", () => {
    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = setupCommand.execute(applicationCommandInteractionSetup);

      expect(response).toEqual<APIInteractionResponse>({
        data: {
          flags: MessageFlags.Ephemeral,
        },
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: () => Promise<void>;
      let getGuildConfigSpy: MockInstance<typeof services.databaseService.getGuildConfig>;

      beforeEach(() => {
        getGuildConfigSpy = vi.spyOn(services.databaseService, "getGuildConfig");
        const { jobToComplete: jtc } = setupCommand.execute(applicationCommandInteractionSetup);
        jobToComplete = Preconditions.checkExists(jtc);
      });

      it("returns error if not in guild", async () => {
        const interaction: APIApplicationCommandInteraction = {
          ...applicationCommandInteractionSetup,
        };
        delete interaction.guild;
        delete interaction.guild_id;

        const { jobToComplete: jtc } = setupCommand.execute(interaction);
        jobToComplete = Preconditions.checkExists(jtc);

        await jobToComplete();

        expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
          content: "This command can only be used in a server!",
        });
      });

      it("displays current configuration", async () => {
        const mockConfig: GuildConfigRow = {
          GuildId: "fake-guild-id",
          StatsToReturn: StatsReturnType.SERIES_ONLY,
          NeatQueueSecret: null,
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        };

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        await jobToComplete();

        expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
          embeds: [
            {
              description: "Current configuration for your server:",
              fields: [
                {
                  inline: true,
                  name: "Stats Display Mode",
                  value: "Series Stats Only",
                },
                {
                  inline: true,
                  name: "NeatQueue Integration",
                  value: "❌ Not Configured",
                },
              ],
              timestamp: "2025-02-10T00:00:00.000Z",
              title: "Server Configuration",
            },
          ],
        });
      });

      it("handles database errors gracefully", async () => {
        getGuildConfigSpy.mockRejectedValue(new Error("Database error"));

        await jobToComplete();

        expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
          content: "Failed to fetch configuration: Database error",
        });
      });
    });
  });
});
