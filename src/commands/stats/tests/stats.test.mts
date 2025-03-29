import type { MockInstance } from "vitest";
import { describe, beforeEach, vi, it, expect } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponse,
} from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChannelType,
  InteractionResponseType,
  InteractionType,
  Locale,
  MessageFlags,
} from "discord-api-types/v10";
import { StatsCommand } from "../stats.mjs";
import type { Services } from "../../../services/install.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import {
  apiMessage,
  channelThreadsResult,
  discordNeatQueueData,
  fakeBaseAPIApplicationCommandInteraction,
} from "../../../services/discord/fakes/data.mjs";
import { matchStats, playerXuidsToGametags } from "../../../services/halo/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

const applicationCommandInteractionStatsNeatQueue: APIApplicationCommandInteraction = {
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
    name: "stats",
    options: [
      {
        name: "neatqueue",
        options: [
          {
            name: "channel",
            type: ApplicationCommandOptionType.Channel,
            value: "fake-channel-id",
          },
          {
            name: "queue",
            type: ApplicationCommandOptionType.Integer,
            value: 1418,
          },
        ],
        type: 1,
      },
    ],
    resolved: {
      channels: {
        "fake-channel-id": {
          id: "fake-channel-id",
          name: "🥉results",
          permissions: "2230813650837056",
          type: ChannelType.GuildText,
        },
      },
    },
    type: ApplicationCommandType.ChatInput,
  },
};

const applicationCommandInteractionStatsMatch: APIApplicationCommandInteraction = {
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
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
    type: ApplicationCommandType.ChatInput,
  },
};

describe("StatsCommand", () => {
  let statsCommand: StatsCommand;
  let services: Services;
  let updateDeferredReplySpy: MockInstance;

  beforeEach(() => {
    services = installFakeServicesWith();
    statsCommand = new StatsCommand(services);

    updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue(apiMessage);
  });

  describe("execute(): subcommand neatqueue", () => {
    beforeEach(() => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "neatqueue",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([
          ["channel", "1234567890"],
          ["queue", 5],
        ]),
        options: [],
      });
    });

    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsNeatQueue);

      expect(response).toEqual<APIInteractionResponse>({
        data: {},
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    it("returns an error state for missing options 'channel'", () => {
      vi.spyOn(services.discordService, "extractSubcommand")
        .mockReset()
        .mockReturnValue({
          name: "neatqueue",
          mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([["queue", 5]]),
          options: [],
        });

      const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsNeatQueue);
      expect(response).toEqual({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Error: Missing channel",
          flags: MessageFlags.Ephemeral,
        },
      });
      expect(jobToComplete).toBeUndefined();
    });

    it("returns an error state for missing options 'queue'", () => {
      vi.spyOn(services.discordService, "extractSubcommand")
        .mockReset()
        .mockReturnValue({
          name: "neatqueue",
          mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([
            ["channel", "1234567890"],
          ]),
          options: [],
        });

      const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsNeatQueue);
      expect(response).toEqual({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Error: Missing queue",
          flags: MessageFlags.Ephemeral,
        },
      });
      expect(jobToComplete).toBeUndefined();
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;
      let getTeamsFromQueueSpy: MockInstance<typeof services.discordService.getTeamsFromQueue>;
      let getSeriesFromDiscordQueueSpy: MockInstance<typeof services.haloService.getSeriesFromDiscordQueue>;
      let getMessageFromInteractionTokenSpy: MockInstance<
        typeof services.discordService.getMessageFromInteractionToken
      >;
      let startThreadFromMessageSpy: MockInstance<typeof services.discordService.startThreadFromMessage>;
      let createMessageSpy: MockInstance<typeof services.discordService.createMessage>;
      let updateDiscordAssociationsSpy: MockInstance<typeof services.haloService.updateDiscordAssociations>;

      beforeEach(() => {
        getTeamsFromQueueSpy = vi
          .spyOn(services.discordService, "getTeamsFromQueue")
          .mockResolvedValue(discordNeatQueueData);
        getSeriesFromDiscordQueueSpy = vi
          .spyOn(services.haloService, "getSeriesFromDiscordQueue")
          .mockResolvedValue(Array.from(matchStats.values()).slice(0, 3));
        getMessageFromInteractionTokenSpy = vi
          .spyOn(services.discordService, "getMessageFromInteractionToken")
          .mockResolvedValue(apiMessage);
        startThreadFromMessageSpy = vi
          .spyOn(services.discordService, "startThreadFromMessage")
          .mockResolvedValue(channelThreadsResult);
        createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
        updateDiscordAssociationsSpy = vi.spyOn(services.haloService, "updateDiscordAssociations").mockResolvedValue();

        const { jobToComplete: jtc } = statsCommand.execute(applicationCommandInteractionStatsNeatQueue);
        jobToComplete = jtc;
      });

      it("fetches queue data from discordService", async () => {
        await jobToComplete?.();

        expect(getTeamsFromQueueSpy).toHaveBeenCalledWith("1234567890", 5);
      });

      it("calls discordService.updateDeferredReply with an error when no data is returned from getTeamsFromQueue", async () => {
        getTeamsFromQueueSpy.mockReset().mockResolvedValue(null);

        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
          content:
            "Failed to fetch (Channel: <#1234567890>, queue: 5): No queue found within the last 100 messages of <#1234567890>, with queue number 5",
        });
      });

      it('fetches series data from haloService using "getSeriesFromDiscordQueue" with expected data', async () => {
        await jobToComplete?.();

        expect(getSeriesFromDiscordQueueSpy).toHaveBeenCalledOnce();
        expect(getSeriesFromDiscordQueueSpy.mock.lastCall).toMatchInlineSnapshot(`
          [
            {
              "endDateTime": 2024-11-26T11:30:00.000Z,
              "startDateTime": 2024-11-26T05:30:00.000Z,
              "teams": [
                {
                  "name": "Eagle",
                  "players": [
                    {
                      "globalName": "DiscordUser01",
                      "id": "000000000000000001",
                      "username": "discord_user_01",
                    },
                    {
                      "globalName": "DiscordUser02",
                      "id": "000000000000000002",
                      "username": "discord_user_02",
                    },
                    {
                      "globalName": null,
                      "id": "000000000000000003",
                      "username": "discord_user_03",
                    },
                    {
                      "globalName": "gamertag0000000000004",
                      "id": "000000000000000004",
                      "username": "not_discord_user_04",
                    },
                  ],
                },
                {
                  "name": "Cobra",
                  "players": [
                    {
                      "globalName": "DiscordUser05",
                      "id": "000000000000000005",
                      "username": "discord_user_05",
                    },
                    {
                      "globalName": "DiscordUser06",
                      "id": "000000000000000006",
                      "username": "discord_user_06",
                    },
                    {
                      "globalName": "DiscordUser07",
                      "id": "000000000000000007",
                      "username": "discord_user_07",
                    },
                    {
                      "globalName": "DiscordUser08",
                      "id": "000000000000000008",
                      "username": "discord_user_08",
                    },
                  ],
                },
              ],
            },
          ]
        `);
      });

      it("calls discordService.updateDeferredReply with series embeds", async () => {
        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy.mock.lastCall).toMatchSnapshot();
      });

      it("calls discordService.getMessageFromInteractionToken", async () => {
        await jobToComplete?.();

        expect(getMessageFromInteractionTokenSpy).toHaveBeenCalledWith(
          applicationCommandInteractionStatsNeatQueue.token,
        );
      });

      it("calls discordService.startThreadFromMessage", async () => {
        await jobToComplete?.();

        expect(startThreadFromMessageSpy).toHaveBeenCalledWith(
          "1299532381308325949",
          "1314562775950954626",
          "Queue #5 series stats",
        );
      });

      it("adds each game and series summary to the thread", async () => {
        await jobToComplete?.();

        expect(createMessageSpy).toHaveBeenCalledTimes(4);
        expect(createMessageSpy.mock.calls).toMatchSnapshot();
      });

      it("calls haloService.updateDiscordAssociations", async () => {
        await jobToComplete?.();

        expect(updateDiscordAssociationsSpy).toHaveBeenCalledWith();
      });

      it("does nothing if error is thrown with message 'Too many subrequests.'", async () => {
        getSeriesFromDiscordQueueSpy.mockReset().mockRejectedValue(new Error("Too many subrequests."));

        await jobToComplete?.();

        expect(updateDeferredReplySpy).not.toHaveBeenCalled();
      });

      it("calls discordService.updateDeferredReply with an error when an error is thrown", async () => {
        getSeriesFromDiscordQueueSpy.mockReset().mockRejectedValue(new Error("An error occurred."));

        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
          content: "Failed to fetch (Channel: <#1234567890>, queue: 5): An error occurred.",
        });
      });
    });
  });

  describe("execute(): subcommand match", () => {
    beforeEach(() => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "match",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([
          ["id", "d81554d7-ddfe-44da-a6cb-000000000ctf"],
        ]),
        options: [],
      });
    });

    it("returns response and jobToComplete", () => {
      const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsMatch);

      expect(response).toEqual({
        data: {},
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    it("returns an error state for missing options 'id'", () => {
      vi.spyOn(services.discordService, "extractSubcommand")
        .mockReset()
        .mockReturnValue({
          name: "match",
          mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([["private", true]]),
          options: [],
        });

      const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsMatch);
      expect(response).toEqual({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Error: Missing match id",
          flags: MessageFlags.Ephemeral,
        },
      });
      expect(jobToComplete).toBeUndefined();
    });

    describe("jobToComplete", () => {
      const ctfMatch = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      let jobToComplete: (() => Promise<void>) | undefined;
      let getMatchDetailsSpy: MockInstance;
      let getPlayerXuidsToGamertagsSpy: MockInstance;

      beforeEach(() => {
        getMatchDetailsSpy = vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([ctfMatch]);
        getPlayerXuidsToGamertagsSpy = vi
          .spyOn(services.haloService, "getPlayerXuidsToGametags")
          .mockResolvedValue(playerXuidsToGametags);

        const { jobToComplete: jtc } = statsCommand.execute(applicationCommandInteractionStatsMatch);
        jobToComplete = jtc;
      });

      it("calls haloService.getMatchDetails", async () => {
        await jobToComplete?.();

        expect(getMatchDetailsSpy).toHaveBeenCalledWith(["d81554d7-ddfe-44da-a6cb-000000000ctf"]);
      });

      it("calls discordService.updateDeferredReply with an error when no data is returned from getMatchDetails", async () => {
        getMatchDetailsSpy.mockReset().mockResolvedValue([]);

        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
          content: "Match not found",
        });
      });

      it("calls haloService.getPlayerXuidsToGamertags with the match data", async () => {
        await jobToComplete?.();

        expect(getPlayerXuidsToGamertagsSpy).toHaveBeenCalledWith(ctfMatch);
      });

      it("calls discordService.updateDeferredReply with match embeds", async () => {
        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy.mock.lastCall).toMatchSnapshot();
      });

      it("does nothing if error is thrown with message 'Too many subrequests.'", async () => {
        getMatchDetailsSpy.mockReset().mockRejectedValue(new Error("Too many subrequests."));

        await jobToComplete?.();

        expect(updateDeferredReplySpy).not.toHaveBeenCalled();
      });

      it("calls discordService.updateDeferredReply with an error when an error is thrown", async () => {
        getMatchDetailsSpy.mockReset().mockRejectedValue(new Error("An error occurred."));

        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
          content: "Failed to fetch (match id: d81554d7-ddfe-44da-a6cb-000000000ctf}): An error occurred.",
        });
      });
    });
  });

  describe("execute(): not found", () => {
    const applicationCommandInteractionNotFound: APIApplicationCommandInteraction = {
      ...applicationCommandInteractionStatsMatch,
      data: {
        id: "1300004385459408960",
        name: "not-found",
        options: [],
        type: 1,
      },
    };

    beforeEach(() => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "not-found",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([]),
        options: [],
      });
    });

    it("returns an error response", () => {
      expect(statsCommand.execute(applicationCommandInteractionNotFound)).toEqual({
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: "Error: Missing subcommand options",
            flags: MessageFlags.Ephemeral,
          },
        },
      });
    });
  });
});
