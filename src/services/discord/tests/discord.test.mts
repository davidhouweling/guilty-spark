import type { Mock, MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { verifyKey } from "discord-interactions";
import type { APIApplicationCommandInteraction, APIInteraction, APIUser } from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionType,
  Locale,
} from "discord-api-types/v10";
import type { QueueData } from "../discord.mjs";
import { DiscordService } from "../discord.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import {
  apiMessage,
  channelMessages,
  pingInteraction,
  fakeButtonClickInteraction,
  modalSubmitInteraction,
  fakeBaseAPIApplicationCommandInteraction,
} from "../fakes/data.mjs";
import { JsonResponse } from "../json-response.mjs";
import type { BaseCommand } from "../../../commands/base/base.mjs";
import type { Services } from "../../install.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { AssociationReason } from "../../database/types/discord_associations.mjs";
import { aFakeDiscordAssociationsRow } from "../../database/fakes/database.fake.mjs";
import type { LogService } from "../../log/types.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";

const applicationCommandInteractionStatsMatch: APIApplicationCommandInteraction = {
  ...fakeBaseAPIApplicationCommandInteraction,
  type: InteractionType.ApplicationCommand,
  guild: {
    features: [],
    id: "1238795949266964560",
    locale: Locale.EnglishUS,
  },
  guild_id: "1238795949266964560",
  data: {
    id: "1300004385459408960",
    name: "stats",
    options: [
      {
        name: "match",
        options: [
          {
            name: "id",
            type: ApplicationCommandOptionType.String,
            value: "d81554d7-ddfe-44da-a6cb-000000000ctf",
          },
        ],
        type: 1,
      },
    ],
    type: 1,
  },
};

describe("DiscordService", () => {
  let env: Env;
  let logService: LogService;
  let mockFetch: Mock<typeof fetch>;
  let mockVerifyKey: Mock<typeof verifyKey>;
  let discordService: DiscordService;

  beforeEach(() => {
    env = aFakeEnvWith();
    logService = aFakeLogServiceWith();
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
      if (path === `${prefix}/channels/fake-channel/messages/fake-message-delete`) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      console.log("no path defined:", path);
      return Promise.reject(new Error("Invalid path"));
    });

    mockVerifyKey = vi.fn().mockResolvedValue(true);
    discordService = new DiscordService({
      env,
      logService,
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

        expect(await response.json()).toMatchInlineSnapshot(`
          {
            "type": 1,
          }
        `);
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
        expect(await response.json()).toMatchInlineSnapshot(`
          {
            "error": "No commands found",
          }
        `);
      });

      it("returns an error response if the command is not found", async () => {
        discordService.setCommands(new Map());
        const { response } = discordService.handleInteraction(applicationCommandInteractionStatsMatch);

        expect(response.status).toEqual(400);
        expect(await response.json()).toMatchInlineSnapshot(`
          {
            "error": "Command not found",
          }
        `);
      });

      it("executes the command and returns the response and jobToComplete", async () => {
        const jobToCompleteFn = vi.fn().mockResolvedValue(undefined);
        const executeFn = vi.fn().mockReturnValue({ response: new JsonResponse({}), jobToComplete: jobToCompleteFn });
        const command: BaseCommand = {
          services: {} as Services,
          env: aFakeEnvWith(),
          data: [
            {
              name: applicationCommandInteractionStatsMatch.data.name,
              type: 1,
              options: [],
              description: "some description",
              default_member_permissions: null,
            },
          ],
          execute: executeFn,
        };
        discordService.setCommands(new Map([[applicationCommandInteractionStatsMatch.data.name, command]]));

        const { response, jobToComplete } = discordService.handleInteraction(applicationCommandInteractionStatsMatch);

        expect(executeFn).toHaveBeenCalledWith(applicationCommandInteractionStatsMatch);
        expect(await response.json()).toMatchInlineSnapshot(`{}`);
        expect(jobToComplete).toEqual(jobToCompleteFn);
      });
    });

    describe("InteractionType.MessageComponent", () => {
      describe("ComponentType.Button", () => {
        it("executes the command and returns the response and jobToComplete", async () => {
          const jobToCompleteFn = vi.fn().mockResolvedValue(undefined);
          const executeFn = vi.fn().mockReturnValue({ response: new JsonResponse({}), jobToComplete: jobToCompleteFn });
          const command: BaseCommand = {
            services: {} as Services,
            env: aFakeEnvWith(),
            data: [
              {
                type: InteractionType.MessageComponent,
                data: {
                  component_type: ComponentType.Button,
                  custom_id: "btn_yes",
                },
              },
            ],
            execute: executeFn,
          };
          discordService.setCommands(new Map([["btn_yes", command]]));

          const { response, jobToComplete } = discordService.handleInteraction(fakeButtonClickInteraction);

          expect(executeFn).toHaveBeenCalledWith(fakeButtonClickInteraction);
          expect(await response.json()).toMatchInlineSnapshot(`{}`);
          expect(jobToComplete).toEqual(jobToCompleteFn);
        });

        it("returns an error response if no commands are loaded", async () => {
          const { response } = discordService.handleInteraction(fakeButtonClickInteraction);

          expect(response.status).toEqual(500);
          expect(await response.json()).toMatchInlineSnapshot(`
            {
              "error": "No commands found",
            }
          `);
        });

        it("returns an error response if the command is not found", async () => {
          discordService.setCommands(new Map());
          const { response } = discordService.handleInteraction(fakeButtonClickInteraction);

          expect(response.status).toEqual(400);
          expect(await response.json()).toMatchInlineSnapshot(`
            {
              "error": "Command not found",
            }
          `);
        });
      });
    });

    describe("InteractionType.ModalSubmit", () => {
      it("executes the command and returns the response and jobToComplete", async () => {
        const jobToCompleteFn = vi.fn().mockResolvedValue(undefined);
        const executeFn = vi.fn().mockReturnValue({ response: new JsonResponse({}), jobToComplete: jobToCompleteFn });
        const command: BaseCommand = {
          services: {} as Services,
          env: aFakeEnvWith(),
          data: [
            {
              type: InteractionType.ModalSubmit,
              data: {
                components: [],
                custom_id: "text_input",
              },
            },
          ],
          execute: executeFn,
        };
        discordService.setCommands(new Map([["text_input_modal", command]]));

        const { response, jobToComplete } = discordService.handleInteraction(modalSubmitInteraction);

        expect(executeFn).toHaveBeenCalledWith(modalSubmitInteraction);
        expect(await response.json()).toMatchInlineSnapshot(`{}`);
        expect(jobToComplete).toEqual(jobToCompleteFn);
      });

      it("returns an error response if no commands are loaded", async () => {
        const { response } = discordService.handleInteraction(modalSubmitInteraction);

        expect(response.status).toEqual(500);
        expect(await response.json()).toMatchInlineSnapshot(`
          {
            "error": "No commands found",
          }
        `);
      });

      it("returns an error response if the command is not found", async () => {
        discordService.setCommands(new Map());
        const { response } = discordService.handleInteraction(modalSubmitInteraction);

        expect(response.status).toEqual(400);
        expect(await response.json()).toMatchInlineSnapshot(`
          {
            "error": "Command not found",
          }
        `);
      });
    });

    describe("InteractionType.ApplicationCommandAutocomplete", () => {
      it("returns an error response", async () => {
        const { response } = discordService.handleInteraction({
          type: InteractionType.ApplicationCommandAutocomplete,
        } as APIInteraction);

        expect(response.status).toEqual(200);
        expect(await response.json()).toMatchInlineSnapshot(`
          {
            "data": {
              "content": "Autocomplete not implemented",
              "flags": 64,
            },
            "type": 4,
          }
        `);
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

  describe("extractModalSubmitData()", () => {
    it("returns a map of the modal submit data", () => {
      const data = discordService.extractModalSubmitData(modalSubmitInteraction);

      expect(data).toEqual(new Map([["text_input", "Hello!"]]));
    });
  });

  describe("getTeamsFromQueue()", () => {
    it("returns QueueData of the found queue", async () => {
      const result = await discordService.getTeamsFromQueue("fake-channel", 7);
      const queueMessage = Preconditions.checkExists(channelMessages[1]);

      expect(mockFetch).toHaveBeenCalledWith("https://discord.com/api/v10/channels/fake-channel/messages?limit=100", {
        body: null,
        headers: new Headers({
          Authorization: "Bot DISCORD_TOKEN",
          "content-type": "application/json;charset=UTF-8",
        }),
        method: "GET",
        queryParameters: {
          limit: 100,
        },
      });

      expect(result).toEqual<QueueData>({
        message: queueMessage,
        queue: 7,
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

  describe("updateDeferredReply()", () => {
    it("updates the deferred reply", async () => {
      const data = { content: "fake-content" };
      const response = await discordService.updateDeferredReply("fake-interaction-token", data);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://discord.com/api/v10/webhooks/DISCORD_APP_ID/fake-interaction-token/messages/@original",
        {
          body: JSON.stringify(data),
          headers: new Headers({
            Authorization: "Bot DISCORD_TOKEN",
            "content-type": "application/json;charset=UTF-8",
          }),
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
          headers: new Headers({
            Authorization: "Bot DISCORD_TOKEN",
            "content-type": "application/json;charset=UTF-8",
          }),
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
        headers: new Headers({
          Authorization: "Bot DISCORD_TOKEN",
          "content-type": "application/json;charset=UTF-8",
        }),
        method: "POST",
      });

      expect(response).toEqual(apiMessage);
    });

    it("throws an error if discord api returns an error", async () => {
      mockFetch.mockResolvedValue(new Response("Bad request", { status: 400, statusText: "Bad request" }));

      await expect(discordService.createMessage("fake-channel", { content: "fake-content" })).rejects.toThrow(
        new Error(`Failed to fetch data from Discord API (HTTP 400): Bad request`),
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
          headers: new Headers({
            Authorization: "Bot DISCORD_TOKEN",
            "content-type": "application/json;charset=UTF-8",
          }),
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

  describe("deleteMessage", () => {
    it("deletes a message", async () => {
      await expect(
        discordService.deleteMessage("fake-channel", "fake-message-delete", "Test reason"),
      ).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://discord.com/api/v10/channels/fake-channel/messages/fake-message-delete",
        {
          body: null,
          headers: new Headers({
            Authorization: "Bot DISCORD_TOKEN",
            "content-type": "application/json;charset=UTF-8",
            "X-Audit-Log-Reason": "Test reason",
          }),
          method: "DELETE",
        },
      );
    });

    it("throws an error if the message cannot be deleted", async () => {
      mockFetch.mockResolvedValue(new Response("Bad request", { status: 400, statusText: "Bad request" }));

      await expect(discordService.deleteMessage("fake-channel", "fake-message-delete", "Test reason")).rejects.toThrow(
        new Error(`Failed to fetch data from Discord API (HTTP 400): Bad request`),
      );
    });
  });

  describe("getDiscordUserId()", () => {
    it("returns id from interaction member user", () => {
      const id = discordService.getDiscordUserId(fakeButtonClickInteraction);

      expect(id).toEqual("discord_user_01");
    });

    it("returns id from interaction user if no member property on interaction", () => {
      const cloneInteraction = { ...fakeButtonClickInteraction };
      cloneInteraction.user = Preconditions.checkExists(cloneInteraction.member).user;
      delete cloneInteraction.member;

      const id = discordService.getDiscordUserId(cloneInteraction);

      expect(id).toEqual("discord_user_01");
    });

    it("throws an error if no member user and no user on interaction", () => {
      const cloneInteraction = { ...fakeButtonClickInteraction };
      delete cloneInteraction.member;
      delete cloneInteraction.user;

      expect(() => discordService.getDiscordUserId(cloneInteraction)).toThrow("No user found on interaction");
    });
  });

  describe("getEmojiFromName()", () => {
    it.each([
      ["KillingSpree", "<:KillingSpree:1322803050347499541>"],
      ["Killionaire", "<:Killionaire:1322814735539896423>"],
      ["Counter-snipe", "<:Countersnipe:1322885512209633320>"],
      ["Hold This", "<:HoldThis:1322884625739026463>"],
    ])("%s -> %s", (name, expected) => {
      expect(discordService.getEmojiFromName(name)).toEqual(expected);
    });
  });

  describe("getTimestamp()", () => {
    it("returns a discord formatted timestamp", () => {
      const timestamp = discordService.getTimestamp("2024-12-06T11:05:39.576Z");

      expect(timestamp).toEqual("<t:1733483139:f>");
    });
  });

  describe("getReadableAssociationReason()", () => {
    const association = aFakeDiscordAssociationsRow();

    it.each([
      {
        reason: AssociationReason.CONNECTED,
        reasonString: "AssociationReason.CONNECTED",
        expected: "Connected Halo account",
      },
      {
        reason: AssociationReason.MANUAL,
        reasonString: "AssociationReason.MANUAL",
        expected: "Manually claimed Halo account",
      },
      {
        reason: AssociationReason.USERNAME_SEARCH,
        reasonString: "AssociationReason.USERNAME_SEARCH",
        expected: "Matched Discord Username to Halo account",
      },
      {
        reason: AssociationReason.DISPLAY_NAME_SEARCH,
        reasonString: "AssociationReason.DISPLAY_NAME_SEARCH",
        expected: 'Matched Discord Display Name to Halo account "fake-display-name"',
      },
      {
        reason: AssociationReason.GAME_SIMILARITY,
        reasonString: "AssociationReason.GAME_SIMILARITY",
        expected: "Fuzzy matched Discord Username / Display name from a previous series",
      },
      {
        reason: AssociationReason.UNKNOWN,
        reasonString: "AssociationReason.UNKNOWN",
        expected: "Unknown",
      },
    ])("$reasonString -> $expected", ({ reason, expected }) => {
      expect(
        discordService.getReadableAssociationReason({
          ...association,
          AssociationReason: reason,
          DiscordDisplayNameSearched: "fake-display-name",
        }),
      ).toEqual(expected);
    });
  });

  describe("rate limiting", () => {
    const now = new Date("2025-01-01T00:00:00.000000+00:00").getTime();
    const appConfigKv = new Map<string, string>();
    let appConfigGetSpy: MockInstance;
    let appConfigPutSpy: MockInstance;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);

      appConfigGetSpy = vi.spyOn(env.APP_DATA, "get");
      appConfigGetSpy.mockImplementation(async (key: string) => Promise.resolve(appConfigKv.get(key)));

      appConfigPutSpy = vi.spyOn(env.APP_DATA, "put");
      appConfigPutSpy.mockImplementation(async (key: string, value: string) => {
        appConfigKv.set(key, value);
        return Promise.resolve();
      });
    });

    afterEach(() => {
      appConfigKv.clear();
      vi.useRealTimers();
    });

    it("fetches rate limit from app config", async () => {
      await discordService.createMessage("fake-channel", { content: "fake-content" });

      expect(appConfigGetSpy).toHaveBeenCalledWith("rateLimit./channels/fake-channel/messages", { type: "json" });
    });

    describe("path grouping", () => {
      it("groups /users/* calls under the same rate limit path", async () => {
        await discordService.getUsers(["fake-id-01", "fake-id-02"]);

        expect(appConfigGetSpy).toHaveBeenCalledTimes(2);
        expect(appConfigGetSpy).toHaveBeenNthCalledWith(1, "rateLimit./users/*", { type: "json" });
        expect(appConfigGetSpy).toHaveBeenNthCalledWith(2, "rateLimit./users/*", { type: "json" });
      });
    });

    it("puts rate limit in app config when headers are present", async () => {
      const reset = now + 100;
      const response = new Response(null, {
        status: 204,
        headers: {
          "x-ratelimit-reset-after": "1",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": reset.toString(),
        },
      });

      mockFetch.mockResolvedValue(response);

      await discordService.createMessage("fake-channel", { content: "fake-content" });
      vi.runAllTimers();

      expect(appConfigPutSpy).toHaveBeenCalledWith(
        "rateLimit./channels/fake-channel/messages",
        `{"remaining":0,"reset":${reset.toString()},"resetAfter":1}`,
        {
          expirationTtl: 60,
        },
      );
    });

    it("waits for the rate limit to reset", async () => {
      const delay = 100;
      appConfigKv.set(
        "rateLimit./channels/fake-channel/messages",
        `{"remaining":0,"reset":${(now + delay).toString()},"resetAfter":1}`,
      );

      const promise = discordService.createMessage("fake-channel", { content: "fake-content" });

      expect(mockFetch).not.toHaveBeenCalled();

      vi.advanceTimersByTime(delay - 10);
      expect(mockFetch).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10);
      await promise;
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("handles http status 429 response with rate limit headers and retries once", async () => {
      const reset = now + 100;
      const response = new Response(null, {
        status: 429,
        headers: {
          "x-ratelimit-reset-after": "1",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": reset.toString(),
        },
      });

      mockFetch
        .mockClear()
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(new Response(null, { status: 204 }));

      await Promise.all([
        discordService.createMessage("fake-channel", { content: "fake-content" }),
        vi.advanceTimersByTimeAsync(100),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws an error if http 429 is returned twice", async () => {
      const reset = now + 100;
      const response = new Response("Too many requests", {
        status: 429,
        statusText: "Too many requests",
        headers: {
          "x-ratelimit-reset-after": "1",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": reset.toString(),
        },
      });

      mockFetch.mockClear().mockResolvedValueOnce(response).mockResolvedValueOnce(response);

      await expect(async () =>
        Promise.all([
          discordService.createMessage("fake-channel", { content: "fake-content" }),
          vi.advanceTimersByTimeAsync(100),
        ]),
      ).rejects.toThrowError(new Error("Failed to fetch data from Discord API (HTTP 429): Too many requests"));

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("handles rate limit headers correctly", async () => {
      const reset = now + 200;
      const response = new Response(null, {
        status: 204,
        headers: {
          "x-ratelimit-reset-after": "2",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": reset.toString(),
        },
      });

      mockFetch.mockResolvedValue(response);

      await discordService.createMessage("fake-channel", { content: "test-content" });
      vi.runAllTimers();

      expect(appConfigPutSpy).toHaveBeenCalledWith(
        "rateLimit./channels/fake-channel/messages",
        `{"remaining":0,"reset":${reset.toString()},"resetAfter":2}`,
        {
          expirationTtl: 60,
        },
      );
    });

    it("debounces rate limit writes to app config", async () => {
      const reset = now + 300;
      const response = new Response(null, {
        status: 204,
        headers: {
          "x-ratelimit-reset-after": "3",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": reset.toString(),
        },
      });

      mockFetch.mockResolvedValue(response);

      const promise1 = discordService.createMessage("fake-channel", { content: "test-content" });
      const promise2 = discordService.createMessage("fake-channel", { content: "test-content-2" });

      await Promise.all([promise1, promise2]);

      vi.advanceTimersByTime(1000); // Advance timers to trigger debounce

      expect(appConfigPutSpy).toHaveBeenCalledTimes(1);
      expect(appConfigPutSpy).toHaveBeenCalledWith(
        "rateLimit./channels/fake-channel/messages",
        `{"remaining":0,"reset":${reset.toString()},"resetAfter":3}`,
        {
          expirationTtl: 60,
        },
      );
    });
  });

  describe("editMessage()", () => {
    it("edits a message", async () => {
      const data = { content: "edited content" };
      const mockResponse = { id: "message-id", content: "edited content" };
      mockFetch.mockResolvedValue(new Response(JSON.stringify(mockResponse)));

      const result = await discordService.editMessage("channel-id", "message-id", data);

      expect(mockFetch).toHaveBeenCalledWith("https://discord.com/api/v10/channels/channel-id/messages/message-id", {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: new Headers({
          Authorization: "Bot DISCORD_TOKEN",
          "content-type": "application/json;charset=UTF-8",
        }),
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe("getDateFromTimestamp()", () => {
    it("converts a Discord timestamp to a Date", () => {
      const timestamp = "<t:1733483139:f>";
      const result = discordService.getDateFromTimestamp(timestamp);

      expect(result).toEqual(new Date(1733483139 * 1000));
    });

    it("handles different timestamp formats", () => {
      const formats = ["f", "F", "d", "D", "t", "T", "R"];

      formats.forEach((format) => {
        const timestamp = `<t:1733483139:${format}>`;
        const result = discordService.getDateFromTimestamp(timestamp);
        expect(result).toEqual(new Date(1733483139 * 1000));
      });
    });

    it("throws an error for invalid timestamp format", () => {
      expect(() => discordService.getDateFromTimestamp("invalid")).toThrow("Invalid timestamp format: invalid");
    });

    it("throws an error for malformed Discord timestamp", () => {
      expect(() => discordService.getDateFromTimestamp("<t:abc:f>")).toThrow("Invalid timestamp format: <t:abc:f>");
    });
  });

  describe("getRankEmoji", () => {
    beforeEach(() => {
      vi.spyOn(discordService, "getEmojiFromName").mockImplementation((name: string) => `<:${name}:id>`);
    });

    it("returns Onyx emoji for Onyx tier", () => {
      expect(discordService.getRankEmoji("Onyx", 1)).toBe("<:Onyx:id>");
    });

    it("returns Unranked emoji for empty tier", () => {
      expect(discordService.getRankEmoji("", 2)).toBe("<:Unranked2:id>");
    });

    it("returns correct emoji for other tiers", () => {
      expect(discordService.getRankEmoji("Diamond", 5)).toBe("<:Diamond6:id>");
      expect(discordService.getRankEmoji("Gold", 1)).toBe("<:Gold2:id>");
    });
  });
});
