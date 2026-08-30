import type { MockInstance } from "vitest";
import { describe, afterEach, beforeEach, vi, it, expect } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIInteractionResponse,
  APIThreadChannel,
  APIMessage,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  RESTPostAPIChannelThreadsResult,
} from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChannelType,
  ComponentType,
  EmbedType,
  PermissionFlagsBits,
  InteractionResponseType,
  InteractionType,
  Locale,
  MessageFlags,
  MessageType,
} from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { LeaderboardMetricAggregation, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { LeaderboardPlayerRelationshipMetric } from "../../../services/database/types/leaderboard_player_relationship";
import { StatsCommand } from "../stats";
import type { Services } from "../../../services/install";
import { installFakeServicesWith } from "../../../services/fakes/services";
import {
  apiMessage,
  channelThreadsResult,
  discordNeatQueueData,
  fakeBaseAPIApplicationCommandInteraction,
  fakeButtonClickInteraction,
  textChannel,
  threadChannel,
} from "../../../services/discord/fakes/data";
import { aFakeMatchHistoryEntryWith, getMatchStats, getPlayerXuidsToGametags } from "../../../services/halo/fakes/data";
import { StatsReturnType } from "../../../services/database/types/guild_config";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import {
  aFakeDiscordAssociationsRow,
  aFakeGuildConfigRow,
  aFakeLeaderboardPlayerStatsRow,
  aFakeNeatQueueConfigRow,
} from "../../../services/database/fakes/database.fake";
import { EndUserError } from "../../../base/end-user-error";
import {
  PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
  PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
} from "../../../embeds/stats/player-stats-embed";
import type { MatchPlayer } from "../../../services/halo/types";
import {
  DISCORD_SERIES_STATS_RESOLVED_CACHE_TTL_SECONDS,
  getDiscordSeriesStatsCacheKey,
} from "../../../services/discord/discord-series-stats";

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

const applicationCommandInteractionStatsFix: APIApplicationCommandInteraction = {
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
        name: "fix",
        options: [
          {
            name: "queue_number",
            type: ApplicationCommandOptionType.Integer,
            value: 777,
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
  let appDataPutSpy: MockInstance<typeof env.APP_DATA.put>;
  let updateDeferredReplySpy: MockInstance<typeof services.discordService.updateDeferredReply>;
  let updateDeferredReplyWithErrorSpy: MockInstance<typeof services.discordService.updateDeferredReplyWithError>;

  beforeEach(() => {
    env = aFakeEnvWith();
    services = installFakeServicesWith({ env });
    statsCommand = new StatsCommand(services, env);
    appDataPutSpy = vi.spyOn(env.APP_DATA, "put").mockResolvedValue();

    updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue(apiMessage);
    updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(apiMessage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
          .mockResolvedValue([
            Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
            Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth")),
            Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
          ]);
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
            "Queue #777 series stats (🦅 2:1 🐍)",
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

      it("caches resolved discord series stats after posting embeds", async () => {
        await jobToComplete?.();

        expect(appDataPutSpy).toHaveBeenCalledWith(
          getDiscordSeriesStatsCacheKey("fake-guild-id", 777),
          expect.any(String),
          expect.objectContaining({ expirationTtl: DISCORD_SERIES_STATS_RESOLVED_CACHE_TTL_SECONDS }),
        );
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
            .mockResolvedValue([
              Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
              Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth")),
              Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
            ]);
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

        it("caches resolved discord series stats after posting embeds", async () => {
          getMessagesSpy.mockResolvedValue([threadFirstMessage]);

          await jobToComplete?.();

          expect(appDataPutSpy).toHaveBeenCalledWith(
            getDiscordSeriesStatsCacheKey("fake-guild-id", 777),
            expect.any(String),
            expect.objectContaining({ expirationTtl: DISCORD_SERIES_STATS_RESOLVED_CACHE_TTL_SECONDS }),
          );
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
      const ctfMatch = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      let jobToComplete: (() => Promise<void>) | undefined;
      let getMatchDetailsSpy: MockInstance;
      let getPlayerXuidsToGamertagsSpy: MockInstance;

      beforeEach(() => {
        getMatchDetailsSpy = vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([ctfMatch]);
        getPlayerXuidsToGamertagsSpy = vi
          .spyOn(services.haloService, "getPlayerXuidsToGametags")
          .mockResolvedValue(getPlayerXuidsToGametags());

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

        expect(getPlayerXuidsToGamertagsSpy).toHaveBeenCalledWith(ctfMatch, { presentAtBeginningOnly: true });
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

  describe("execute(): subcommand fix", () => {
    beforeEach(() => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "fix",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>([
          ["queue_number", 777],
        ]),
        options: [],
      });
    });

    it("returns deferred ephemeral response", () => {
      const { response, jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsFix);

      expect(response).toEqual({
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: {
          flags: MessageFlags.Ephemeral,
        },
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    it("returns immediate error when queue_number is missing outside thread", () => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "fix",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>(),
        options: [],
      });

      const { response } = statsCommand.execute(applicationCommandInteractionStatsFix);

      expect(response).toEqual({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Error: queue_number is required when running /stats fix outside a thread.",
          flags: MessageFlags.Ephemeral,
        },
      });
    });

    it("starts in-thread fix flow when queue_number is omitted", async () => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "fix",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>(),
        options: [],
      });
      const findQueueNumberForThreadSpy = vi
        .spyOn(services.discordService, "findQueueNumberForThread")
        .mockResolvedValue(777);
      const getTeamsFromQueueResultSpy = vi
        .spyOn(services.discordService, "getTeamsFromQueueResult")
        .mockResolvedValue(discordNeatQueueData);
      vi.spyOn(services.discordService, "computeMemberPermissions").mockResolvedValue(0n);
      vi.spyOn(services.databaseService, "getDiscordAssociations").mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000001",
          XboxId: "xuid-1",
        }),
      ]);
      vi.spyOn(services.haloService, "getUsersByXuids").mockResolvedValue([{ xuid: "xuid-1", gamertag: "player-one" }]);
      updateDeferredReplySpy.mockResolvedValue({
        ...apiMessage,
        id: "fix-flow-message-id",
      });
      const setInteractionMetadataSpy = vi.spyOn(services.discordService, "setInteractionMetadata").mockResolvedValue();

      const threadInteraction: APIApplicationCommandInteraction = {
        ...applicationCommandInteractionStatsFix,
        channel: threadChannel,
        member: {
          ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member),
          user: {
            ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member?.user),
            id: "000000000000000001",
          },
        },
      };

      const { response, jobToComplete } = statsCommand.execute(threadInteraction);
      expect(response).toEqual({
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: {
          flags: MessageFlags.Ephemeral,
        },
      });

      await jobToComplete?.();

      expect(findQueueNumberForThreadSpy).toHaveBeenCalledWith("fake-guild-id", "thread-channel-id");
      expect(getTeamsFromQueueResultSpy).toHaveBeenCalledWith("fake-guild-id", "parent-id", 777);
      expect(setInteractionMetadataSpy).toHaveBeenCalledWith(
        "statsFix:fix-flow-message-id",
        expect.objectContaining({
          channelId: "parent-id",
        }),
      );
      const storedMetadata = Preconditions.checkExists(setInteractionMetadataSpy.mock.calls[0]?.[1]) as {
        queueData: Record<string, unknown>;
      };
      expect(storedMetadata.queueData["timestamp"]).toBeUndefined();
      expect(updateDeferredReplyWithErrorSpy).not.toHaveBeenCalled();
    });

    it("propagates an error when the queue can't be resolved from the parent channel", async () => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "fix",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>(),
        options: [],
      });
      vi.spyOn(services.discordService, "findQueueNumberForThread").mockResolvedValue(777);
      const notFoundError = new EndUserError("No queue found within the last 100 messages of <#parent-id>.");
      vi.spyOn(services.discordService, "getTeamsFromQueueResult").mockRejectedValue(notFoundError);

      const threadInteraction: APIApplicationCommandInteraction = {
        ...applicationCommandInteractionStatsFix,
        channel: threadChannel,
      };

      const { jobToComplete } = statsCommand.execute(threadInteraction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", notFoundError);
    });

    it("returns an actionable error when the thread's queue number cannot be determined", async () => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "fix",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>(),
        options: [],
      });
      vi.spyOn(services.discordService, "findQueueNumberForThread").mockResolvedValue(undefined);
      const getTeamsFromQueueResultSpy = vi.spyOn(services.discordService, "getTeamsFromQueueResult");

      const threadInteraction: APIApplicationCommandInteraction = {
        ...applicationCommandInteractionStatsFix,
        channel: threadChannel,
      };

      const { jobToComplete } = statsCommand.execute(threadInteraction);
      await jobToComplete?.();

      expect(getTeamsFromQueueResultSpy).not.toHaveBeenCalled();
      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message:
            "Could not determine which queue this thread's stats are for. Try running /stats fix queue_number:<queue> from the parent channel instead.",
        }),
      );
    });

    it("starts player selection flow when user is queue player", async () => {
      const queuePlayerInteraction: APIApplicationCommandInteraction = {
        ...applicationCommandInteractionStatsFix,
        member: {
          ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member),
          user: {
            ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member?.user),
            id: "000000000000000001",
          },
        },
      };

      vi.spyOn(services.discordService, "getTeamsFromQueueResult").mockResolvedValue(discordNeatQueueData);
      vi.spyOn(services.discordService, "computeMemberPermissions").mockResolvedValue(0n);
      vi.spyOn(services.databaseService, "getDiscordAssociations").mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000001",
          XboxId: "xuid-1",
        }),
      ]);
      vi.spyOn(services.haloService, "getUsersByXuids").mockResolvedValue([{ xuid: "xuid-1", gamertag: "player-one" }]);
      const getMessageFromInteractionTokenSpy = vi.spyOn(services.discordService, "getMessageFromInteractionToken");
      updateDeferredReplySpy.mockResolvedValue({
        ...apiMessage,
        id: "fix-flow-message-id",
      });
      const setInteractionMetadataSpy = vi.spyOn(services.discordService, "setInteractionMetadata").mockResolvedValue();

      const { jobToComplete } = statsCommand.execute(queuePlayerInteraction);
      await jobToComplete?.();

      expect(getMessageFromInteractionTokenSpy).not.toHaveBeenCalled();
      expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", expect.anything());
      const updatePayload = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]?.[1]);
      expect(updatePayload.components?.[0]).toMatchObject({
        type: ComponentType.ActionRow,
        components: [
          expect.objectContaining({
            type: ComponentType.StringSelect,
            custom_id: "btn_stats_fix_player_select",
          }),
        ],
      });
      expect(setInteractionMetadataSpy).toHaveBeenCalledWith(
        "statsFix:fix-flow-message-id",
        expect.objectContaining({
          guildId: "fake-guild-id",
          channelId: "fake-channel-id",
        }),
      );
    });

    it("rejects users that are not queue players and not admins", async () => {
      vi.spyOn(services.discordService, "getTeamsFromQueueResult").mockResolvedValue(discordNeatQueueData);
      vi.spyOn(services.discordService, "computeMemberPermissions").mockResolvedValue(0n);

      const notPlayerInteraction: APIApplicationCommandInteraction = {
        ...applicationCommandInteractionStatsFix,
        member: {
          ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member),
          user: {
            ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member?.user),
            id: "not-in-queue",
          },
        },
      };

      const { jobToComplete } = statsCommand.execute(notPlayerInteraction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "Only players from that queue (or admins) can run /stats fix.",
        }),
      );
    });

    it("returns an error when queue players do not have connected Halo accounts", async () => {
      const queuePlayerInteraction: APIApplicationCommandInteraction = {
        ...applicationCommandInteractionStatsFix,
        member: {
          ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member),
          user: {
            ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member?.user),
            id: "000000000000000001",
          },
        },
      };

      vi.spyOn(services.discordService, "getTeamsFromQueueResult").mockResolvedValue(discordNeatQueueData);
      vi.spyOn(services.discordService, "computeMemberPermissions").mockResolvedValue(0n);
      vi.spyOn(services.databaseService, "getDiscordAssociations").mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000001",
          XboxId: "",
        }),
      ]);

      const { jobToComplete } = statsCommand.execute(queuePlayerInteraction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "No players in that queue have a connected Halo account. Ask a player to run /connect first.",
        }),
      );
    });

    it("allows admins that are not queue players", async () => {
      vi.spyOn(services.discordService, "getTeamsFromQueueResult").mockResolvedValue(discordNeatQueueData);
      vi.spyOn(services.discordService, "computeMemberPermissions").mockResolvedValue(
        PermissionFlagsBits.Administrator,
      );
      vi.spyOn(services.databaseService, "getDiscordAssociations").mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000001",
          XboxId: "xuid-1",
        }),
      ]);
      vi.spyOn(services.haloService, "getUsersByXuids").mockResolvedValue([{ xuid: "xuid-1", gamertag: "player-one" }]);
      updateDeferredReplySpy.mockResolvedValue({
        ...apiMessage,
        id: "fix-flow-message-id",
      });
      vi.spyOn(services.discordService, "setInteractionMetadata").mockResolvedValue();

      const adminInteraction: APIApplicationCommandInteraction = {
        ...applicationCommandInteractionStatsFix,
        member: {
          ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member),
          user: {
            ...Preconditions.checkExists(applicationCommandInteractionStatsFix.member?.user),
            id: "not-in-queue",
          },
        },
      };

      const { jobToComplete } = statsCommand.execute(adminInteraction);
      await jobToComplete?.();

      expect(updateDeferredReplySpy).toHaveBeenCalled();
      expect(updateDeferredReplyWithErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("execute(): message component fix player select", () => {
    it("retries fix-flow metadata with backoff before returning not-found error", async () => {
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_player_select",
          values: ["000000000000000001"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      const getInteractionMetadataSpy = vi
        .spyOn(services.discordService, "getInteractionMetadata")
        .mockResolvedValue(null);

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(getInteractionMetadataSpy).toHaveBeenCalledTimes(4);
      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "Could not find fix-flow state. Please run /stats fix again.",
        }),
      );
    });

    it("loads candidate games and shows multi-select", async () => {
      const firstMatchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";
      const secondMatchId = "e20900f9-4c6c-4003-a175-00000000koth";
      const thirdMatchId = "9535b946-f30c-4a43-b852-000000slayer";
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_player_select",
          values: ["000000000000000001"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: discordNeatQueueData,
      });
      vi.spyOn(services.databaseService, "getDiscordAssociations").mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000001",
          XboxId: "xuid-1",
        }),
      ]);
      vi.spyOn(services.haloService, "getUsersByXuids").mockResolvedValue([{ xuid: "xuid-1", gamertag: "player-one" }]);
      vi.spyOn(services.haloService, "getEnrichedMatchHistory").mockResolvedValue({
        gamertag: "player-one",
        xuid: "xuid-1",
        suggestedGroupings: [],
        matches: [
          aFakeMatchHistoryEntryWith({
            matchId: firstMatchId,
            modeName: "CTF",
            mapName: "Bazaar",
            resultString: "Win - 3:1",
            endTime: "2025-01-01 10:00 AM",
          }),
          aFakeMatchHistoryEntryWith({
            matchId: secondMatchId,
            modeName: "Strongholds",
            mapName: "Live Fire",
            resultString: "Loss - 2:3",
            endTime: "2025-01-01 10:20 AM",
          }),
          aFakeMatchHistoryEntryWith({
            matchId: thirdMatchId,
            modeName: "Slayer",
            mapName: "Recharge",
            resultString: "Win - 50:45",
            endTime: "2025-01-01 10:40 AM",
          }),
        ],
      });
      vi.spyOn(services.discordService, "findExistingSeriesStatsThreadLocation").mockResolvedValue({
        threadId: "existing-thread-id",
        parentOverviewMessageId: "stats-overview-id",
      });
      vi.spyOn(services.discordService, "getMessage").mockResolvedValue({
        ...apiMessage,
        id: "stats-overview-id",
        embeds: [
          {
            type: EmbedType.Rich,
            color: 0x3498db,
            title: "Series stats for queue #777 (2-1)",
            fields: [
              {
                name: "Game",
                value:
                  "[CTF on Bazaar](https://halodatahive.com/Infinite/Match/d81554d7-ddfe-44da-a6cb-000000000ctf)\n[Slayer on Recharge](https://halodatahive.com/Infinite/Match/9535b946-f30c-4a43-b852-000000slayer)",
                inline: true,
              },
            ],
          },
        ],
      });
      const setInteractionMetadataSpy = vi.spyOn(services.discordService, "setInteractionMetadata").mockResolvedValue();

      const { response, jobToComplete } = statsCommand.execute(interaction);
      expect(response).toEqual({
        type: InteractionResponseType.UpdateMessage,
        data: {
          embeds: [expect.objectContaining({ description: "Fetching recent custom games..." })],
          components: [],
        },
      });

      await jobToComplete?.();

      expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", expect.anything());
      expect(updateDeferredReplySpy).toHaveBeenCalledTimes(1);

      const updatePayload = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]?.[1]);
      expect(updatePayload.components?.[0]).toMatchObject({
        components: [
          expect.objectContaining({
            custom_id: "btn_stats_fix_games_select",
            options: [
              expect.objectContaining({
                value: firstMatchId,
                label: "CTF Bazaar - Win - 3:1",
                description: expect.stringMatching(/^Ended .+ ago \(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\)$/) as string,
                default: true,
              }),
              expect.objectContaining({
                value: secondMatchId,
                label: "Strongholds Live Fire - Loss - 2:3",
                description: expect.stringMatching(/^Ended .+ ago \(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\)$/) as string,
                default: false,
              }),
              expect.objectContaining({
                value: thirdMatchId,
                label: "Slayer Recharge - Win - 50:45",
                description: expect.stringMatching(/^Ended .+ ago \(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\)$/) as string,
                default: true,
              }),
            ],
          }),
        ],
      });

      expect(setInteractionMetadataSpy).toHaveBeenCalledWith("statsFix:fix-flow-message-id", expect.anything());
      const interactionMetadata = Preconditions.checkExists(setInteractionMetadataSpy.mock.calls[0]?.[1]);
      expect(interactionMetadata["selectedPlayerId"]).toBe("000000000000000001");
      expect(interactionMetadata["selectedMatchIds"]).toEqual([firstMatchId, thirdMatchId]);
    });

    it("keeps the provided end time when relative-time parsing fails", async () => {
      const firstMatchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";
      const secondMatchId = "e20900f9-4c6c-4003-a175-00000000koth";
      const thirdMatchId = "9535b946-f30c-4a43-b852-000000slayer";
      const unparseableEndTime = "31.12.2025, 22:10:00";
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_player_select",
          values: ["000000000000000001"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: discordNeatQueueData,
      });
      vi.spyOn(services.databaseService, "getDiscordAssociations").mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000001",
          XboxId: "xuid-1",
        }),
      ]);
      vi.spyOn(services.haloService, "getUsersByXuids").mockResolvedValue([{ xuid: "xuid-1", gamertag: "player-one" }]);
      vi.spyOn(services.haloService, "getEnrichedMatchHistory").mockResolvedValue({
        gamertag: "player-one",
        xuid: "xuid-1",
        suggestedGroupings: [],
        matches: [
          aFakeMatchHistoryEntryWith({
            matchId: firstMatchId,
            modeName: "CTF",
            mapName: "Bazaar",
            resultString: "Win - 3:1",
            endTime: unparseableEndTime,
            endTimeIso: "",
          }),
          aFakeMatchHistoryEntryWith({
            matchId: secondMatchId,
            modeName: "Strongholds",
            mapName: "Live Fire",
            resultString: "Loss - 2:3",
            endTime: "2025-01-01 10:20 AM",
          }),
          aFakeMatchHistoryEntryWith({
            matchId: thirdMatchId,
            modeName: "Slayer",
            mapName: "Recharge",
            resultString: "Win - 50:45",
            endTime: "2025-01-01 10:40 AM",
          }),
        ],
      });
      vi.spyOn(services.discordService, "findExistingSeriesStatsThreadLocation").mockResolvedValue(undefined);

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      const updatePayload = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]?.[1]);
      const actionRow = Preconditions.checkExists(updatePayload.components?.[0]);
      if (!("components" in actionRow)) {
        throw new Error("Expected action row component");
      }
      const selectComponent = Preconditions.checkExists(actionRow.components[0]);
      if (!("options" in selectComponent)) {
        throw new Error("Expected select component");
      }
      expect(selectComponent).toMatchObject({
        custom_id: "btn_stats_fix_games_select",
      });
      expect(selectComponent.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: firstMatchId,
            description: `Ended at ${unparseableEndTime}`,
          }),
        ]),
      );
    });

    it("falls back to absolute time when end time resolves in the future", async () => {
      const firstMatchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_player_select",
          values: ["000000000000000001"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: discordNeatQueueData,
      });
      vi.spyOn(services.databaseService, "getDiscordAssociations").mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000001",
          XboxId: "xuid-1",
        }),
      ]);
      vi.spyOn(services.haloService, "getUsersByXuids").mockResolvedValue([{ xuid: "xuid-1", gamertag: "player-one" }]);
      vi.spyOn(services.haloService, "getEnrichedMatchHistory").mockResolvedValue({
        gamertag: "player-one",
        xuid: "xuid-1",
        suggestedGroupings: [],
        matches: [
          aFakeMatchHistoryEntryWith({
            matchId: firstMatchId,
            modeName: "CTF",
            mapName: "Bazaar",
            resultString: "Win - 3:1",
            endTime: "9/1/2100, 3:00:00 PM",
            endTimeIso: "2100-09-01T15:00:00.000Z",
          }),
        ],
      });
      vi.spyOn(services.discordService, "findExistingSeriesStatsThreadLocation").mockResolvedValue(undefined);

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      const updatePayload = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]?.[1]);
      const actionRow = Preconditions.checkExists(updatePayload.components?.[0]);
      if (!("components" in actionRow)) {
        throw new Error("Expected action row component");
      }
      const selectComponent = Preconditions.checkExists(actionRow.components[0]);
      if (!("options" in selectComponent)) {
        throw new Error("Expected select component");
      }

      expect(selectComponent.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: firstMatchId,
            description: "Ended at 2100-09-01 15:00 UTC",
          }),
        ]),
      );
    });

    it("returns an error when selected player has no linked xbox account", async () => {
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_player_select",
          values: ["000000000000000001"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: discordNeatQueueData,
      });
      vi.spyOn(services.databaseService, "getDiscordAssociations").mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000001",
          XboxId: "",
        }),
      ]);

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "That player does not have a linked Xbox account.",
        }),
      );
    });
  });

  describe("execute(): message component fix games select", () => {
    it("creates preview embed and shows confirm/cancel buttons", async () => {
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_games_select",
          values: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: discordNeatQueueData,
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      const setInteractionMetadataSpy = vi.spyOn(services.discordService, "setInteractionMetadata").mockResolvedValue();

      const { response, jobToComplete } = statsCommand.execute(interaction);
      expect(response).toEqual({ type: InteractionResponseType.DeferredMessageUpdate });

      await jobToComplete?.();

      expect(setInteractionMetadataSpy).toHaveBeenCalledWith(
        "statsFix:fix-flow-message-id",
        expect.objectContaining({
          selectedMatchIds: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
          selectedSeriesOutcome: "TIE",
        }),
      );
      const updatePayload = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]?.[1]);
      const statusEmbed = Preconditions.checkExists(updatePayload.embeds?.[0]);
      expect(statusEmbed.description).toContain("Preview generated. Confirm to replace the previous series stats.");
      expect(statusEmbed.description).toContain("Derived result:");
      expect(statusEmbed.description).toContain("Final result:");
      expect(updatePayload.components).toEqual([
        {
          type: ComponentType.ActionRow,
          components: [expect.objectContaining({ custom_id: "btn_stats_fix_outcome_select" })],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            expect.objectContaining({ custom_id: "btn_stats_fix_confirm" }),
            expect.objectContaining({ custom_id: "btn_stats_fix_cancel" }),
          ],
        },
      ]);
    });

    it("resets final outcome to the newly derived outcome when game selection changes", async () => {
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_games_select",
          values: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: discordNeatQueueData,
        selectedSeriesOutcome: "TEAM_1",
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      const setInteractionMetadataSpy = vi.spyOn(services.discordService, "setInteractionMetadata").mockResolvedValue();

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(setInteractionMetadataSpy).toHaveBeenCalledWith(
        "statsFix:fix-flow-message-id",
        expect.objectContaining({
          selectedMatchIds: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
          selectedSeriesOutcome: "TIE",
        }),
      );
      const updatePayload = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]?.[1]);
      const statusEmbed = Preconditions.checkExists(updatePayload.embeds?.[0]);
      expect(statusEmbed.description).toContain("Derived result: Tie");
      expect(statusEmbed.description).toContain("Final result: Tie");
    });

    it("sanitizes markdown in team labels for outcome selector", async () => {
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_games_select",
          values: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: {
          ...discordNeatQueueData,
          teams: [
            { ...Preconditions.checkExists(discordNeatQueueData.teams[0]), name: "__Cobra__" },
            { ...Preconditions.checkExists(discordNeatQueueData.teams[1]), name: "**Viper**" },
          ],
        },
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      vi.spyOn(services.discordService, "setInteractionMetadata").mockResolvedValue();

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      const updatePayload = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]?.[1]);
      const outcomeRow = Preconditions.checkExists(updatePayload.components?.[0]);
      if (!("components" in outcomeRow)) {
        throw new Error("Expected outcome action row");
      }
      const outcomeSelect = Preconditions.checkExists(outcomeRow.components[0]);
      if (!("options" in outcomeSelect)) {
        throw new Error("Expected outcome select");
      }

      expect(outcomeSelect.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: "TEAM_0", label: "Cobra wins" }),
          expect.objectContaining({ value: "TEAM_1", label: "Viper wins" }),
        ]),
      );
    });

    it("truncates outcome selector labels to Discord's 100 character limit", async () => {
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_games_select",
          values: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: {
          ...discordNeatQueueData,
          teams: [
            { ...Preconditions.checkExists(discordNeatQueueData.teams[0]), name: "A".repeat(140) },
            { ...Preconditions.checkExists(discordNeatQueueData.teams[1]), name: "B".repeat(160) },
          ],
        },
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      vi.spyOn(services.discordService, "setInteractionMetadata").mockResolvedValue();

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      const updatePayload = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]?.[1]);
      const outcomeRow = Preconditions.checkExists(updatePayload.components?.[0]);
      if (!("components" in outcomeRow)) {
        throw new Error("Expected outcome action row");
      }
      const outcomeSelect = Preconditions.checkExists(outcomeRow.components[0]);
      if (!("options" in outcomeSelect)) {
        throw new Error("Expected outcome select");
      }

      const team0Option = Preconditions.checkExists(outcomeSelect.options.find((option) => option.value === "TEAM_0"));
      const team1Option = Preconditions.checkExists(outcomeSelect.options.find((option) => option.value === "TEAM_1"));
      expect(team0Option.label.length).toBe(100);
      expect(team1Option.label.length).toBe(100);
    });
  });

  describe("execute(): message component fix outcome select", () => {
    it("persists an explicit tie outcome and rerenders the preview", async () => {
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_outcome_select",
          values: ["TIE"],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };
      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: discordNeatQueueData,
        selectedMatchIds: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        selectedSeriesOutcome: "TEAM_1",
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      const setInteractionMetadataSpy = vi.spyOn(services.discordService, "setInteractionMetadata").mockResolvedValue();

      const { response, jobToComplete } = statsCommand.execute(interaction);
      expect(response).toEqual({ type: InteractionResponseType.DeferredMessageUpdate });

      await jobToComplete?.();

      expect(setInteractionMetadataSpy).toHaveBeenCalledWith(
        "statsFix:fix-flow-message-id",
        expect.objectContaining({ selectedSeriesOutcome: "TIE" }),
      );
      const updatePayload = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]?.[1]);
      const statusEmbed = Preconditions.checkExists(updatePayload.embeds?.[0]);
      expect(statusEmbed.description).toContain("Final result: Tie");
    });

    it("returns an error when no outcome value is selected", async () => {
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: "btn_stats_fix_outcome_select",
          values: [],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "No series outcome selected. Please run /stats fix again.",
        }),
      );
    });
  });

  describe("execute(): message component fix confirm", () => {
    it("returns an error when selected series outcome is missing from fix-flow metadata", async () => {
      const interaction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.Button,
          custom_id: "btn_stats_fix_confirm",
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: {
          ...discordNeatQueueData,
          message: {
            ...discordNeatQueueData.message,
            id: "queue-neatqueue-message-id",
          },
        },
        selectedMatchIds: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
      });

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "No final series result was selected. Please run /stats fix again.",
        }),
      );
    });

    it("rebuilds stats in related thread and marks amendment", async () => {
      const interaction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.Button,
          custom_id: "btn_stats_fix_confirm",
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: {
          ...discordNeatQueueData,
          message: {
            ...discordNeatQueueData.message,
            id: "queue-neatqueue-message-id",
          },
        },
        selectedMatchIds: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        selectedSeriesOutcome: "TEAM_1",
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
        aFakeGuildConfigRow({ StatsReturn: StatsReturnType.SERIES_ONLY }),
      );
      vi.spyOn(services.databaseService, "getNeatQueueConfig").mockResolvedValue(aFakeNeatQueueConfigRow());
      const persistReconciledSeriesDataSpy = vi
        .spyOn(services.leaderboardService, "persistReconciledSeriesData")
        .mockResolvedValue();
      const findExistingSeriesStatsThreadLocationSpy = vi
        .spyOn(services.discordService, "findExistingSeriesStatsThreadLocation")
        .mockResolvedValue({ threadId: "existing-thread-id", parentOverviewMessageId: "original-overview-message-id" });
      const findBotMessagesInThreadSpy = vi
        .spyOn(services.discordService, "findBotMessagesInThread")
        .mockResolvedValue([
          {
            ...apiMessage,
            id: "thread-msg-1",
            content: "old bot stats message",
            author: {
              ...apiMessage.author,
              id: env.DISCORD_APP_ID,
            },
          },
          {
            ...apiMessage,
            id: "thread-msg-3",
            content: "another bot stats message",
            author: {
              ...apiMessage.author,
              id: env.DISCORD_APP_ID,
            },
          },
        ]);
      const bulkDeleteMessagesSpy = vi.spyOn(services.discordService, "bulkDeleteMessages").mockResolvedValue();
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue();
      const editMessageSpy = vi.spyOn(services.discordService, "editMessage").mockResolvedValue(apiMessage);
      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
      const startThreadFromMessageSpy = vi.spyOn(services.discordService, "startThreadFromMessage");
      const cacheResolvedDiscordSeriesStatsSpy = vi
        .spyOn(services.discordService, "cacheResolvedDiscordSeriesStats")
        .mockResolvedValue();
      vi.spyOn(services.haloService, "getPlayerXuidsToGametags").mockResolvedValue(getPlayerXuidsToGametags());

      const { response, jobToComplete } = statsCommand.execute(interaction);
      expect(response).toEqual({ type: InteractionResponseType.DeferredMessageUpdate });

      await jobToComplete?.();

      expect(findExistingSeriesStatsThreadLocationSpy).toHaveBeenCalledWith("fake-guild-id", 777);
      expect(findBotMessagesInThreadSpy).toHaveBeenCalledWith("fake-guild-id", "existing-thread-id");
      expect(bulkDeleteMessagesSpy).toHaveBeenCalledWith(
        "existing-thread-id",
        ["thread-msg-1", "thread-msg-3"],
        "Replacing amended series stats",
      );
      expect(deleteMessageSpy).not.toHaveBeenCalledWith(
        "fake-channel-id",
        "original-overview-message-id",
        "Replacing amended series stats",
      );
      expect(editMessageSpy).toHaveBeenCalledWith("fake-channel-id", "original-overview-message-id", expect.anything());
      expect(startThreadFromMessageSpy).not.toHaveBeenCalled();
      expect(createMessageSpy).toHaveBeenCalledWith("existing-thread-id", expect.anything());
      expect(cacheResolvedDiscordSeriesStatsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: "fake-guild-id",
          queueNumber: 777,
        }),
      );
      const editMessagePayload = Preconditions.checkExists(editMessageSpy.mock.calls[0]?.[2]);
      const firstEmbed = Preconditions.checkExists(editMessagePayload.embeds?.[0]);
      const amendedByField = firstEmbed.fields?.find((field) => field.name === "Amended by");
      expect(amendedByField).toBeDefined();
      expect(Preconditions.checkExists(amendedByField).value.length).toBeGreaterThan(0);
      expect(persistReconciledSeriesDataSpy).toHaveBeenCalledWith(
        expect.objectContaining({ winnerTeamIndex: 1, queueNumber: 777 }),
      );
      expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
        embeds: [expect.objectContaining({ description: "Series stats were amended successfully." })],
        components: [],
      });
    });

    it("persists reconciled winner as -1 when final selected outcome is tie", async () => {
      const interaction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.Button,
          custom_id: "btn_stats_fix_confirm",
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: {
          ...discordNeatQueueData,
          message: {
            ...discordNeatQueueData.message,
            id: "queue-neatqueue-message-id",
          },
        },
        selectedMatchIds: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        selectedSeriesOutcome: "TIE",
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
        aFakeGuildConfigRow({ StatsReturn: StatsReturnType.SERIES_ONLY }),
      );
      vi.spyOn(services.databaseService, "getNeatQueueConfig").mockResolvedValue(aFakeNeatQueueConfigRow());
      const persistReconciledSeriesDataSpy = vi
        .spyOn(services.leaderboardService, "persistReconciledSeriesData")
        .mockResolvedValue();
      vi.spyOn(services.discordService, "findExistingSeriesStatsThreadLocation").mockResolvedValue(undefined);
      vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.discordService, "startThreadFromMessage").mockResolvedValue({
        id: "new-thread-id",
      } as RESTPostAPIChannelThreadsResult);
      vi.spyOn(services.haloService, "getPlayerXuidsToGametags").mockResolvedValue(getPlayerXuidsToGametags());

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(persistReconciledSeriesDataSpy).toHaveBeenCalledWith(
        expect.objectContaining({ winnerTeamIndex: -1, queueNumber: 777 }),
      );
      expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
        embeds: [expect.objectContaining({ description: "Series stats were amended successfully." })],
        components: [],
      });
    });

    it("continues successfully when leaderboard reconciliation fails after discord updates", async () => {
      const interaction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.Button,
          custom_id: "btn_stats_fix_confirm",
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: {
          ...discordNeatQueueData,
          message: {
            ...discordNeatQueueData.message,
            id: "queue-neatqueue-message-id",
          },
        },
        selectedMatchIds: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        selectedSeriesOutcome: "TEAM_1",
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
        aFakeGuildConfigRow({ StatsReturn: StatsReturnType.SERIES_ONLY }),
      );
      vi.spyOn(services.databaseService, "getNeatQueueConfig").mockRejectedValue(
        new Error("neat queue config unavailable"),
      );
      const logWarnSpy = vi.spyOn(services.logService, "warn");
      vi.spyOn(services.discordService, "findExistingSeriesStatsThreadLocation").mockResolvedValue(undefined);
      vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.discordService, "startThreadFromMessage").mockResolvedValue({
        id: "new-thread-id",
      } as RESTPostAPIChannelThreadsResult);
      vi.spyOn(services.haloService, "getPlayerXuidsToGametags").mockResolvedValue(getPlayerXuidsToGametags());

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(logWarnSpy).toHaveBeenCalled();
      const [warnError, warnContext] = Preconditions.checkExists(
        logWarnSpy.mock.calls.find(
          ([, extra]) => extra?.get("context") === "Stats fix leaderboard reconciliation failed",
        ),
      );
      expect(warnError).toBeInstanceOf(Error);
      expect(warnContext?.get("context")).toBe("Stats fix leaderboard reconciliation failed");
      expect(warnContext?.get("guildId")).toBe("fake-guild-id");
      expect(warnContext?.get("channelId")).toBe("fake-channel-id");
      expect(warnContext?.get("queue")).toBe("777");
      expect(updateDeferredReplyWithErrorSpy).not.toHaveBeenCalled();
      expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
        embeds: [expect.objectContaining({ description: "Series stats were amended successfully." })],
        components: [],
      });
    });

    it("creates a new thread when no existing series stats message is found", async () => {
      const interaction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.Button,
          custom_id: "btn_stats_fix_confirm",
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: {
          ...discordNeatQueueData,
          message: {
            ...discordNeatQueueData.message,
            id: "queue-neatqueue-message-id",
          },
        },
        selectedMatchIds: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        selectedSeriesOutcome: "TEAM_1",
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
        aFakeGuildConfigRow({ StatsReturn: StatsReturnType.SERIES_ONLY }),
      );
      vi.spyOn(services.databaseService, "getNeatQueueConfig").mockResolvedValue(aFakeNeatQueueConfigRow());
      vi.spyOn(services.discordService, "findExistingSeriesStatsThreadLocation").mockResolvedValue(undefined);
      const createMessageSpy = vi
        .spyOn(services.discordService, "createMessage")
        .mockResolvedValueOnce({ ...apiMessage, id: "new-overview-message-id" })
        .mockResolvedValue(apiMessage);
      const startThreadFromMessageSpy = vi
        .spyOn(services.discordService, "startThreadFromMessage")
        .mockResolvedValue({ id: "new-thread-id" } as RESTPostAPIChannelThreadsResult);
      vi.spyOn(services.haloService, "getPlayerXuidsToGametags").mockResolvedValue(getPlayerXuidsToGametags());

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(createMessageSpy).toHaveBeenCalledWith("fake-channel-id", expect.anything());
      expect(startThreadFromMessageSpy).toHaveBeenCalledWith(
        "fake-channel-id",
        "new-overview-message-id",
        expect.stringContaining("Queue #777 series stats"),
      );
      expect(createMessageSpy).toHaveBeenCalledWith("new-thread-id", expect.anything());
      expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
        embeds: [expect.objectContaining({ description: "Series stats were amended successfully." })],
        components: [],
      });
    });

    it("falls back to single deletes when bulk delete fails in an existing thread", async () => {
      const interaction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.Button,
          custom_id: "btn_stats_fix_confirm",
        },
        message: {
          ...fakeButtonClickInteraction.message,
          id: "fix-flow-message-id",
        },
      };

      vi.spyOn(services.discordService, "getInteractionMetadata").mockResolvedValue({
        guildId: "fake-guild-id",
        channelId: "fake-channel-id",
        queueData: {
          ...discordNeatQueueData,
          message: {
            ...discordNeatQueueData.message,
            id: "queue-neatqueue-message-id",
          },
        },
        selectedMatchIds: ["d81554d7-ddfe-44da-a6cb-000000000ctf", "9535b946-f30c-4a43-b852-000000slayer"],
        selectedSeriesOutcome: "TEAM_1",
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([
        Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
      ]);
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(
        aFakeGuildConfigRow({ StatsReturn: StatsReturnType.SERIES_ONLY }),
      );
      vi.spyOn(services.databaseService, "getNeatQueueConfig").mockResolvedValue(aFakeNeatQueueConfigRow());
      vi.spyOn(services.discordService, "findExistingSeriesStatsThreadLocation").mockResolvedValue({
        threadId: "existing-thread-id",
      });
      vi.spyOn(services.discordService, "findBotMessagesInThread").mockResolvedValue([
        {
          ...apiMessage,
          id: "thread-msg-1",
          content: "old bot stats message",
          author: {
            ...apiMessage.author,
            id: env.DISCORD_APP_ID,
          },
        },
        {
          ...apiMessage,
          id: "thread-msg-2",
          content: "another bot stats message",
          author: {
            ...apiMessage.author,
            id: env.DISCORD_APP_ID,
          },
        },
      ]);
      const bulkDeleteMessagesSpy = vi
        .spyOn(services.discordService, "bulkDeleteMessages")
        .mockRejectedValueOnce(new Error("bulk delete failed"));
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue();
      vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
      vi.spyOn(services.haloService, "getPlayerXuidsToGametags").mockResolvedValue(getPlayerXuidsToGametags());

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(bulkDeleteMessagesSpy).toHaveBeenCalledWith(
        "existing-thread-id",
        ["thread-msg-1", "thread-msg-2"],
        "Replacing amended series stats",
      );
      expect(deleteMessageSpy).toHaveBeenCalledTimes(2);
      expect(deleteMessageSpy).toHaveBeenNthCalledWith(
        1,
        "existing-thread-id",
        "thread-msg-1",
        "Replacing amended series stats",
      );
      expect(deleteMessageSpy).toHaveBeenNthCalledWith(
        2,
        "existing-thread-id",
        "thread-msg-2",
        "Replacing amended series stats",
      );
      expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
        embeds: [expect.objectContaining({ description: "Series stats were amended successfully." })],
        components: [],
      });
    });
  });

  describe("execute(): message component fix cancel", () => {
    it("marks flow as cancelled", async () => {
      const interaction: APIMessageComponentButtonInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.Button,
          custom_id: "btn_stats_fix_cancel",
        },
      };

      const { response, jobToComplete } = statsCommand.execute(interaction);
      expect(response).toEqual({ type: InteractionResponseType.DeferredMessageUpdate });

      await jobToComplete?.();

      expect(updateDeferredReplySpy).toHaveBeenCalledWith("fake-token", {
        embeds: [expect.objectContaining({ description: "Cancelled." })],
        components: [],
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

  describe("execute(): message component load games button", () => {
    let loadGamesButtonInteraction: APIMessageComponentButtonInteraction;
    let getMessageSpy: MockInstance<typeof services.discordService.getMessage>;
    let getMessagesSpy: MockInstance<typeof services.discordService.getMessages>;
    let getMatchDetailsSpy: MockInstance<typeof services.haloService.getMatchDetails>;
    let createMessageSpy: MockInstance<typeof services.discordService.createMessage>;
    let deleteMessageSpy: MockInstance<typeof services.discordService.deleteMessage>;
    let mockParentMessage: APIMessage;

    beforeEach(() => {
      mockParentMessage = {
        id: "parent-message-id",
        channel_id: "parent-channel-id",
        author: {
          id: env.DISCORD_APP_ID,
          username: "GuiltySparkBot",
          discriminator: "0",
          avatar: null,
          global_name: null,
          bot: true,
        },
        content: "",
        timestamp: "2024-01-01T00:00:00.000Z",
        edited_timestamp: null,
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [
          {
            title: "Series stats for queue #5 (3-1)",
            description:
              "**Team 1:** <@user1> <@user2>\n**Team 2:** <@user3> <@user4>\n\n-# Start time: <t:1700000000:f> | End time: <t:1700003600:f>",
            url: "https://discord.com/channels/fake-guild-id/parent-channel-id/parent-message-id",
            color: 0x3498db,
            fields: [
              {
                name: "Game",
                value:
                  "[CTF on Bazaar](https://halodatahive.com/Infinite/Match/d81554d7-ddfe-44da-a6cb-000000000ctf)\n[Slayer on Recharge](https://halodatahive.com/Infinite/Match/9535b946-f30c-4a43-b852-000000slayer)",
                inline: true,
              },
              {
                name: "Duration",
                value: "10m 30s\n8m 15s",
                inline: true,
              },
              {
                name: "Score (🦅:🐍)",
                value: "3-1\n50-45",
                inline: true,
              },
            ],
          },
        ],
        pinned: false,
        type: MessageType.Default,
      };

      const loadGamesThreadChannel: APIThreadChannel = {
        id: "thread-channel-id",
        type: ChannelType.PublicThread,
        name: "Queue #5 series stats",
        parent_id: "parent-channel-id",
        owner_id: env.DISCORD_APP_ID,
        message_count: 5,
        member_count: 2,
        thread_metadata: {
          archived: false,
          auto_archive_duration: 60,
          archive_timestamp: "2024-01-01T00:00:00.000Z",
          locked: false,
        },
      };

      loadGamesButtonInteraction = {
        ...fakeButtonClickInteraction,
        channel: loadGamesThreadChannel,
        data: {
          component_type: ComponentType.Button,
          custom_id: "btn_stats_load_games",
        },
      };

      getMessageSpy = vi.spyOn(services.discordService, "getMessage").mockResolvedValue(mockParentMessage);
      getMessagesSpy = vi.spyOn(services.discordService, "getMessages").mockResolvedValue([]);
      getMatchDetailsSpy = vi
        .spyOn(services.haloService, "getMatchDetails")
        .mockResolvedValue([
          Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf")),
          Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer")),
        ]);
      createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
      deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue();
      vi.spyOn(services.haloService, "getPlayerXuidsToGametags").mockResolvedValue(getPlayerXuidsToGametags());
      vi.spyOn(services.databaseService, "getGuildConfig").mockResolvedValue(aFakeGuildConfigRow());
    });

    it("returns DeferredMessageUpdate response for load games button", () => {
      const { response, jobToComplete } = statsCommand.execute(loadGamesButtonInteraction);

      expect(response).toEqual({
        type: InteractionResponseType.DeferredMessageUpdate,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    it("extracts match IDs from a single embed and loads game stats", async () => {
      const { jobToComplete } = statsCommand.execute(loadGamesButtonInteraction);
      await jobToComplete?.();

      expect(getMessageSpy).toHaveBeenCalledWith("parent-channel-id", "thread-channel-id");
      expect(getMatchDetailsSpy).toHaveBeenCalledWith([
        "d81554d7-ddfe-44da-a6cb-000000000ctf",
        "9535b946-f30c-4a43-b852-000000slayer",
      ]);
      expect(createMessageSpy).toHaveBeenCalledTimes(2);
      expect(deleteMessageSpy).toHaveBeenCalledWith(
        "thread-channel-id",
        "fake-message-id",
        "Removing load games buttons",
      );
    });

    it("extracts match IDs from multiple embeds in a single message", async () => {
      const messageWithMultipleEmbeds: APIMessage = {
        ...mockParentMessage,
        embeds: [
          {
            title: "Series stats for queue #5 (3-1)",
            color: 0x3498db,
            fields: [
              {
                name: "Game",
                value: "[CTF on Bazaar](https://halodatahive.com/Infinite/Match/d81554d7-ddfe-44da-a6cb-000000000ctf)",
                inline: true,
              },
              { name: "Duration", value: "10m 30s", inline: true },
              { name: "Score (🦅:🐍)", value: "3-1", inline: true },
            ],
          },
          {
            color: 0x3498db,
            fields: [
              {
                name: "Game",
                value:
                  "[Slayer on Recharge](https://halodatahive.com/Infinite/Match/9535b946-f30c-4a43-b852-000000slayer)",
                inline: true,
              },
              { name: "Duration", value: "8m 15s", inline: true },
              { name: "Score (🦅:🐍)", value: "50-45", inline: true },
            ],
          },
        ],
      };

      getMessageSpy.mockResolvedValue(messageWithMultipleEmbeds);

      const { jobToComplete } = statsCommand.execute(loadGamesButtonInteraction);
      await jobToComplete?.();

      expect(getMatchDetailsSpy).toHaveBeenCalledWith([
        "d81554d7-ddfe-44da-a6cb-000000000ctf",
        "9535b946-f30c-4a43-b852-000000slayer",
      ]);
      expect(createMessageSpy).toHaveBeenCalledTimes(2);
    });

    it("handles NeatQueue bot scenario by collecting embeds from thread messages", async () => {
      const neatQueueParentMessage: APIMessage = {
        ...mockParentMessage,
        author: {
          id: "857633321064595466", // NEAT_QUEUE_BOT_USER_ID
          username: "NeatQueue",
          discriminator: "0",
          avatar: null,
          global_name: null,
          bot: true,
        },
      };

      const threadMessagesWithMultipleEmbeds: APIMessage[] = [
        {
          ...apiMessage,
          id: "thread-message-1",
          author: {
            id: env.DISCORD_APP_ID,
            username: "GuiltySparkBot",
            discriminator: "0",
            avatar: null,
            global_name: null,
            bot: true,
          },
          embeds: [
            {
              type: EmbedType.Rich,
              title: "Series stats for queue #5 (3-1)",
              color: 0x3498db,
              fields: [
                {
                  name: "Game",
                  value:
                    "[CTF on Bazaar](https://halodatahive.com/Infinite/Match/d81554d7-ddfe-44da-a6cb-000000000ctf)",
                  inline: true,
                },
              ],
            },
          ],
        },
        {
          ...apiMessage,
          id: "thread-message-2",
          author: {
            id: env.DISCORD_APP_ID,
            username: "GuiltySparkBot",
            discriminator: "0",
            avatar: null,
            global_name: null,
            bot: true,
          },
          embeds: [
            {
              type: EmbedType.Rich,
              color: 0x3498db,
              fields: [
                {
                  name: "Game",
                  value:
                    "[Slayer on Recharge](https://halodatahive.com/Infinite/Match/9535b946-f30c-4a43-b852-000000slayer)",
                  inline: true,
                },
              ],
            },
          ],
        },
      ];

      getMessageSpy.mockResolvedValue(neatQueueParentMessage);
      getMessagesSpy.mockResolvedValue(threadMessagesWithMultipleEmbeds);

      const { jobToComplete } = statsCommand.execute(loadGamesButtonInteraction);
      await jobToComplete?.();

      expect(getMessagesSpy).toHaveBeenCalledWith("thread-channel-id");
      expect(updateDeferredReplyWithErrorSpy).not.toHaveBeenCalled();
      expect(getMatchDetailsSpy).toHaveBeenCalledWith([
        "d81554d7-ddfe-44da-a6cb-000000000ctf",
        "9535b946-f30c-4a43-b852-000000slayer",
      ]);
    });

    it("handles error when no embeds are found", async () => {
      const messageWithoutEmbeds: APIMessage = {
        ...mockParentMessage,
        embeds: [],
      };

      getMessageSpy.mockResolvedValue(messageWithoutEmbeds);

      const { jobToComplete } = statsCommand.execute(loadGamesButtonInteraction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "No series stats embeds found",
        }),
      );
    });

    it("handles error when no game data fields are found", async () => {
      const messageWithoutGameData: APIMessage = {
        ...mockParentMessage,
        embeds: [
          {
            title: "Series stats for queue #5",
            color: 0x3498db,
            fields: [
              { name: "Duration", value: "10m 30s", inline: true },
              { name: "Score", value: "3-1", inline: true },
            ],
          },
        ],
      };

      getMessageSpy.mockResolvedValue(messageWithoutGameData);

      const { jobToComplete } = statsCommand.execute(loadGamesButtonInteraction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledOnce();
      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "Missing games data",
        }),
      );
      expect(getMatchDetailsSpy).not.toHaveBeenCalled();
      expect(createMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe("execute(): subcommand player", () => {
    beforeEach(() => {
      vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
        name: "player",
        mappedOptions: new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>(),
        options: [],
      });
    });

    it("returns a clear error when the guild has no configured NeatQueue channels", async () => {
      vi.spyOn(services.databaseService, "findNeatQueueConfig").mockResolvedValue([]);

      const { jobToComplete } = statsCommand.execute(applicationCommandInteractionStatsNeatQueue);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          message: "This server has no configured NeatQueue channels. Set one up before using this command.",
        }),
      );
    });
  });

  describe("execute(): message component player stats select", () => {
    it("renders the selected relationship view with pair eligibility context", async () => {
      const playerStats = aFakeLeaderboardPlayerStatsRow();
      vi.spyOn(services.leaderboardService, "getLeaderboardPlayerRelationships").mockResolvedValue({
        stats: playerStats,
        rows: [
          {
            XboxXuid: "2533274000000002",
            DiscordUserId: "discord-user-2",
            Gamertag: "teammate01",
            MetricValue: 0.75,
            SharedCount: 4,
            Wins: 3,
            Perfects: 0,
          },
        ],
        window: LeaderboardWindow.ThreeMonths,
        resetAt: null,
        metric: LeaderboardPlayerRelationshipMetric.SeriesWinRateWith,
      });
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
          values: [LeaderboardPlayerRelationshipMetric.SeriesWinRateWith],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
                  options: [{ label: "Total", value: LeaderboardMetricAggregation.Total, default: true }],
                },
              ],
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
                  options: [{ label: "3 months", value: LeaderboardWindow.ThreeMonths, default: true }],
                },
              ],
            },
          ],
          embeds: [{ url: "https://guilty-spark.app/stats/player/2533274000000001" }],
        },
      };

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).not.toHaveBeenCalled();
      const response = updateDeferredReplySpy.mock.calls[0]?.[1];
      const [embed] = response?.embeds ?? [];
      expect(embed?.title).toBe("gamertag01 - Highest series win rate with");
      expect(embed?.footer).toEqual({ text: "Min shared series: 3" });
      expect(embed?.fields).toContainEqual({ name: "Player", value: "teammate01", inline: true });
      expect(embed?.fields).toContainEqual({ name: "Rank", value: "🥇", inline: true });
      expect(embed?.fields).toContainEqual({ name: "Value", value: "75% (3/4 shared series)", inline: true });
    });

    it("shows an empty state when no games were played in the selected window", async () => {
      const interaction: APIMessageComponentSelectMenuInteraction = {
        ...fakeButtonClickInteraction,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
          values: [LeaderboardWindow.ThreeMonths],
        },
        message: {
          ...fakeButtonClickInteraction.message,
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
                  options: [{ label: "Total", value: LeaderboardMetricAggregation.Total, default: true }],
                },
              ],
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
                  options: [{ label: "1 month", value: LeaderboardWindow.OneMonth, default: true }],
                },
              ],
            },
          ],
          embeds: [
            {
              footer: { text: "Min games: 5 | Total players: 10" },
              url: "https://guilty-spark.app/stats/player/2533274000000001",
            },
          ],
        },
      };

      const { jobToComplete } = statsCommand.execute(interaction);
      await jobToComplete?.();

      expect(updateDeferredReplyWithErrorSpy).not.toHaveBeenCalled();
      expect(updateDeferredReplySpy).toHaveBeenCalledWith(
        "fake-token",
        expect.objectContaining({
          embeds: [
            expect.objectContaining({
              description: "No games played in 3M for the selected queue scope.",
              footer: { text: "No games played" },
            }),
          ],
        }),
      );
    });
  });
});
