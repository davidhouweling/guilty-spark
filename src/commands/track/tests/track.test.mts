import type { MockInstance } from "vitest";
import { describe, beforeEach, vi, it, expect } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIEmbed,
  APIEmbedField,
  APIGuildMember,
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
import type { LiveTrackerEmbedData } from "../../../embeds/live-tracker-embed.mjs";
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
import type { LiveTrackerStartRequest } from "../../../durable-objects/types.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";

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
      let liveTrackerDoStub: FakeLiveTrackerDO;
      let fetchSpy: MockInstance<FakeLiveTrackerDO["fetch"]>;

      beforeEach(() => {
        getTeamsFromQueueChannelSpy = vi
          .spyOn(services.discordService, "getTeamsFromQueueChannel")
          .mockResolvedValue(discordNeatQueueData);

        liveTrackerDoStub = aFakeLiveTrackerDOWith();
        fetchSpy = vi.spyOn(liveTrackerDoStub, "fetch");
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

        const players = discordNeatQueueData.teams.flatMap(({ players: p }) => p);
        const teams = discordNeatQueueData.teams.map((team) => ({
          name: team.name,
          playerIds: team.players.map((player) => player.user.id),
        }));

        const startData: LiveTrackerStartRequest = {
          userId: "discord_user_01",
          guildId: "fake-guild-id",
          channelId: "1234567890",
          queueNumber: 777,
          interactionToken: "fake-token",
          players: players.reduce<Record<string, APIGuildMember>>((acc, player) => {
            acc[player.user.id] = player;
            return acc;
          }, {}),
          teams,
          queueStartTime: discordNeatQueueData.timestamp.toISOString(),
        };
        expect(fetchSpy).toHaveBeenCalledWith("http://do/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(startData),
        });
      });

      it("handles Durable Object errors gracefully", async () => {
        fetchSpy.mockRejectedValue(new Error("DO initialization failed"));

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
    let fetchSpy: MockInstance<FakeLiveTrackerDO["fetch"]>;

    beforeEach(() => {
      const mockQueueData = {
        ...discordNeatQueueData,
        queue: 42,
      };
      vi.spyOn(services.discordService, "getTeamsFromQueueChannel").mockResolvedValue(mockQueueData);

      liveTrackerDoStub = aFakeLiveTrackerDOWith();
      fetchSpy = vi.spyOn(liveTrackerDoStub, "fetch");
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

        expect(fetchSpy).toHaveBeenCalledWith("http://do/pause", {
          method: "POST",
        });
      });

      it("handles errors gracefully", async () => {
        fetchSpy.mockRejectedValue(new Error("Pause failed"));

        const { jobToComplete } = trackCommand.execute(pauseButtonInteraction);
        await jobToComplete?.();

        expect(editMessageSpy).toHaveBeenCalledOnce();
        const callArgs = editMessageSpy.mock.lastCall;
        expect(callArgs?.[0]).toBe("fake-channel-id");
        expect(callArgs?.[1]).toBe("fake-message-id");
        expect(callArgs?.[2]).toHaveProperty("embeds");
      });

      it("uses enriched embed data when returned by Durable Object", async () => {
        const enrichedEmbedData: LiveTrackerEmbedData = {
          userId: "fake-user-id",
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
          queueNumber: 123,
          status: "active" as const,
          isPaused: true,
          lastUpdated: new Date(),
          nextCheck: new Date(),
          enrichedMatches: [
            {
              matchId: "match1",
              gameTypeAndMap: "Slayer on Recharge",
              duration: "7m 30s",
              gameScore: "50:47",
              endTime: new Date(),
            },
          ],
          seriesScore: "2:1",
          substitutions: [],
          errorState: undefined,
        };

        fetchSpy.mockImplementation(async (url: string | URL | Request) => {
          let urlString: string;
          if (typeof url === "string") {
            urlString = url;
          } else if (url instanceof URL) {
            urlString = url.href;
          } else {
            urlString = url.url;
          }

          if (urlString.includes("/status")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  state: {
                    queueNumber: 42,
                    userId: "fake-user-id",
                    guildId: "fake-guild-id",
                    channelId: "fake-channel-id",
                    status: "active",
                    isPaused: false,
                  },
                }),
              ),
            );
          } else if (urlString.includes("/pause")) {
            return Promise.resolve(
              new Response(JSON.stringify({ success: true, state: {}, embedData: enrichedEmbedData })),
            );
          }
          return Promise.resolve(new Response(JSON.stringify({ success: false })));
        });

        const { jobToComplete } = trackCommand.execute(pauseButtonInteraction);

        let error: unknown;
        try {
          await jobToComplete?.();
        } catch (e) {
          error = e;
        }

        if (error !== null) {
          console.log("Error occurred:", error);
        }

        expect(editMessageSpy).toHaveBeenCalledOnce();
        const callArgs = editMessageSpy.mock.lastCall;
        expect(callArgs?.[2]).toHaveProperty("embeds");
        const messageData = callArgs?.[2] as { embeds?: { description?: string; title?: string }[] };
        console.log("Actual description:", messageData.embeds?.[0]?.description);
        console.log("Actual title:", messageData.embeds?.[0]?.title);
        console.log("Full embed:", JSON.stringify(messageData.embeds?.[0], null, 2));
        expect(messageData.embeds?.[0]?.description).toBe("**Live Tracking Paused**");
      });

      it("falls back to basic embed when no enriched data returned", async () => {
        fetchSpy.mockImplementation(async (url: string | URL | Request) => {
          let urlString: string;
          if (typeof url === "string") {
            urlString = url;
          } else if (url instanceof URL) {
            urlString = url.href;
          } else {
            urlString = url.url;
          }

          if (urlString.includes("/status")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  state: {
                    queueNumber: 42,
                    userId: "fake-user-id",
                    guildId: "fake-guild-id",
                    channelId: "fake-channel-id",
                    status: "active",
                    isPaused: false,
                  },
                }),
              ),
            );
          } else if (urlString.includes("/pause")) {
            return Promise.resolve(new Response(JSON.stringify({ success: true, state: {} })));
          }
          return Promise.resolve(new Response(JSON.stringify({ success: false })));
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

      it("calls resume on Durable Object", async () => {
        const { jobToComplete } = trackCommand.execute(resumeButtonInteraction);
        await jobToComplete?.();

        expect(fetchSpy).toHaveBeenCalledWith("http://do/resume", {
          method: "POST",
        });
      });

      it("uses enriched embed data when returned by Durable Object", async () => {
        const enrichedEmbedData: LiveTrackerEmbedData = {
          userId: "fake-user-id",
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
          queueNumber: 123,
          status: "active" as const,
          isPaused: false,
          lastUpdated: new Date(),
          nextCheck: new Date(Date.now() + 180000), // 3 minutes from now
          enrichedMatches: [
            {
              matchId: "match1",
              gameTypeAndMap: "Slayer on Recharge",
              duration: "7m 30s",
              gameScore: "50:47",
              endTime: new Date(),
            },
          ],
          seriesScore: "2:1",
          substitutions: [],
          errorState: undefined,
        };

        fetchSpy.mockImplementation(async (url: string | URL | Request) => {
          let urlString: string;
          if (typeof url === "string") {
            urlString = url;
          } else if (url instanceof URL) {
            urlString = url.href;
          } else {
            urlString = url.url;
          }

          if (urlString.includes("/status")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  state: {
                    queueNumber: 42,
                    userId: "fake-user-id",
                    guildId: "fake-guild-id",
                    channelId: "fake-channel-id",
                    status: "active",
                    isPaused: false,
                  },
                }),
              ),
            );
          } else if (urlString.includes("/resume")) {
            return Promise.resolve(
              new Response(JSON.stringify({ success: true, state: {}, embedData: enrichedEmbedData })),
            );
          }
          return Promise.resolve(new Response(JSON.stringify({ success: false })));
        });

        const { jobToComplete } = trackCommand.execute(resumeButtonInteraction);
        await jobToComplete?.();

        expect(editMessageSpy).toHaveBeenCalledOnce();
        const callArgs = editMessageSpy.mock.lastCall;
        expect(callArgs?.[2]).toHaveProperty("embeds");
        const messageData = callArgs?.[2] as { embeds?: { description?: string }[] };
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

      it("calls refresh on Durable Object", async () => {
        const { jobToComplete } = trackCommand.execute(refreshButtonInteraction);
        await jobToComplete?.();

        expect(fetchSpy).toHaveBeenCalledWith("http://do/refresh", {
          method: "POST",
        });
      });

      it("handles cooldown response gracefully", async () => {
        const statusResponse = new Response(
          JSON.stringify({
            state: {
              queueNumber: 42,
              status: "active",
            },
          }),
          { status: 200 },
        );

        const cooldownResponse = new Response(
          JSON.stringify({
            success: false,
            error: "cooldown",
            message: "Refresh cooldown active, next refresh available <t:1695800000:R>",
            remainingSeconds: 20,
          }),
          { status: 429 },
        );

        fetchSpy.mockResolvedValueOnce(statusResponse).mockResolvedValueOnce(cooldownResponse);

        const { jobToComplete } = trackCommand.execute(refreshButtonInteraction);
        await jobToComplete?.();

        expect(fetchSpy).toHaveBeenCalledWith("http://do/status", {
          method: "GET",
        });
        expect(fetchSpy).toHaveBeenCalledWith("http://do/refresh", {
          method: "POST",
        });

        expect(editMessageSpy).toHaveBeenCalledWith(
          refreshButtonInteraction.channel.id,
          refreshButtonInteraction.message.id,
          expect.objectContaining({
            embeds: expect.arrayContaining([
              expect.objectContaining({
                fields: expect.arrayContaining([
                  expect.objectContaining({
                    name: "⚠️ Refresh cooldown",
                    value: expect.stringMatching(
                      /^Refresh cooldown active, next refresh available <t:\d+:R>$/,
                    ) as string,
                    inline: false,
                  } satisfies Partial<APIEmbedField>),
                ]) as APIEmbedField[],
              } satisfies Partial<APIEmbed>),
            ]) as APIEmbed[],
          }),
        );
      });

      it("continues with normal error handling for non-cooldown failures", async () => {
        const statusResponse = new Response(
          JSON.stringify({
            state: {
              queueNumber: 42,
              status: "active",
            },
          }),
          { status: 200 },
        );

        const errorResponse = new Response("Internal Server Error", { status: 500 });

        fetchSpy.mockResolvedValueOnce(statusResponse).mockResolvedValueOnce(errorResponse);

        const { jobToComplete } = trackCommand.execute(refreshButtonInteraction);
        await jobToComplete?.();

        expect(fetchSpy).toHaveBeenCalledWith("http://do/status", {
          method: "GET",
        });
        expect(fetchSpy).toHaveBeenCalledWith("http://do/refresh", {
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

      it("creates new message with same content, deletes original, and updates DO message ID", async () => {
        const newMessage = { ...apiMessage, id: "new-message-id-456" };
        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(newMessage);
        const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
        fetchSpy.mockResolvedValue(mockResponse);

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

        expect(fetchSpy).toHaveBeenCalledWith("http://do/repost", {
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
        expect(fetchSpy).not.toHaveBeenCalled();
      });

      it("handles DO update failure gracefully", async () => {
        const newMessage = { ...apiMessage, id: "new-message-id-456" };
        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(newMessage);
        const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue(undefined);

        const mockResponse = new Response("Bad Request", { status: 400 });
        fetchSpy.mockResolvedValue(mockResponse);

        const { jobToComplete } = trackCommand.execute(repostButtonInteraction);
        await jobToComplete?.();

        expect(createMessageSpy).toHaveBeenCalled();
        expect(deleteMessageSpy).toHaveBeenCalled();
        expect(fetchSpy).toHaveBeenCalled();
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
