import type { MockInstance } from "vitest";
import { describe, beforeEach, vi, it, expect } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIGuildMember,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import {
  ButtonStyle,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  Locale,
} from "discord-api-types/v10";
import { TrackCommand } from "../track.mjs";
import type { LiveTrackerEmbedData } from "../../../live-tracker/types.mjs";
import { InteractionComponent } from "../../../embeds/live-tracker-embed.mjs";
import type { Services } from "../../../services/install.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import {
  apiMessage,
  fakeBaseAPIApplicationCommandInteraction,
  fakeButtonClickInteraction,
  discordNeatQueueData,
} from "../../../services/discord/fakes/data.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";
import type { LiveTrackerService } from "../../../services/live-tracker/live-tracker.mjs";
import { aFakeLiveTrackerStateWith } from "../../../durable-objects/fakes/live-tracker-do.fake.mjs";
import type { LiveTrackerRefreshResponse } from "../../../durable-objects/types.mjs";

const applicationCommandInteractionTrackNeatQueue: APIApplicationCommandInteraction = {
  ...fakeBaseAPIApplicationCommandInteraction,
  type: InteractionType.ApplicationCommand,
  guild: {
    features: [],
    id: "fake-guild-id",
    locale: Locale.EnglishUS,
  },
  guild_id: "fake-guild-id",
  data: {
    id: "fake-command-id",
    name: "track",
    options: [
      {
        name: "neatqueue",
        options: [
          {
            name: "channel",
            value: "1234567890",
            type: ApplicationCommandOptionType.Channel,
          },
          {
            name: "queue",
            value: 42,
            type: ApplicationCommandOptionType.Integer,
          },
        ],
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
    type: ApplicationCommandType.ChatInput,
  },
};

describe("TrackCommand", () => {
  let trackCommand: TrackCommand;
  let services: Services;
  let env: Env;
  let updateDeferredReplySpy: MockInstance<DiscordService["updateDeferredReply"]>;
  let editMessageSpy: MockInstance<DiscordService["editMessage"]>;

  beforeEach(() => {
    services = installFakeServicesWith();
    env = aFakeEnvWith();
    trackCommand = new TrackCommand(services, env);

    updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue(apiMessage);
    editMessageSpy = vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
  });

  describe("execute(): subcommand neatqueue", () => {
    beforeEach(() => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "neatqueue",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([
          ["channel", "1234567890"],
          ["queue", 42],
        ]),
        options: [],
      });
    });

    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = trackCommand.execute(applicationCommandInteractionTrackNeatQueue);

      expect(response).toEqual<APIInteractionResponse>({
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;
      let getTeamsFromQueueChannelSpy: MockInstance<typeof services.discordService.getTeamsFromQueueChannel>;
      let startTrackerSpy: MockInstance<LiveTrackerService["startTracker"]>;

      beforeEach(() => {
        getTeamsFromQueueChannelSpy = vi
          .spyOn(services.discordService, "getTeamsFromQueueChannel")
          .mockResolvedValue(discordNeatQueueData);

        startTrackerSpy = vi.spyOn(services.liveTrackerService, "startTracker").mockResolvedValue({
          success: true,
          state: {
            userId: "fake-user-id",
            guildId: "fake-guild-id",
            channelId: "1234567890",
            queueNumber: 42,
            status: "active",
            isPaused: false,
            startTime: "2024-11-26T10:48:00.000Z",
            lastUpdateTime: "2024-11-26T10:48:00.000Z",
            searchStartTime: "2024-11-26T10:48:00.000Z",
            checkCount: 0,
            players: {},
            teams: [],
            substitutions: [],
            errorState: {
              consecutiveErrors: 0,
              backoffMinutes: 1,
              lastSuccessTime: "2024-11-26T10:48:00.000Z",
            },
            discoveredMatches: {},
            rawMatches: {},
            seriesScore: "🦅 0:0 🐍",
            lastMessageState: {
              matchCount: 0,
              substitutionCount: 0,
            },
          },
        });

        const { jobToComplete: jtc } = trackCommand.execute(applicationCommandInteractionTrackNeatQueue);
        jobToComplete = jtc;
      });

      it("fetches queue data from discordService", async () => {
        await jobToComplete?.();

        expect(getTeamsFromQueueChannelSpy).toHaveBeenCalledWith("fake-guild-id", "1234567890");
      });

      it("calls updateDeferredReply when no queue data is returned", async () => {
        getTeamsFromQueueChannelSpy.mockReset().mockResolvedValue(null);

        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        const callArgs = updateDeferredReplySpy.mock.lastCall;
        expect(callArgs?.[0]).toBe("fake-token");
        expect(callArgs?.[1]).toEqual({
          embeds: [
            expect.objectContaining({
              description: "No active queue found in the specified channel.",
            }),
          ],
          components: [],
        });
      });

      it("starts live tracking via service", async () => {
        await jobToComplete?.();

        expect(startTrackerSpy).toHaveBeenCalledWith({
          userId: "discord_user_01",
          guildId: "fake-guild-id",
          channelId: "1234567890",
          queueNumber: 777,
          interactionToken: "fake-token",
          players: expect.any(Object) as Record<string, APIGuildMember>,
          teams: [
            {
              name: "Eagle",
              playerIds: ["000000000000000001", "000000000000000002", "000000000000000003", "000000000000000004"],
            },
            {
              name: "Cobra",
              playerIds: ["000000000000000005", "000000000000000006", "000000000000000007", "000000000000000008"],
            },
          ],
          queueStartTime: "2024-11-26T11:30:00.000Z",
        });
      });

      it("handles service errors gracefully", async () => {
        startTrackerSpy.mockRejectedValue(new Error("Service initialization failed"));

        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        const callArgs = updateDeferredReplySpy.mock.lastCall;
        expect(callArgs?.[0]).toBe("fake-token");
        expect(callArgs?.[1]).toHaveProperty("embeds");
      });
    });
  });

  describe("execute(): button interactions", () => {
    let pauseTrackerSpy: MockInstance<LiveTrackerService["pauseTracker"]>;
    let resumeTrackerSpy: MockInstance<LiveTrackerService["resumeTracker"]>;
    let refreshTrackerSpy: MockInstance<LiveTrackerService["refreshTracker"]>;
    let repostTrackerSpy: MockInstance<LiveTrackerService["repostTracker"]>;

    beforeEach(() => {
      const mockQueueData = {
        ...discordNeatQueueData,
        queue: 42,
      };
      vi.spyOn(services.discordService, "getTeamsFromQueueChannel").mockResolvedValue(mockQueueData);

      pauseTrackerSpy = vi.spyOn(services.liveTrackerService, "pauseTracker");
      resumeTrackerSpy = vi.spyOn(services.liveTrackerService, "resumeTracker");
      refreshTrackerSpy = vi.spyOn(services.liveTrackerService, "refreshTracker");
      repostTrackerSpy = vi.spyOn(services.liveTrackerService, "repostTracker");
    });

    describe("pause button", () => {
      const pauseButtonInteraction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          ...fakeButtonClickInteraction.data,
          custom_id: InteractionComponent.Pause,
        },
      };

      it("returns deferred response", () => {
        const { response } = trackCommand.execute(pauseButtonInteraction);

        expect(response).toEqual<APIInteractionResponse>({
          type: InteractionResponseType.DeferredMessageUpdate,
        });
      });

      it("calls pause tracker service", async () => {
        pauseTrackerSpy.mockResolvedValue({
          success: true,
          state: aFakeLiveTrackerStateWith({
            status: "paused",
            isPaused: true,
          }),
        });

        const { jobToComplete } = trackCommand.execute(pauseButtonInteraction);
        await jobToComplete?.();

        expect(pauseTrackerSpy).toHaveBeenCalledWith({
          userId: "discord_user_01",
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
          queueNumber: 42,
        });
      });

      it("handles errors gracefully", async () => {
        pauseTrackerSpy.mockRejectedValue(new Error("Pause failed"));

        const { jobToComplete } = trackCommand.execute(pauseButtonInteraction);
        await jobToComplete?.();

        expect(editMessageSpy).toHaveBeenCalledOnce();
        const callArgs = editMessageSpy.mock.lastCall;
        expect(callArgs?.[0]).toBe("fake-channel-id");
        expect(callArgs?.[1]).toBe("fake-message-id");
        expect(callArgs?.[2]).toHaveProperty("embeds");
      });

      it("uses enriched embed data when returned by service", async () => {
        const enrichedEmbedData: LiveTrackerEmbedData = {
          userId: "fake-user-id",
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
          queueNumber: 123,
          status: "active",
          isPaused: true,
          lastUpdated: new Date(),
          nextCheck: new Date(),
          enrichedMatches: [
            {
              matchId: "match1",
              gameTypeAndMap: "Slayer on Recharge",
              gameType: "Slayer",
              gameMap: "Recharge",
              gameMapThumbnailUrl: "data:,",
              duration: "7m 30s",
              gameScore: "50:47",
              gameSubScore: null,
              endTime: new Date().toISOString(),
              playerXuidToGametag: {},
            },
          ],
          seriesScore: "2:1",
          substitutions: [],
          errorState: undefined,
        };

        pauseTrackerSpy.mockResolvedValue({
          success: true,
          state: aFakeLiveTrackerStateWith({
            status: "paused",
            isPaused: true,
          }),
          embedData: enrichedEmbedData,
        });

        const { jobToComplete } = trackCommand.execute(pauseButtonInteraction);

        let error: unknown;
        try {
          await jobToComplete?.();
        } catch (e) {
          error = e;
        }

        expect(error).toBeUndefined();
        expect(editMessageSpy).toHaveBeenCalledOnce();
        const callArgs = editMessageSpy.mock.lastCall;
        expect(callArgs?.[2]).toHaveProperty("embeds");
        const messageData = callArgs?.[2] as Partial<RESTPostAPIChannelMessageJSONBody>;
        expect(messageData.embeds?.[0]?.description).toBe("**Live Tracking Paused**");
      });

      it("falls back to basic embed when no enriched data returned", async () => {
        pauseTrackerSpy.mockResolvedValue({
          success: true,
          state: aFakeLiveTrackerStateWith({
            status: "paused",
            isPaused: true,
          }),
          // No embedData returned
        });

        const { jobToComplete } = trackCommand.execute(pauseButtonInteraction);
        await jobToComplete?.();

        expect(editMessageSpy).toHaveBeenCalledOnce();
        const callArgs = editMessageSpy.mock.lastCall;
        expect(callArgs?.[2]).toHaveProperty("embeds");
      });
    });

    describe("resume button", () => {
      const resumeButtonInteraction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          ...fakeButtonClickInteraction.data,
          custom_id: InteractionComponent.Resume,
        },
      };

      it("calls resume tracker service", async () => {
        resumeTrackerSpy.mockResolvedValue({
          success: true,
          state: aFakeLiveTrackerStateWith({
            status: "active",
            isPaused: false,
          }),
        });

        const { jobToComplete } = trackCommand.execute(resumeButtonInteraction);
        await jobToComplete?.();

        expect(resumeTrackerSpy).toHaveBeenCalledWith({
          userId: "discord_user_01",
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
          queueNumber: 42,
        });
      });

      it("uses enriched embed data when returned by service", async () => {
        const enrichedEmbedData: LiveTrackerEmbedData = {
          userId: "fake-user-id",
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
          queueNumber: 123,
          status: "active",
          isPaused: false,
          lastUpdated: new Date(),
          nextCheck: new Date(Date.now() + 180000), // 3 minutes from now
          enrichedMatches: [
            {
              matchId: "match1",
              gameTypeAndMap: "Slayer on Recharge",
              gameType: "Slayer",
              gameMap: "Recharge",
              gameMapThumbnailUrl: "data:,",
              duration: "7m 30s",
              gameScore: "50:47",
              gameSubScore: null,
              endTime: new Date().toISOString(),
              playerXuidToGametag: {},
            },
          ],
          seriesScore: "2:1",
          substitutions: [],
          errorState: undefined,
        };

        resumeTrackerSpy.mockResolvedValue({
          success: true,
          state: aFakeLiveTrackerStateWith({
            status: "active",
            isPaused: false,
          }),
          embedData: enrichedEmbedData,
        });

        const { jobToComplete } = trackCommand.execute(resumeButtonInteraction);
        await jobToComplete?.();

        expect(editMessageSpy).toHaveBeenCalledOnce();
        const callArgs = editMessageSpy.mock.lastCall;
        expect(callArgs?.[2]).toHaveProperty("embeds");
        const messageData = callArgs?.[2] as Partial<RESTPostAPIChannelMessageJSONBody>;
        expect(messageData.embeds?.[0]?.description).toBe("**Live Tracking Active**");
      });
    });

    describe("refresh button", () => {
      const refreshButtonInteraction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          ...fakeButtonClickInteraction.data,
          custom_id: InteractionComponent.Refresh,
        },
      };

      it("calls refresh tracker service", async () => {
        refreshTrackerSpy.mockResolvedValue({
          success: true,
          state: aFakeLiveTrackerStateWith({ status: "active", isPaused: false }),
        });

        const { jobToComplete } = trackCommand.execute(refreshButtonInteraction);
        await jobToComplete?.();

        expect(refreshTrackerSpy).toHaveBeenCalledWith({
          userId: "discord_user_01",
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
          queueNumber: 42,
        });
      });

      it("handles cooldown response gracefully", async () => {
        const handleRefreshCooldownSpy = vi
          .spyOn(services.liveTrackerService, "handleRefreshCooldown")
          .mockResolvedValue();

        const cooldownResponse: LiveTrackerRefreshResponse = {
          success: false,
          error: "cooldown",
          message: "Refresh cooldown active, next refresh available <t:1695800000:R>",
        };

        refreshTrackerSpy.mockResolvedValue(cooldownResponse);

        const { jobToComplete } = trackCommand.execute(refreshButtonInteraction);
        await jobToComplete?.();

        expect(refreshTrackerSpy).toHaveBeenCalledWith({
          userId: "discord_user_01",
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
          queueNumber: 42,
        });

        expect(handleRefreshCooldownSpy).toHaveBeenCalledWith({
          interaction: refreshButtonInteraction,
          response: cooldownResponse,
        });
      });

      it("continues with normal error handling for non-cooldown failures", async () => {
        refreshTrackerSpy.mockRejectedValue(new Error("Internal Server Error"));

        const { jobToComplete } = trackCommand.execute(refreshButtonInteraction);
        await jobToComplete?.();

        expect(refreshTrackerSpy).toHaveBeenCalledWith({
          userId: "discord_user_01",
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
          queueNumber: 42,
        });
      });
    });

    describe("repost button", () => {
      const repostButtonInteraction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          ...fakeButtonClickInteraction.data,
          custom_id: InteractionComponent.Repost,
        },
        message: {
          ...apiMessage,
          embeds: [
            {
              title: "Live Tracker - Queue #123",
              description: "Test description",
            },
          ],
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  style: ButtonStyle.Primary,
                  custom_id: "test_button",
                  label: "Test Button",
                },
              ],
            },
          ],
          content: "Test content",
        },
      };

      it("creates new message with same content, deletes original, and updates service message ID", async () => {
        const newMessage = { ...apiMessage, id: "new-message-id-456" };
        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(newMessage);
        const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        repostTrackerSpy.mockResolvedValue({
          success: true,
          oldMessageId: "fake-message-id",
          newMessageId: "new-message-id-456",
        });

        const { jobToComplete } = trackCommand.execute(repostButtonInteraction);
        await jobToComplete?.();

        expect(createMessageSpy).toHaveBeenCalledWith(repostButtonInteraction.channel.id, {
          embeds: repostButtonInteraction.message.embeds,
          components: repostButtonInteraction.message.components,
          content: repostButtonInteraction.message.content,
        });

        expect(deleteMessageSpy).toHaveBeenCalledWith(
          repostButtonInteraction.channel.id,
          repostButtonInteraction.message.id,
          "Reposting maps",
        );

        expect(repostTrackerSpy).toHaveBeenCalledWith({
          context: {
            userId: "",
            guildId: "fake-guild-id",
            channelId: "fake-channel-id",
            queueNumber: 123,
          },
          newMessageId: "new-message-id-456",
        });
      });

      it("handles case when queue number cannot be extracted from title", async () => {
        const repostInteractionWithoutQueue = {
          ...repostButtonInteraction,
          message: {
            ...repostButtonInteraction.message,
            embeds: [
              {
                title: "Test Embed",
                description: "Test description",
              },
            ],
          },
        };

        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
        const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        const { jobToComplete } = trackCommand.execute(repostInteractionWithoutQueue);
        await jobToComplete?.();

        expect(createMessageSpy).toHaveBeenCalled();
        expect(deleteMessageSpy).toHaveBeenCalled();
        expect(repostTrackerSpy).not.toHaveBeenCalled();
      });

      it("handles service update failure gracefully", async () => {
        const newMessage = { ...apiMessage, id: "new-message-id-456" };
        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(newMessage);
        const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        repostTrackerSpy.mockRejectedValue(new Error("Service update failed"));

        const { jobToComplete } = trackCommand.execute(repostButtonInteraction);
        await jobToComplete?.();

        expect(createMessageSpy).toHaveBeenCalled();
        expect(deleteMessageSpy).toHaveBeenCalled();
        expect(repostTrackerSpy).toHaveBeenCalled();
      });

      it("returns deferred message update response", () => {
        const response = trackCommand.execute(repostButtonInteraction);

        expect(response.response).toEqual({
          type: InteractionResponseType.DeferredMessageUpdate,
        });
      });
    });
  });
});
