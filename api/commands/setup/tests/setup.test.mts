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
  APIMessageComponentSelectMenuInteraction,
} from "discord-api-types/v10";
import { SetupCommand } from "../setup.mjs";
import type { Services } from "../../../services/install.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import { MapsPostType, MapsPlaylistType, MapsFormatType } from "../../../services/database/types/guild_config.mjs";
import { apiMessage, fakeBaseAPIApplicationCommandInteraction } from "../../../services/discord/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake.mjs";

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
        const mockConfig = aFakeGuildConfigRow();

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
                  "color": 3447003,
                  "description": "Current configuration for your server:",
                  "fields": [
                    {
                      "name": "",
                      "value": "**Stats Display Mode:** Series Stats Only, Medals
          **NeatQueue Integrations:** *None*
          **NeatQueue Informer:** Player connections enabled, Live tracking disabled, Maps as a button",
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
        const mockConfig = aFakeGuildConfigRow();

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
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerPlayerConnections: "N",
        });

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

      it("enables NeatQueueInformerLiveTracking when live tracking toggle button is pressed and currently disabled", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "N",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        const liveTrackingButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking_toggle",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: liveTrackingJob } = setupCommand.execute(liveTrackingButtonInteraction);
        await Preconditions.checkExists(liveTrackingJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", { NeatQueueInformerLiveTracking: "Y" });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });

      it("disables NeatQueueInformerLiveTracking when live tracking toggle button is pressed and currently enabled", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "Y",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        const liveTrackingButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking_toggle",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: liveTrackingJob } = setupCommand.execute(liveTrackingButtonInteraction);
        await Preconditions.checkExists(liveTrackingJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", {
          NeatQueueInformerLiveTracking: "N",
          NeatQueueInformerLiveTrackingChannelName: "N",
        });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });

      it("handles errors when updating live tracking configuration", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "N",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi
          .spyOn(services.databaseService, "updateGuildConfig")
          .mockRejectedValue(new Error("Database error"));
        const updateDeferredReplyWithErrorSpy = vi
          .spyOn(services.discordService, "updateDeferredReplyWithError")
          .mockResolvedValue(apiMessage);

        const liveTrackingButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking_toggle",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: liveTrackingJob } = setupCommand.execute(liveTrackingButtonInteraction);
        await Preconditions.checkExists(liveTrackingJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", { NeatQueueInformerLiveTracking: "Y" });
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", new Error("Database error"));
      });

      it("enables NeatQueueInformerLiveTrackingChannelName when channel name button is pressed and currently disabled", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "Y",
          NeatQueueInformerLiveTrackingChannelName: "N",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        const channelNameButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking_channel_name",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: channelNameJob } = setupCommand.execute(channelNameButtonInteraction);
        await Preconditions.checkExists(channelNameJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", {
          NeatQueueInformerLiveTrackingChannelName: "Y",
        });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });

      it("disables NeatQueueInformerLiveTrackingChannelName when channel name button is pressed and currently enabled", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "Y",
          NeatQueueInformerLiveTrackingChannelName: "Y",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        const channelNameButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking_channel_name",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: channelNameJob } = setupCommand.execute(channelNameButtonInteraction);
        await Preconditions.checkExists(channelNameJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", {
          NeatQueueInformerLiveTrackingChannelName: "N",
        });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });

      it("handles errors when updating channel name configuration", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "Y",
          NeatQueueInformerLiveTrackingChannelName: "N",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi
          .spyOn(services.databaseService, "updateGuildConfig")
          .mockRejectedValue(new Error("Database error"));
        const updateDeferredReplyWithErrorSpy = vi
          .spyOn(services.discordService, "updateDeferredReplyWithError")
          .mockResolvedValue(apiMessage);

        const channelNameButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking_channel_name",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: channelNameJob } = setupCommand.execute(channelNameButtonInteraction);
        await Preconditions.checkExists(channelNameJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", {
          NeatQueueInformerLiveTrackingChannelName: "Y",
        });
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", new Error("Database error"));
      });

      it("navigates to Live Tracking configuration when live tracking button is pressed", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "Y",
          NeatQueueInformerLiveTrackingChannelName: "N",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        const liveTrackingButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: liveTrackingJob } = setupCommand.execute(liveTrackingButtonInteraction);
        await Preconditions.checkExists(liveTrackingJob)();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        expect(content?.embeds?.[0]?.title).toBe("Live Tracking Configuration");
        expect(content?.components).toHaveLength(2);
      });

      it("displays Live Tracking configuration with both options enabled", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "Y",
          NeatQueueInformerLiveTrackingChannelName: "Y",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        const liveTrackingButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: liveTrackingJob } = setupCommand.execute(liveTrackingButtonInteraction);
        await Preconditions.checkExists(liveTrackingJob)();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        const fieldValue = content?.embeds?.[0]?.fields?.[0]?.value;
        expect(fieldValue).toContain("**Live Tracking:** Enabled");
        expect(fieldValue).toContain("**Channel Name Updates:** Enabled");
      });

      it("displays Live Tracking configuration with channel name disabled when live tracking is disabled", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "N",
          NeatQueueInformerLiveTrackingChannelName: "N",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        const liveTrackingButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: liveTrackingJob } = setupCommand.execute(liveTrackingButtonInteraction);
        await Preconditions.checkExists(liveTrackingJob)();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        const fieldValue = content?.embeds?.[0]?.fields?.[0]?.value;
        expect(fieldValue).toContain("**Live Tracking:** Disabled");
        expect(fieldValue).toContain("**Channel Name Updates:** Disabled (requires live tracking)");
      });

      it("displays main configuration with channel name updates when both live tracking features are enabled", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "Y",
          NeatQueueInformerLiveTrackingChannelName: "Y",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        await jobToComplete();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        const fieldValue = content?.embeds?.[0]?.fields?.[0]?.value;
        expect(fieldValue).toContain("Live tracking enabled (with channel name updates)");
      });

      it("displays NeatQueue Informer overview with detailed Live Tracking status", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "Y",
          NeatQueueInformerLiveTrackingChannelName: "Y",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        const informerSelectInteraction: APIMessageComponentSelectMenuInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.StringSelect,
            custom_id: "setup_select",
            values: ["neatqueue_informer"],
          },
        } as APIMessageComponentSelectMenuInteraction;

        const { jobToComplete: informerJob } = setupCommand.execute(informerSelectInteraction);
        await Preconditions.checkExists(informerJob)();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        const fieldValue = content?.embeds?.[0]?.fields?.[0]?.value;
        expect(fieldValue).toContain("**Live Tracking:** Enabled (with channel name updates)");
      });

      it("displays Live Tracking configuration buttons with correct disabled state when live tracking is off", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "N",
          NeatQueueInformerLiveTrackingChannelName: "N",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        const liveTrackingButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: liveTrackingJob } = setupCommand.execute(liveTrackingButtonInteraction);
        await Preconditions.checkExists(liveTrackingJob)();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        const actionRow = content?.components?.[0];
        if (actionRow?.type === ComponentType.ActionRow) {
          const channelNameButton = actionRow.components.find(
            (component) =>
              "custom_id" in component &&
              component.custom_id === "setup_neat_queue_informer_live_tracking_channel_name",
          );
          expect(channelNameButton && "disabled" in channelNameButton ? channelNameButton.disabled : false).toBe(true);
        }
      });

      it("handles edge case where channel name is enabled but live tracking is disabled", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerLiveTracking: "N",
          NeatQueueInformerLiveTrackingChannelName: "Y",
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        const liveTrackingButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_live_tracking",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: liveTrackingJob } = setupCommand.execute(liveTrackingButtonInteraction);
        await Preconditions.checkExists(liveTrackingJob)();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        const fieldValue = content?.embeds?.[0]?.fields?.[0]?.value;
        expect(fieldValue).toContain("**Live Tracking:** Disabled");
        expect(fieldValue).toContain("**Channel Name Updates:** Enabled (requires live tracking)");
      });

      it("navigates to NeatQueue Informer Maps configuration when maps button is pressed", async () => {
        const mockConfig = aFakeGuildConfigRow();

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        const mapsButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_maps",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: mapsJob } = setupCommand.execute(mapsButtonInteraction);
        await Preconditions.checkExists(mapsJob)();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        expect(content?.embeds?.[0]?.title).toBe("NeatQueue Informer Maps Configuration");
        expect(content?.components).toHaveLength(5);
      });

      it("updates maps post configuration when post select is changed", async () => {
        const mockConfig = aFakeGuildConfigRow();

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        const postSelectInteraction: APIMessageComponentSelectMenuInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.StringSelect,
            custom_id: "setup_neat_queue_informer_maps_post",
            values: [MapsPostType.AUTO],
          },
        } as APIMessageComponentSelectMenuInteraction;

        const { jobToComplete: postJob } = setupCommand.execute(postSelectInteraction);
        await Preconditions.checkExists(postJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", {
          NeatQueueInformerMapsPost: MapsPostType.AUTO,
        });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });

      it("updates maps playlist configuration when playlist select is changed", async () => {
        const mockConfig = aFakeGuildConfigRow();

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        const playlistSelectInteraction: APIMessageComponentSelectMenuInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.StringSelect,
            custom_id: "setup_neat_queue_informer_maps_playlist",
            values: [MapsPlaylistType.HCS_HISTORICAL],
          },
        } as APIMessageComponentSelectMenuInteraction;

        const { jobToComplete: playlistJob } = setupCommand.execute(playlistSelectInteraction);
        await Preconditions.checkExists(playlistJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", {
          NeatQueueInformerMapsPlaylist: MapsPlaylistType.HCS_HISTORICAL,
        });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });

      it("updates maps format configuration when format select is changed", async () => {
        const mockConfig = aFakeGuildConfigRow();

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        const formatSelectInteraction: APIMessageComponentSelectMenuInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.StringSelect,
            custom_id: "setup_neat_queue_informer_maps_format",
            values: [MapsFormatType.RANDOM],
          },
        } as APIMessageComponentSelectMenuInteraction;

        const { jobToComplete: formatJob } = setupCommand.execute(formatSelectInteraction);
        await Preconditions.checkExists(formatJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", {
          NeatQueueInformerMapsFormat: MapsFormatType.RANDOM,
        });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });

      it("updates maps count configuration when count select is changed", async () => {
        const mockConfig = aFakeGuildConfigRow();

        getGuildConfigSpy.mockResolvedValue(mockConfig);
        const updateGuildConfigSpy = vi.spyOn(services.databaseService, "updateGuildConfig").mockResolvedValue();

        const countSelectInteraction: APIMessageComponentSelectMenuInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.StringSelect,
            custom_id: "setup_neat_queue_informer_maps_count",
            values: ["7"],
          },
        } as APIMessageComponentSelectMenuInteraction;

        const { jobToComplete: countJob } = setupCommand.execute(countSelectInteraction);
        await Preconditions.checkExists(countJob)();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id", {
          NeatQueueInformerMapsCount: 7,
        });
        expect(updateDeferredReplySpy).toHaveBeenCalled();
      });

      it("navigates back to NeatQueue Informer from maps configuration when back button is pressed", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerMapsPost: MapsPostType.AUTO,
          NeatQueueInformerMapsPlaylist: MapsPlaylistType.HCS_HISTORICAL,
          NeatQueueInformerMapsFormat: MapsFormatType.OBJECTIVE,
          NeatQueueInformerMapsCount: 3,
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        const backButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_maps_back",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: backJob } = setupCommand.execute(backButtonInteraction);
        await Preconditions.checkExists(backJob)();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        expect(content?.embeds?.[0]?.title).toBe("NeatQueue Informer");
        const fieldValue = content?.embeds?.[0]?.fields?.[0]?.value;
        expect(fieldValue).toContain("Player Connections on queue start");
        expect(fieldValue).toContain("Maps on queue start");
      });

      it("displays correct configuration values in NeatQueue Informer overview", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerPlayerConnections: "N",
          NeatQueueInformerMapsPost: MapsPostType.OFF,
          NeatQueueInformerMapsPlaylist: MapsPlaylistType.HCS_HISTORICAL,
          NeatQueueInformerMapsFormat: MapsFormatType.SLAYER,
          NeatQueueInformerMapsCount: 1,
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        const informerSelectInteraction: APIMessageComponentSelectMenuInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.StringSelect,
            custom_id: "setup_select",
            values: ["neatqueue_informer"],
          },
        } as APIMessageComponentSelectMenuInteraction;

        const { jobToComplete: informerJob } = setupCommand.execute(informerSelectInteraction);
        await Preconditions.checkExists(informerJob)();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        const fieldValue = content?.embeds?.[0]?.fields?.[0]?.value;
        expect(fieldValue).toContain("**Player Connections on queue start:** Disabled");
        expect(fieldValue).toContain("**Maps on queue start:** Off, HCS - Historical, Slayer only, 1 maps");
      });

      it("displays updated configuration in main menu", async () => {
        const mockConfig = aFakeGuildConfigRow({
          NeatQueueInformerMapsPost: MapsPostType.AUTO,
          NeatQueueInformerMapsCount: 7,
        });

        getGuildConfigSpy.mockResolvedValue(mockConfig);

        await jobToComplete();

        expect(updateDeferredReplySpy).toHaveBeenCalled();
        const [, content] = updateDeferredReplySpy.mock.lastCall ?? [];
        const fieldValue = content?.embeds?.[0]?.fields?.[0]?.value;
        expect(fieldValue).toContain("Player connections enabled, Live tracking disabled, Maps automatic");
      });

      it("handles errors in maps configuration gracefully", async () => {
        getGuildConfigSpy.mockRejectedValue(new Error("Database connection failed"));
        const updateDeferredReplyWithErrorSpy = vi.spyOn(services.discordService, "updateDeferredReplyWithError");

        const mapsButtonInteraction: APIMessageComponentButtonInteraction = {
          ...applicationCommandInteractionSetup,
          type: InteractionType.MessageComponent,
          data: {
            component_type: ComponentType.Button,
            custom_id: "setup_neat_queue_informer_maps",
          },
        } as APIMessageComponentButtonInteraction;

        const { jobToComplete: mapsJob } = setupCommand.execute(mapsButtonInteraction);
        await Preconditions.checkExists(mapsJob)();

        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
          "fake-token",
          new Error("Database connection failed"),
        );
      });
    });
  });
});
