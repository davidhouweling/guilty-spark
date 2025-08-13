import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import {
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
  InteractionType,
  Locale,
  ComponentType,
} from "discord-api-types/v10";
import type {
  APIApplicationCommandInteraction,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
} from "discord-api-types/v10";
import { SetupCommand } from "../setup.mjs";
import type { Services } from "../../../services/install.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import { StatsReturnType } from "../../../services/database/types/guild_config.mjs";
import type { GuildConfigRow } from "../../../services/database/types/guild_config.mjs";
import { apiMessage, fakeBaseAPIApplicationCommandInteraction } from "../../../services/discord/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";

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
  let env: Env;
  let updateDeferredReplySpy: MockInstance<typeof services.discordService.updateDeferredReply>;

  beforeEach(() => {
    vi.setSystemTime("2025-02-10T00:00:00.000Z");
    env = aFakeEnvWith();
    services = installFakeServicesWith({ env });
    setupCommand = new SetupCommand(services, env);

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

      it("returns error if not in guild", () => {
        const interaction: APIApplicationCommandInteraction = {
          ...applicationCommandInteractionSetup,
        };
        delete interaction.guild;
        delete interaction.guild_id;

        const { response, jobToComplete: jtc } = setupCommand.execute(interaction);

        expect(response).toMatchInlineSnapshot(`
          {
            "data": {
              "content": "This command can only be used in a server!",
              "flags": 64,
            },
            "type": 4,
          }
        `);
        expect(jtc).toBeUndefined();
      });

      it("displays current configuration", async () => {
        const mockConfig: GuildConfigRow = {
          GuildId: "fake-guild-id",
          StatsReturn: StatsReturnType.SERIES_ONLY,
          Medals: "Y",
          NeatQueueInformerPlayerConnections: "Y",
        };

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        await jobToComplete();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy.mock.lastCall).toMatchInlineSnapshot(`
          [
            "fake-token",
            {
              "components": [
                {
                  "components": [
                    {
                      "custom_id": "setup_select",
                      "options": [
                        {
                          "description": "Change the way stats are displayed in the server",
                          "label": "Configure Stats Display Mode",
                          "value": "stats_display_mode",
                        },
                        {
                          "description": "Configure the NeatQueue integration for your server",
                          "label": "Configure NeatQueue Integration",
                          "value": "neatqueue_integration",
                        },
                        {
                          "description": "Configure the NeatQueue informer - info when queues start and in play",
                          "label": "Configure NeatQueue Informer",
                          "value": "neatqueue_informer",
                        },
                      ],
                      "placeholder": "Select an option to configure",
                      "type": 3,
                    },
                  ],
                  "type": 1,
                },
              ],
              "embeds": [
                {
                  "description": "Current configuration for your server:",
                  "fields": [
                    {
                      "name": "",
                      "value": "**Stats Display Mode:** Series Stats Only, Medals
          **NeatQueue Integrations:** *None*
          **NeatQueue Informer:** Player connections enabled",
                    },
                  ],
                  "title": "Server Configuration",
                },
              ],
            },
          ]
        `);
      });

      it("handles database errors gracefully", async () => {
        getGuildConfigSpy.mockRejectedValue(new Error("Database error"));

        await jobToComplete();

        expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
          content: "Failed to fetch configuration: Database error",
        });
      });

      it("toggles NeatQueueInformerPlayerConnections when NeatQueue Informer button is pressed", async () => {
        const mockConfig: GuildConfigRow = {
          GuildId: "fake-guild-id",
          StatsReturn: StatsReturnType.SERIES_ONLY,
          Medals: "Y",
          NeatQueueInformerPlayerConnections: "Y",
        };

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        // Simulate pressing the NeatQueue Informer button
        const informerButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_players_on_start",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: informerJob } = setupCommand.execute(informerButtonInteraction);
        await Preconditions.checkExists(informerJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", { NeatQueueInformerPlayerConnections: "N" });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });

      it("enables NeatQueueInformerPlayerConnections when NeatQueue Informer button is pressed and currently disabled", async () => {
        const mockConfig: GuildConfigRow = {
          GuildId: "fake-guild-id",
          StatsReturn: StatsReturnType.SERIES_ONLY,
          Medals: "Y",
          NeatQueueInformerPlayerConnections: "N",
        };

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        const informerButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_players_on_start",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: informerJob } = setupCommand.execute(informerButtonInteraction);
        await Preconditions.checkExists(informerJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", { NeatQueueInformerPlayerConnections: "Y" });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });
    });
  });
});
