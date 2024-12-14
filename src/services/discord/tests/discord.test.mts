import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { verifyKey } from "discord-interactions";
import type { APIInteraction, APIUser } from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from "discord-api-types/v10";
import type { QueueData } from "../discord.mjs";
import { DiscordService } from "../discord.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import {
  apiMessage,
  applicationCommandInteractionStatsMatch,
  channelMessages,
  pingInteraction,
} from "../fakes/data.mjs";
import { JsonResponse } from "../json-response.mjs";
import type { BaseCommand } from "../../../commands/base/base.mjs";
import type { Services } from "../../install.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

describe("DiscordService", () => {
  let mockFetch: Mock<typeof fetch>;
  let mockVerifyKey: Mock<typeof verifyKey>;
  let discordService: DiscordService;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>().mockImplementation(async (path) => {
      const prefix = "https://discord.com/api/v10";
      if (path === `${prefix}/channels/fake-channel/messages?limit=100`) {
        return Promise.resolve(new Response(JSON.stringify(channelMessages)));
      }
      if (typeof path === "string" && path.startsWith(`${prefix}/users/`)) {
        const id = path.slice(-2);
        const apiUser: APIUser = {
          id: `fake-id-${id}`,
          username: `fake-username-${id}`,
          global_name: `fake-global-name-${id}`,
          discriminator: "1234",
          avatar: "fake-avatar",
        };

        return Promise.resolve(new Response(JSON.stringify(apiUser)));
      }
      if (path === `${prefix}/webhooks/DISCORD_APP_ID/fake-interaction-token/messages/@original`) {
        return Promise.resolve(new Response(JSON.stringify(apiMessage)));
      }
      if (path === `${prefix}/channels/fake-channel/messages`) {
        return Promise.resolve(new Response(JSON.stringify(apiMessage)));
      }
      if (path === `${prefix}/channels/fake-channel/messages/fake-message/threads`) {
        return Promise.resolve(new Response(JSON.stringify(apiMessage)));
      }

      console.log("no path defined:", path);
      return Promise.reject(new Error("Invalid path"));
    });

    mockVerifyKey = vi.fn().mockResolvedValue(true);
    discordService = new DiscordService({
      env: aFakeEnvWith(),
      fetch: mockFetch,
      verifyKey: mockVerifyKey,
    });
  });

  describe("verifyDiscordRequest()", () => {
    const requestBody = JSON.stringify(pingInteraction);
    let request: Request;

    beforeEach(() => {
      request = new Request("https://example.com", {
        method: "POST",
        body: requestBody,
        headers: new Headers({
          "X-Signature-Ed25519": "fake-signature",
          "x-signature-timestamp": "fake-timestamp",
        }),
      });
    });

    it("verify the request", async () => {
      const result = await discordService.verifyDiscordRequest(request);

      expect(mockVerifyKey).toHaveBeenCalledWith(requestBody, "fake-signature", "fake-timestamp", "DISCORD_PUBLIC_KEY");
      expect(result).toEqual({ interaction: pingInteraction, isValid: true });
    });

    it("returns 'isValid: false' if no signature is provided in request header", async () => {
      request.headers.delete("X-Signature-Ed25519");

      const result = await discordService.verifyDiscordRequest(request);

      expect(result).toEqual({ isValid: false });
    });

    it("returns 'isValid: false' if no timestamp is provided in request header", async () => {
      request.headers.delete("x-signature-timestamp");

      const result = await discordService.verifyDiscordRequest(request);

      expect(result).toEqual({ isValid: false });
    });

    it("returns 'isValid: false' if the request is invalid", async () => {
      mockVerifyKey.mockResolvedValue(false);

      const result = await discordService.verifyDiscordRequest(request);

      expect(result).toEqual({ isValid: false });
    });

    it("returns 'isValid: false' if the request is invalid JSON", async () => {
      request = new Request("https://example.com", {
        method: "POST",
        body: "invalid-json",
        headers: new Headers({
          "X-Signature-Ed25519": "fake-signature",
          "x-signature-timestamp": "fake-timestamp",
        }),
      });

      const result = await discordService.verifyDiscordRequest(request);

      expect(result).toEqual({ isValid: false, error: "Invalid JSON" });
    });
  });

  describe("handleInteraction()", () => {
    describe("InteractionType.Ping", () => {
      it("returns a Pong response", async () => {
        const { response } = discordService.handleInteraction(pingInteraction);

        expect(await response.text()).toEqual(JSON.stringify({ type: InteractionResponseType.Pong }));
      });

      it("does not have a job to complete", () => {
        const { jobToComplete } = discordService.handleInteraction(pingInteraction);

        expect(jobToComplete).toBeUndefined();
      });
    });

    describe("InteractionType.ApplicationCommand", () => {
      it("returns an error response if no commands are loaded", async () => {
        const { response } = discordService.handleInteraction(applicationCommandInteractionStatsMatch);

        expect(response.status).toEqual(500);
        expect(await response.text()).toEqual(JSON.stringify({ error: "No commands found" }));
      });

      it("returns an error response if the command is not found", async () => {
        discordService.setCommands(new Map());
        const { response } = discordService.handleInteraction(applicationCommandInteractionStatsMatch);

        expect(response.status).toEqual(400);
        expect(await response.text()).toEqual(JSON.stringify({ error: "Command not found" }));
      });

      it("executes the command and returns the response and jobToComplete", async () => {
        const jobToCompleteFn = vi.fn().mockResolvedValue(undefined);
        const executeFn = vi.fn().mockReturnValue({ response: new JsonResponse({}), jobToComplete: jobToCompleteFn });
        const command: BaseCommand = {
          services: {} as Services,
          data: {
            name: applicationCommandInteractionStatsMatch.data.name,
            type: 1,
            options: [],
            description: "some description",
          },
          execute: executeFn,
        };
        discordService.setCommands(new Map([[applicationCommandInteractionStatsMatch.data.name, command]]));

        const { response, jobToComplete } = discordService.handleInteraction(applicationCommandInteractionStatsMatch);

        expect(executeFn).toHaveBeenCalledWith(applicationCommandInteractionStatsMatch);
        expect(await response.text()).toEqual(JSON.stringify({}));
        expect(jobToComplete).toEqual(jobToCompleteFn);
      });
    });

    describe.each([
      ["InteractionType.MessageComponent", InteractionType.MessageComponent],
      ["InteractionType.ApplicationCommandAutocomplete", InteractionType.ApplicationCommandAutocomplete],
      ["InteractionType.ModalSubmit", InteractionType.ModalSubmit],
    ])("%s", (_, interactionType) => {
      it("returns an error response", async () => {
        const { response } = discordService.handleInteraction({
          type: interactionType,
        } as APIInteraction);

        expect(response.status).toEqual(400);
        expect(await response.text()).toEqual(JSON.stringify({ error: "Unknown interaction type" }));
      });
    });
  });

  describe("extractSubcommand()", () => {
    it("returns subcommand data", () => {
      const subcommand = discordService.extractSubcommand(
        applicationCommandInteractionStatsMatch,
        applicationCommandInteractionStatsMatch.data.name,
      );

      expect(subcommand).toEqual({
        name: "match",
        options: [
          { name: "id", type: ApplicationCommandOptionType.String, value: "d81554d7-ddfe-44da-a6cb-000000000ctf" },
        ],
        mappedOptions: new Map([["id", "d81554d7-ddfe-44da-a6cb-000000000ctf"]]),
      });
    });

    it("throws an error if the interaction type is not ChatInput", () => {
      expect(() =>
        discordService.extractSubcommand(
          {
            ...applicationCommandInteractionStatsMatch,
            type: InteractionType.ApplicationCommand,
            data: {
              type: ApplicationCommandType.Message,
              name: "match",
              id: "fake-id",
              resolved: {
                messages: {},
              },
              target_id: "fake-target-id",
            },
          },
          applicationCommandInteractionStatsMatch.data.name,
        ),
      ).toThrow("Unexpected interaction type");
    });

    it("throws an error if the interaction name does not match", () => {
      expect(() => discordService.extractSubcommand(applicationCommandInteractionStatsMatch, "fake-name")).toThrow(
        "Unexpected interaction name",
      );
    });

    it("throws an error if no subcommand is found", () => {
      expect(() =>
        discordService.extractSubcommand(
          {
            ...applicationCommandInteractionStatsMatch,
            data: {
              type: ApplicationCommandType.ChatInput,
              name: applicationCommandInteractionStatsMatch.data.name,
              id: "fake-id",
              resolved: {},
            },
          },
          applicationCommandInteractionStatsMatch.data.name,
        ),
      ).toThrow("No subcommand found");
    });
  });

  describe("getTeamsFromQueue()", () => {
    it("returns QueueData of the found queue", async () => {
      const result = await discordService.getTeamsFromQueue("fake-channel", 7);
      const queueMessage = Preconditions.checkExists(channelMessages[1]);

      expect(mockFetch).toHaveBeenCalledWith("https://discord.com/api/v10/channels/fake-channel/messages?limit=100", {
        body: null,
        headers: {
          Authorization: "Bot DISCORD_TOKEN",
          "content-type": "application/json;charset=UTF-8",
        },
        method: "GET",
        queryParameters: {
          limit: 100,
        },
      });

      expect(result).toEqual<QueueData>({
        message: queueMessage,
        timestamp: new Date("2024-12-06T11:05:39.576Z"),
        teams: [
          {
            name: "Eagle",
            players: [
              {
                avatar: "fake-avatar",
                discriminator: "1234",
                global_name: "fake-global-name-09",
                id: "fake-id-09",
                username: "fake-username-09",
              },
              {
                avatar: "fake-avatar",
                discriminator: "1234",
                global_name: "fake-global-name-08",
                id: "fake-id-08",
                username: "fake-username-08",
              },
              {
                avatar: "fake-avatar",
                discriminator: "1234",
                global_name: "fake-global-name-07",
                id: "fake-id-07",
                username: "fake-username-07",
              },
              {
                avatar: "fake-avatar",
                discriminator: "1234",
                global_name: "fake-global-name-06",
                id: "fake-id-06",
                username: "fake-username-06",
              },
            ],
          },
          {
            name: "__Cobra__",
            players: [
              {
                avatar: "fake-avatar",
                discriminator: "1234",
                global_name: "fake-global-name-10",
                id: "fake-id-10",
                username: "fake-username-10",
              },
              {
                avatar: "fake-avatar",
                discriminator: "1234",
                global_name: "fake-global-name-11",
                id: "fake-id-11",
                username: "fake-username-11",
              },
              {
                avatar: "fake-avatar",
                discriminator: "1234",
                global_name: "fake-global-name-12",
                id: "fake-id-12",
                username: "fake-username-12",
              },
              {
                avatar: "fake-avatar",
                discriminator: "1234",
                global_name: "fake-global-name-13",
                id: "fake-id-13",
                username: "fake-username-13",
              },
            ],
          },
        ],
      });
    });

    it("returns null if no queue is found", async () => {
      const result = await discordService.getTeamsFromQueue("fake-channel", 1000);

      expect(result).toBeNull();
    });
  });

  describe("getAcknowledgeResponse()", () => {
    it("returns an ephemeral response", () => {
      const response = discordService.getAcknowledgeResponse(true);

      expect(response).toEqual({
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: {
          flags: MessageFlags.Ephemeral,
        },
      });
    });

    it("returns a public response", () => {
      const response = discordService.getAcknowledgeResponse();

      expect(response).toEqual({
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: {},
      });
    });
  });

  describe("updateDeferredReply()", () => {
    it("updates the deferred reply", async () => {
      const data = { content: "fake-content" };
      const response = await discordService.updateDeferredReply("fake-interaction-token", data);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://discord.com/api/v10/webhooks/DISCORD_APP_ID/fake-interaction-token/messages/@original",
        {
          body: JSON.stringify(data),
          headers: {
            Authorization: "Bot DISCORD_TOKEN",
            "content-type": "application/json;charset=UTF-8",
          },
          method: "PATCH",
        },
      );

      expect(response).toEqual(apiMessage);
    });
  });

  describe("getMessageFromInteractionToken()", () => {
    it("fetches the message", async () => {
      const response = await discordService.getMessageFromInteractionToken("fake-interaction-token");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://discord.com/api/v10/webhooks/DISCORD_APP_ID/fake-interaction-token/messages/@original",
        {
          body: null,
          headers: {
            Authorization: "Bot DISCORD_TOKEN",
            "content-type": "application/json;charset=UTF-8",
          },
          method: "GET",
        },
      );

      expect(response).toEqual(apiMessage);
    });
  });

  describe("createMessage()", () => {
    it("creates a message", async () => {
      const data = { content: "fake-content" };
      const response = await discordService.createMessage("fake-channel", data);

      expect(mockFetch).toHaveBeenCalledWith("https://discord.com/api/v10/channels/fake-channel/messages", {
        body: JSON.stringify(data),
        headers: {
          Authorization: "Bot DISCORD_TOKEN",
          "content-type": "application/json;charset=UTF-8",
        },
        method: "POST",
      });

      expect(response).toEqual(apiMessage);
    });

    it("throws an error if discord api returns an error", async () => {
      mockFetch.mockResolvedValue(new Response("some error", { status: 400, statusText: "Bad request" }));

      await expect(discordService.createMessage("fake-channel", { content: "fake-content" })).rejects.toThrow(
        new Error(`Failed to fetch data from Discord API: 400 Bad request`),
      );
    });

    it("returns empty data when the response status is 204", async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

      const response = await discordService.createMessage("fake-channel", { content: "fake-content" });

      expect(response).toEqual({});
    });
  });

  describe("startThreadFromMessage()", () => {
    it("starts a thread", async () => {
      const data = {
        name: "fake-name",
        auto_archive_duration: 60,
      };
      const response = await discordService.startThreadFromMessage("fake-channel", "fake-message", "fake-name");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://discord.com/api/v10/channels/fake-channel/messages/fake-message/threads",
        {
          body: JSON.stringify(data),
          headers: {
            Authorization: "Bot DISCORD_TOKEN",
            "content-type": "application/json;charset=UTF-8",
          },
          method: "POST",
        },
      );

      expect(response).toEqual(apiMessage);
    });

    it("throws an error if the thread name is too long", async () => {
      return expect(async () =>
        discordService.startThreadFromMessage("fake-channel", "fake-message", "a".repeat(101)),
      ).rejects.toThrowError(new Error("Thread name must be 100 characters or fewer"));
    });
  });
});
