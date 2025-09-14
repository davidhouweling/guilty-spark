import type { MockInstance } from "vitest";
import { describe, beforeEach, vi, it, expect } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
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
import {
  aFakeDurableObjectId,
  aFakeLiveTrackerDOWith,
  type FakeLiveTrackerDO,
} from "../../../durable-objects/fakes/live-tracker-do.fake.mjs";
import type { LiveTrackerStartData } from "../../../durable-objects/live-tracker-do.mjs";

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
  let updateDeferredReplySpy: MockInstance;
  let editMessageSpy: MockInstance;

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
      let liveTrackerDoStub: FakeLiveTrackerDO;

      beforeEach(() => {
        getTeamsFromQueueChannelSpy = vi
          .spyOn(services.discordService, "getTeamsFromQueueChannel")
          .mockResolvedValue(discordNeatQueueData);

        // Mock Durable Object stub using the fake
        liveTrackerDoStub = aFakeLiveTrackerDOWith();
        vi.spyOn(env.LIVE_TRACKER_DO, "get").mockReturnValue(liveTrackerDoStub);
        vi.spyOn(env.LIVE_TRACKER_DO, "idFromName").mockReturnValue(aFakeDurableObjectId());

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

      it("starts live tracking via Durable Object", async () => {
        await jobToComplete?.();

        const startData: LiveTrackerStartData = {
          userId: "discord_user_01",
          guildId: "fake-guild-id",
          channelId: "1234567890",
          queueNumber: 777,
          interactionToken: "fake-token",
          teams: discordNeatQueueData.teams,
          queueStartTime: discordNeatQueueData.timestamp.toISOString(),
        };
        expect(liveTrackerDoStub.fetch).toHaveBeenCalledWith("http://do/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(startData),
        });
      });

      it("handles Durable Object errors gracefully", async () => {
        liveTrackerDoStub.fetch.mockRejectedValue(new Error("DO initialization failed"));

        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        const callArgs = updateDeferredReplySpy.mock.lastCall;
        expect(callArgs?.[0]).toBe("fake-token");
        expect(callArgs?.[1]).toHaveProperty("embeds");
      });
    });
  });

  describe("execute(): button interactions", () => {
    let liveTrackerDoStub: FakeLiveTrackerDO;

    beforeEach(() => {
      // Mock the queue data lookup used by getTrackerStatus
      vi.spyOn(services.discordService, "getTeamsFromQueueChannel").mockResolvedValue(discordNeatQueueData);

      // Mock Durable Object stub using the fake
      liveTrackerDoStub = aFakeLiveTrackerDOWith();
      vi.spyOn(env.LIVE_TRACKER_DO, "get").mockReturnValue(liveTrackerDoStub);
      vi.spyOn(env.LIVE_TRACKER_DO, "idFromName").mockReturnValue(aFakeDurableObjectId());
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

      it("calls pause on Durable Object", async () => {
        const { jobToComplete } = trackCommand.execute(pauseButtonInteraction);
        await jobToComplete?.();

        expect(liveTrackerDoStub.fetch).toHaveBeenCalledWith("http://do/pause", {
          method: "POST",
        });
      });

      it("handles errors gracefully", async () => {
        liveTrackerDoStub.fetch.mockRejectedValue(new Error("Pause failed"));

        const { jobToComplete } = trackCommand.execute(pauseButtonInteraction);
        await jobToComplete?.();

        expect(editMessageSpy).toHaveBeenCalledOnce();
        const callArgs = editMessageSpy.mock.lastCall;
        expect(callArgs?.[0]).toBe("fake-channel-id"); // channel ID
        expect(callArgs?.[1]).toBe("fake-message-id"); // message ID
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

      it("calls resume on Durable Object", async () => {
        const { jobToComplete } = trackCommand.execute(resumeButtonInteraction);
        await jobToComplete?.();

        expect(liveTrackerDoStub.fetch).toHaveBeenCalledWith("http://do/resume", {
          method: "POST",
        });
      });
    });

    describe("stop button", () => {
      const stopButtonInteraction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          ...fakeButtonClickInteraction.data,
          custom_id: InteractionComponent.Stop,
        },
      };

      it("calls stop on Durable Object", async () => {
        const { jobToComplete } = trackCommand.execute(stopButtonInteraction);
        await jobToComplete?.();

        expect(liveTrackerDoStub.fetch).toHaveBeenCalledWith("http://do/stop", {
          method: "POST",
        });
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

      it("calls refresh on Durable Object", async () => {
        const { jobToComplete } = trackCommand.execute(refreshButtonInteraction);
        await jobToComplete?.();

        expect(liveTrackerDoStub.fetch).toHaveBeenCalledWith("http://do/refresh", {
          method: "POST",
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
              title: "🟢 Live Tracker - Queue #123",
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

      it("creates new message with same content, deletes original, and updates DO message ID", async () => {
        const newMessage = { ...apiMessage, id: "new-message-id-456" };
        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(newMessage);
        const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        // Mock the DO repost endpoint call
        const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ success: true }) };
        liveTrackerDoStub.fetch.mockResolvedValue(mockResponse as never);

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

        expect(liveTrackerDoStub.fetch).toHaveBeenCalledWith("http://do/repost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newMessageId: "new-message-id-456" }),
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
        expect(liveTrackerDoStub.fetch).not.toHaveBeenCalled();
      });

      it("handles DO update failure gracefully", async () => {
        const newMessage = { ...apiMessage, id: "new-message-id-456" };
        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(newMessage);
        const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        const mockResponse = { ok: false, status: 400 };
        liveTrackerDoStub.fetch.mockResolvedValue(mockResponse as never);

        const { jobToComplete } = trackCommand.execute(repostButtonInteraction);
        await jobToComplete?.();

        expect(createMessageSpy).toHaveBeenCalled();
        expect(deleteMessageSpy).toHaveBeenCalled();
        expect(liveTrackerDoStub.fetch).toHaveBeenCalled();
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
