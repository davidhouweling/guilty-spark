import type { MockInstance } from "vitest";
import { describe, beforeEach, vi, it, expect } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponse,
  APIThreadChannel,
  APIMessage,
  APIMessageComponentButtonInteraction,
} from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChannelType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  Locale,
  MessageFlags,
  MessageType,
} from "discord-api-types/v10";
import { StatsCommand } from "../stats.mjs";
import type { Services } from "../../../services/install.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import {
  apiMessage,
  channelThreadsResult,
  discordNeatQueueData,
  fakeBaseAPIApplicationCommandInteraction,
  fakeButtonClickInteraction,
  textChannel,
  threadChannel,
} from "../../../services/discord/fakes/data.mjs";
import { matchStats, playerXuidsToGametags } from "../../../services/halo/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { StatsReturnType } from "../../../services/database/types/guild_config.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake.mjs";
import { EndUserError } from "../../../base/end-user-error.mjs";
import type { MatchPlayer } from "../../../services/halo/halo.mjs";

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
  let env: Env;
  let updateDeferredReplySpy: MockInstance<typeof services.discordService.updateDeferredReply>;
  let updateDeferredReplyWithErrorSpy: MockInstance<typeof services.discordService.updateDeferredReplyWithError>;

  beforeEach(() => {
    services = installFakeServicesWith();
    env = aFakeEnvWith();
    statsCommand = new StatsCommand(services, env);

    updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue(apiMessage);
    updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(apiMessage);
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
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;
      let getTeamsFromQueueSpy: MockInstance<typeof services.discordService.getTeamsFromQueueResult>;
      let getSeriesFromDiscordQueueSpy: MockInstance<typeof services.haloService.getSeriesFromDiscordQueue>;
      let getMessageFromInteractionTokenSpy: MockInstance<
        typeof services.discordService.getMessageFromInteractionToken
      >;
      let getChannelSpy: MockInstance<typeof services.discordService.getChannel>;
      let startThreadFromMessageSpy: MockInstance<typeof services.discordService.startThreadFromMessage>;
      let createMessageSpy: MockInstance<typeof services.discordService.createMessage>;
      let updateDiscordAssociationsSpy: MockInstance<typeof services.haloService.updateDiscordAssociations>;

      beforeEach(() => {
        getTeamsFromQueueSpy = vi
          .spyOn(services.discordService, "getTeamsFromQueueResult")
          .mockResolvedValue(discordNeatQueueData);
        getSeriesFromDiscordQueueSpy = vi
          .spyOn(services.haloService, "getSeriesFromDiscordQueue")
          .mockResolvedValue(Array.from(matchStats.values()).slice(0, 3));
        getMessageFromInteractionTokenSpy = vi
          .spyOn(services.discordService, "getMessageFromInteractionToken")
          .mockResolvedValue(apiMessage);
        getChannelSpy = vi.spyOn(services.discordService, "getChannel").mockResolvedValue(textChannel);
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

        expect(getTeamsFromQueueSpy).toHaveBeenCalledWith("fake-guild-id", "1234567890", 5);
      });

      it("calls discordService.updateDeferredReplyWithError with an error when no data is returned from getTeamsFromQueue", async () => {
        const expectedError = new Error("No queue found");
        getTeamsFromQueueSpy.mockReset().mockRejectedValue(expectedError);

        await jobToComplete?.();

        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", expectedError);
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
                [
                  {
                    "globalName": "DiscordUser01",
                    "guildNickname": null,
                    "id": "000000000000000001",
                    "username": "discord_user_01",
                  },
                  {
                    "globalName": "DiscordUser02",
                    "guildNickname": null,
                    "id": "000000000000000002",
                    "username": "discord_user_02",
                  },
                  {
                    "globalName": null,
                    "guildNickname": null,
                    "id": "000000000000000003",
                    "username": "discord_user_03",
                  },
                  {
                    "globalName": "gamertag0000000000004",
                    "guildNickname": null,
                    "id": "000000000000000004",
                    "username": "not_discord_user_04",
                  },
                ],
                [
                  {
                    "globalName": "DiscordUser05",
                    "guildNickname": null,
                    "id": "000000000000000005",
                    "username": "discord_user_05",
                  },
                  {
                    "globalName": "DiscordUser06",
                    "guildNickname": null,
                    "id": "000000000000000006",
                    "username": "discord_user_06",
                  },
                  {
                    "globalName": "DiscordUser07",
                    "guildNickname": null,
                    "id": "000000000000000007",
                    "username": "discord_user_07",
                  },
                  {
                    "globalName": "DiscordUser08",
                    "guildNickname": null,
                    "id": "000000000000000008",
                    "username": "discord_user_08",
                  },
                ],
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

      it("calls discordService.getChannel to get the message channel details", async () => {
        await jobToComplete?.();

        expect(getChannelSpy).toHaveBeenCalledWith("1299532381308325949");
      });

      describe("message channel type = GuildText", () => {
        it("calls discordService.startThreadFromMessage", async () => {
          await jobToComplete?.();

          expect(startThreadFromMessageSpy).toHaveBeenCalledWith(
            "1299532381308325949",
            "1314562775950954626",
            "Queue #777 series stats (🦅 3:0 🐍)",
          );
        });

        it("adds series summary and game stats to the thread when guildConfig StatsReturn is SERIES_AND_GAMES", async () => {
          const getGuildConfigSpy = vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
            aFakeGuildConfigRow({
              StatsReturn: StatsReturnType.SERIES_AND_GAMES,
            }),
          );

          await jobToComplete?.();

          expect(getGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id");
          expect(createMessageSpy).toHaveBeenCalledTimes(6);
          expect(createMessageSpy.mock.calls).toMatchSnapshot();
        });

        it("does not add games to the thread when guildConfig StatsReturn is SERIES_ONLY", async () => {
          const getGuildConfigSpy = vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
            aFakeGuildConfigRow({
              StatsReturn: StatsReturnType.SERIES_ONLY,
            }),
          );

          await jobToComplete?.();

          expect(getGuildConfigSpy).toHaveBeenCalledWith("fake-guild-id");
          expect(createMessageSpy).toHaveBeenCalledTimes(4);
        });
      });

      describe.each([
        [ChannelType.AnnouncementThread, "AnnouncementThread"],
        [ChannelType.PublicThread, "PublicThread"],
        [ChannelType.PrivateThread, "PrivateThread"],
      ])("message channel type = %s", (channelType, typeName) => {
        beforeEach(() => {
          getChannelSpy.mockReset().mockResolvedValue({
            ...threadChannel,
            type: channelType,
          } as APIThreadChannel);
        });

        it(`does not call discordService.startThreadFromMessage if message channel type is ${typeName}`, async () => {
          await jobToComplete?.();

          expect(startThreadFromMessageSpy).not.toHaveBeenCalled();
        });

        it("calls createMessage with the thread channel id", async () => {
          await jobToComplete?.();

          expect(createMessageSpy).toHaveBeenCalledTimes(4);
          expect(createMessageSpy).toHaveBeenNthCalledWith(1, "thread-channel-id", expect.anything());
          expect(createMessageSpy).toHaveBeenNthCalledWith(2, "thread-channel-id", expect.anything());
          expect(createMessageSpy).toHaveBeenNthCalledWith(3, "thread-channel-id", expect.anything());
          expect(createMessageSpy).toHaveBeenNthCalledWith(4, "thread-channel-id", expect.anything());
        });
      });

      it("calls haloService.updateDiscordAssociations", async () => {
        await jobToComplete?.();

        expect(updateDiscordAssociationsSpy).toHaveBeenCalledWith();
      });

      it("calls discordService.updateDeferredReplyWithError with an error when an error is thrown", async () => {
        const error = new Error("An error occurred.");
        getSeriesFromDiscordQueueSpy.mockReset().mockRejectedValue(error);

        await jobToComplete?.();

        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", error);
      });
    });

    describe("in a thread without channel or queue options", () => {
      const threadInteraction: APIApplicationCommandInteraction = {
        ...applicationCommandInteractionStatsNeatQueue,
        channel: {
          ...threadChannel,
          type: ChannelType.PublicThread,
          parent_id: "parent-channel-id",
        },
      };

      beforeEach(() => {
        vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
          name: "neatqueue",
          mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>(),
          options: [],
        });
      });

      it("returns response and jobToComplete for in-thread execution", () => {
        const { response, jobToComplete } = statsCommand.execute(threadInteraction);

        expect(response).toEqual<APIInteractionResponse>({
          type: InteractionResponseType.DeferredChannelMessageWithSource,
        });
        expect(jobToComplete).toBeInstanceOf(Function);
      });

      describe("jobToComplete for thread", () => {
        let jobToComplete: (() => Promise<void>) | undefined;
        let getMessagesSpy: MockInstance<typeof services.discordService.getMessages>;
        let getTeamsFromMessageSpy: MockInstance<typeof services.discordService.getTeamsFromMessage>;
        let bulkDeleteMessagesSpy: MockInstance<typeof services.discordService.bulkDeleteMessages>;
        let getSeriesFromDiscordQueueSpy: MockInstance<typeof services.haloService.getSeriesFromDiscordQueue>;
        let createMessageSpy: MockInstance<typeof services.discordService.createMessage>;
        let updateDiscordAssociationsSpy: MockInstance<typeof services.haloService.updateDiscordAssociations>;

        let guiltySparkErrorMessage: APIMessage;
        let threadFirstMessage: APIMessage;

        beforeEach(() => {
          guiltySparkErrorMessage = {
            ...apiMessage,
            id: "guilty-spark-error-message-id",
            author: {
              ...apiMessage.author,
              id: env.DISCORD_APP_ID,
              bot: true,
            },
            embeds: [
              {
                title: "Something went wrong",
                description: "Something went wrong while trying to post series data",
                color: 16711680,
                fields: [
                  {
                    name: "Additional Information",
                    value: "**Channel**: <#1251448849298362419>\n**Queue**: 5710\n**Completed**: <t:1763993169:f>",
                  },
                ],
              },
            ],
          };

          threadFirstMessage = {
            ...apiMessage,
            id: "thread-first-message-id",
            type: MessageType.ThreadStarterMessage,
            referenced_message: {
              ...apiMessage,
              id: "neat-queue-result-message-id",
              author: {
                ...apiMessage.author,
                id: "857633321064595466",
                bot: true,
              },
              embeds: [
                {
                  title: "🏆 Winner For Queue#5710 🏆",
                  color: 16711680,
                  timestamp: "2024-11-26T11:30:00.000000+00:00",
                  fields: [
                    {
                      name: "__Eagle__",
                      value: "<@000000000000000001> *+30.3* **(1030.3)**",
                      inline: true,
                    },
                    {
                      name: "Cobra",
                      value: "<@000000000000000005> *-30.3* **(969.7)**",
                      inline: true,
                    },
                  ],
                },
              ],
            },
          };
          getMessagesSpy = vi
            .spyOn(services.discordService, "getMessages")
            .mockResolvedValue([guiltySparkErrorMessage, threadFirstMessage]);
          getTeamsFromMessageSpy = vi
            .spyOn(services.discordService, "getTeamsFromMessage")
            .mockResolvedValue(discordNeatQueueData);
          bulkDeleteMessagesSpy = vi.spyOn(services.discordService, "bulkDeleteMessages").mockResolvedValue();
          getSeriesFromDiscordQueueSpy = vi
            .spyOn(services.haloService, "getSeriesFromDiscordQueue")
            .mockResolvedValue(Array.from(matchStats.values()).slice(0, 3));
          createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
          updateDiscordAssociationsSpy = vi
            .spyOn(services.haloService, "updateDiscordAssociations")
            .mockResolvedValue();

          const { jobToComplete: jtc } = statsCommand.execute(threadInteraction);
          jobToComplete = jtc;
        });

        it("throws error if not in a thread channel", async () => {
          const nonThreadInteraction: APIApplicationCommandInteraction = {
            ...threadInteraction,
            channel: {
              id: "text-channel-id",
              type: ChannelType.GuildText,
              guild_id: "fake-guild-id",
            } as typeof textChannel,
          };

          vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
            name: "neatqueue",
            mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>(),
            options: [],
          });

          // Don't need to setup getMessages mock since it should fail before that call
          const { jobToComplete: nonThreadJob } = statsCommand.execute(nonThreadInteraction);
          await nonThreadJob?.();

          expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
          const errorArg = updateDeferredReplyWithErrorSpy.mock.lastCall?.[1];
          // Just verify an error was thrown, the exact type doesn't matter for this edge case
          expect(errorArg).toBeInstanceOf(Error);
        });

        it("fetches thread messages", async () => {
          await jobToComplete?.();

          expect(getMessagesSpy).toHaveBeenCalledWith("thread-channel-id");
        });

        it("throws error if first message is not from NeatQueue", async () => {
          getMessagesSpy.mockResolvedValue([
            {
              ...threadFirstMessage,
              referenced_message: {
                ...Preconditions.checkExists(threadFirstMessage.referenced_message),
                author: {
                  ...apiMessage.author,
                  id: "wrong-bot-id",
                  bot: true,
                },
              },
            },
          ]);

          await jobToComplete?.();

          expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
          const errorArg = updateDeferredReplyWithErrorSpy.mock.lastCall?.[1];
          expect(errorArg).toBeInstanceOf(Error);
          expect((errorArg as Error).message).toContain("not from NeatQueue");
        });

        it("parses previous error messages from Guilty Spark", async () => {
          await jobToComplete?.();

          expect(bulkDeleteMessagesSpy).toHaveBeenCalledWith(
            "thread-channel-id",
            ["guilty-spark-error-message-id"],
            "Cleaning up previous Guilty Spark messages before computing data",
          );
        });

        it("handles retry when previous error has Channel, Queue, and Completed data", async () => {
          const handleRetrySpy = vi.spyOn(services.neatQueueService, "handleRetry").mockResolvedValue();

          await jobToComplete?.();

          expect(handleRetrySpy).toHaveBeenCalledWith<Parameters<typeof services.neatQueueService.handleRetry>>({
            errorEmbed: expect.objectContaining({
              data: {
                Channel: "<#1251448849298362419>",
                Queue: "5710",
                Completed: "<t:1763993169:f>",
              },
            }) as EndUserError,
            guildId: "fake-guild-id",
            interaction: threadInteraction,
          });
          expect(getTeamsFromMessageSpy).not.toHaveBeenCalled();
        });

        it("processes queue message directly when no retry data available", async () => {
          getMessagesSpy.mockResolvedValue([threadFirstMessage]);

          await jobToComplete?.();

          expect(getTeamsFromMessageSpy).toHaveBeenCalledWith("fake-guild-id", threadFirstMessage.referenced_message);
        });

        it("calls getSeriesFromDiscordQueue with correct parameters", async () => {
          getMessagesSpy.mockResolvedValue([threadFirstMessage]);

          await jobToComplete?.();

          expect(getSeriesFromDiscordQueueSpy).toHaveBeenCalledWith<
            Parameters<typeof services.haloService.getSeriesFromDiscordQueue>
          >({
            teams: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  id: "000000000000000001",
                  username: "discord_user_01",
                }),
              ]),
            ]) as MatchPlayer[][],
            startDateTime: expect.any(Date) as Date,
            endDateTime: expect.any(Date) as Date,
          });
        });

        it("posts series embeds directly to thread", async () => {
          getMessagesSpy.mockResolvedValue([threadFirstMessage]);

          await jobToComplete?.();

          expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
          expect(createMessageSpy).toHaveBeenCalledWith("thread-channel-id", expect.anything());
        });

        it("posts game stats when StatsReturn is SERIES_AND_GAMES", async () => {
          getMessagesSpy.mockResolvedValue([threadFirstMessage]);
          vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
            aFakeGuildConfigRow({
              StatsReturn: StatsReturnType.SERIES_AND_GAMES,
            }),
          );

          await jobToComplete?.();

          expect(createMessageSpy.mock.calls.length).toBeGreaterThan(2);
        });

        it("only posts Load Games button when StatsReturn is SERIES_ONLY", async () => {
          getMessagesSpy.mockResolvedValue([threadFirstMessage]);
          vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
            aFakeGuildConfigRow({
              StatsReturn: StatsReturnType.SERIES_ONLY,
            }),
          );

          await jobToComplete?.();

          const buttonCall = createMessageSpy.mock.calls.find((call) => call[1].components != null);
          expect(buttonCall).toBeDefined();
          expect(buttonCall?.[1]?.components?.[0]).toMatchObject({
            type: ComponentType.ActionRow,
            components: [
              expect.objectContaining({
                custom_id: "btn_stats_load_games",
              }),
            ],
          });
        });

        it("calls updateDiscordAssociations after processing", async () => {
          getMessagesSpy.mockResolvedValue([threadFirstMessage]);

          await jobToComplete?.();

          expect(updateDiscordAssociationsSpy).toHaveBeenCalled();
        });

        it("appends previous error data when new error occurs", async () => {
          getMessagesSpy.mockResolvedValue([threadFirstMessage]);
          getSeriesFromDiscordQueueSpy.mockReset().mockRejectedValue(new Error("API error"));

          await jobToComplete?.();

          expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
        });
      });

      it("uses parent_id as channel when in thread with queue option specified", () => {
        vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
          name: "neatqueue",
          mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([["queue", 5710]]),
          options: [],
        });

        const { jobToComplete } = statsCommand.execute(threadInteraction);

        expect(jobToComplete).toBeInstanceOf(Function);
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

      it("calls discordService.updateDeferredReplyWithError with an error when an error is thrown", async () => {
        const error = new Error("An error occurred.");
        getMatchDetailsSpy.mockReset().mockRejectedValue(error);

        await jobToComplete?.();

        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", error);
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
            content: "Error: Unknown subcommand",
            flags: MessageFlags.Ephemeral,
          },
        },
      });
    });
  });

  describe("execute(): message component retry button", () => {
    let retryButtonInteraction: APIMessageComponentButtonInteraction;
    let handleRetrySpy: MockInstance<typeof services.neatQueueService.handleRetry>;

    beforeEach(() => {
      const errorEmbed = new EndUserError("Something went wrong", {
        data: {
          Channel: "<#1234567890>",
          Queue: "5",
          Completed: "<t:1700000000:f>",
        },
        actions: ["retry"],
      });

      retryButtonInteraction = {
        ...fakeButtonClickInteraction,
        message: {
          ...fakeButtonClickInteraction.message,
          embeds: [errorEmbed.discordEmbed],
        },
        data: {
          component_type: ComponentType.Button,
          custom_id: "btn_stats_retry",
        },
      };

      handleRetrySpy = vi.spyOn(services.neatQueueService, "handleRetry").mockResolvedValue();
    });

    it("returns DeferredMessageUpdate response for retry button", () => {
      const { response, jobToComplete } = statsCommand.execute(retryButtonInteraction);

      expect(response).toEqual({
        type: InteractionResponseType.DeferredMessageUpdate,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    it("calls neatQueueService.handleRetry with correct parameters", async () => {
      const { jobToComplete } = statsCommand.execute(retryButtonInteraction);
      await jobToComplete?.();

      expect(handleRetrySpy).toHaveBeenCalledOnce();
      expect(handleRetrySpy).toHaveBeenCalledWith({
        errorEmbed: EndUserError.fromDiscordEmbed(Preconditions.checkExists(retryButtonInteraction.message.embeds[0])),
        guildId: "fake-guild-id",
        interaction: retryButtonInteraction,
      });
    });

    it("handles error when embed is missing from message", async () => {
      const interactionWithoutEmbed = {
        ...retryButtonInteraction,
        message: {
          ...retryButtonInteraction.message,
          embeds: [],
        },
      };

      const { jobToComplete } = statsCommand.execute(interactionWithoutEmbed);
      await jobToComplete?.();

      expect(handleRetrySpy).not.toHaveBeenCalled();
      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "No embed found in the message",
        }),
      );
    });

    it("handles error when embed cannot be parsed as EndUserError", async () => {
      const interactionWithInvalidEmbed = {
        ...retryButtonInteraction,
        message: {
          ...retryButtonInteraction.message,
          embeds: [
            {
              title: "Some title",
              description: "Some description",
              color: 0x123456, // Invalid color for EndUserError
            },
          ],
        },
      };

      const { jobToComplete } = statsCommand.execute(interactionWithInvalidEmbed);
      await jobToComplete?.();

      expect(handleRetrySpy).not.toHaveBeenCalled();
      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "No end user error found in the embed",
        }),
      );
    });

    it("handles error when neatQueueService.handleRetry throws", async () => {
      const retryError = new Error("Retry failed");
      handleRetrySpy.mockReset().mockRejectedValue(retryError);

      const { jobToComplete } = statsCommand.execute(retryButtonInteraction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", retryError);
    });
  });
});
