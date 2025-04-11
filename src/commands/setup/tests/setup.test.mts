import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import type { APIApplicationCommandInteraction, APIInteractionResponse } from "discord-api-types/v10";
import {
  GuildMemberFlags,
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
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";

const applicationCommandInteractionSetup: APIApplicationCommandInteraction = {
  ...fakeBaseAPIApplicationCommandInteraction,
  // TODO: remove this once its done
  member: {
    ...fakeBaseAPIApplicationCommandInteraction.member,
    user: {
      ...Preconditions.checkExists(fakeBaseAPIApplicationCommandInteraction.member).user,
      id: "237222473500852224",
    },
    permissions: "",
    deaf: false,
    flags: GuildMemberFlags.CompletedOnboarding,
    joined_at: "2025-02-10T00:00:00.000Z",
    roles: [],
    mute: false,
  },
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
          **NeatQueue Integrations:** *None*",
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
    });
  });
});
