import type { MockInstance } from "vitest";
import { describe, beforeEach, it, expect, vi, afterEach } from "vitest";
import type { APIChannel } from "discord-api-types/v10";
import { ChannelType } from "discord-api-types/v10";
import { sub } from "date-fns";
import { NeatQueueService } from "../neatqueue.mjs";
import type { DatabaseService } from "../../database/database.mjs";
import {
  aFakeDatabaseServiceWith,
  aFakeGuildConfigRow,
  aFakeNeatQueueConfigRow,
} from "../../database/fakes/database.fake.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import type { LogService } from "../../log/types.mjs";
import type { DiscordService } from "../../discord/discord.mjs";
import type { HaloService } from "../../halo/halo.mjs";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { NeatQueueConfigRow } from "../../database/types/neat_queue_config.mjs";
import { NeatQueuePostSeriesDisplayMode } from "../../database/types/neat_queue_config.mjs";
import { getFakeNeatQueueData } from "../fakes/data.mjs";
import type { NeatQueueMatchCompletedRequest, NeatQueueRequest } from "../types.mjs";
import { matchStats } from "../../halo/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { apiMessage, discordNeatQueueData } from "../../discord/fakes/data.mjs";
import { EndUserError } from "../../../base/end-user-error.mjs";
import { StatsReturnType } from "../../database/types/guild_config.mjs";

const startThread: APIChannel = {
  type: ChannelType.PublicThread,
  id: "thread-id",
  name: "Match Completed",
  applied_tags: [],
  position: 0,
};

describe("NeatQueueService", () => {
  const now = new Date("2025-01-01T00:00:00.000000+00:00").getTime();
  let env: Env;
  let logService: LogService;
  let databaseService: DatabaseService;
  let discordService: DiscordService;
  let haloService: HaloService;
  let neatQueueService: NeatQueueService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    env = aFakeEnvWith();
    logService = aFakeLogServiceWith();
    databaseService = aFakeDatabaseServiceWith();
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    neatQueueService = new NeatQueueService({
      env,
      logService,
      databaseService,
      discordService,
      haloService,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("hashAuthorizationKey", () => {
    it("hashes the authorization key", () => {
      const key = "testKey";
      const guildId = "testGuildId";
      const hashedKey = neatQueueService.hashAuthorizationKey(key, guildId);
      expect(hashedKey).toMatchInlineSnapshot(`"efc1e2914df1e04a9ede085bdff142fd3978a5698ae3dfb8fdee8c3090d24b3a"`);
    });
  });

  describe("verifyRequest", () => {
    let request: Request;

    beforeEach(() => {
      request = new Request("https://example.com", {
        method: "POST",
        headers: new Headers({ authorization: "Bearer test" }),
        body: JSON.stringify({ type: "neatqueue", guild: "guild-1", channel: "channel-1" }),
      });
    });

    it("returns isValid: true and includes interaction and config when valid", async () => {
      const fakeConfig = aFakeNeatQueueConfigRow({
        GuildId: "guild-1",
        ChannelId: "channel-1",
        WebhookSecret: "hashed-secret",
      });
      const findConfigSpy = vi.spyOn(databaseService, "findNeatQueueConfig").mockResolvedValue([fakeConfig]);
      vi.spyOn(neatQueueService, "hashAuthorizationKey").mockReturnValue("hashed-secret");

      const result = await neatQueueService.verifyRequest(request);

      expect(findConfigSpy).toHaveBeenCalledWith({ GuildId: "guild-1", WebhookSecret: "hashed-secret" });
      expect(result).toEqual({
        isValid: true,
        interaction: { type: "neatqueue", guild: "guild-1", channel: "channel-1" },
        neatQueueConfig: fakeConfig,
      });
    });

    it("returns isValid: false and error when Authorization header is missing", async () => {
      request.headers.delete("authorization");

      const result = await neatQueueService.verifyRequest(request);

      expect(result).toEqual({ isValid: false, error: "Missing Authorization header" });
    });

    it("returns isValid: false and error when request body is invalid JSON", async () => {
      request = new Request("https://example.com", {
        method: "POST",
        headers: new Headers({ authorization: "Bearer test" }),
        body: "not-json",
      });

      const result = await neatQueueService.verifyRequest(request);

      expect(result).toEqual({ isValid: false, error: "Invalid JSON" });
    });

    it("returns isValid: false when config is not found", async () => {
      vi.spyOn(databaseService, "findNeatQueueConfig").mockResolvedValue([]);

      const result = await neatQueueService.verifyRequest(request);

      expect(result).toEqual({ isValid: false });
    });
  });

  describe("handleRequest", () => {
    let neatQueueConfig: NeatQueueConfigRow;

    beforeEach(() => {
      neatQueueConfig = aFakeNeatQueueConfigRow();
    });

    describe.each([
      ["JOIN_QUEUE", getFakeNeatQueueData("joinQueue")],
      ["LEAVE_QUEUE", getFakeNeatQueueData("leaveQueue")],
      ["MATCH_CANCELLED", getFakeNeatQueueData("matchCancelled")],
    ] as const)("acknowledges: %s", (_action, request) => {
      it("returns OK response and no jobToComplete", () => {
        const { response, jobToComplete } = neatQueueService.handleRequest(request, neatQueueConfig);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(200);
        expect(jobToComplete).toBeUndefined();
      });
    });

    describe.each([
      ["MATCH_STARTED", getFakeNeatQueueData("matchStarted")],
      ["TEAMS_CREATED", getFakeNeatQueueData("teamsCreated")],
      ["SUBSTITUTION", getFakeNeatQueueData("substitution")],
    ])("timeline-extending actions: %s", (_action, request) => {
      it("returns OK response and jobToComplete that extends timeline", async () => {
        const appDataPutSpy = vi.spyOn(env.APP_DATA, "put").mockResolvedValue();
        const appDataGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
        appDataGetSpy.mockResolvedValueOnce([]);

        const { response, jobToComplete } = neatQueueService.handleRequest(request, neatQueueConfig);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(200);
        expect(jobToComplete).toBeInstanceOf(Function);

        await jobToComplete?.();

        expect(appDataGetSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: "json" }));
        expect(appDataPutSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringContaining(request.action),
          expect.objectContaining({ expirationTtl: 60 * 60 * 24 }),
        );
      });
    });

    describe("MATCH_COMPLETED", () => {
      let appDataGetSpy: MockInstance;
      let appDataDeleteSpy: MockInstance;
      let getTeamsFromQueueSpy: MockInstance<typeof discordService.getTeamsFromQueue>;
      let haloServiceGetSeriesFromDiscordQueueSpy: MockInstance<typeof haloService.getSeriesFromDiscordQueue>;
      let haloServiceUpdateDiscordAssociationsSpy: MockInstance<typeof haloService.updateDiscordAssociations>;
      let discordServiceStartThreadFromMessageSpy: MockInstance<typeof discordService.startThreadFromMessage>;
      let discordServiceCreateMessageSpy: MockInstance<typeof discordService.createMessage>;

      beforeEach(() => {
        appDataGetSpy = vi.spyOn(env.APP_DATA, "get");
        appDataGetSpy.mockResolvedValue([
          {
            timestamp: sub(new Date(), { minutes: 10 }).toISOString(),
            event: getFakeNeatQueueData("teamsCreated"),
          },
        ]);
        appDataDeleteSpy = vi.spyOn(env.APP_DATA, "delete").mockResolvedValue();

        const [match1, match2] = Array.from(matchStats.values());
        haloServiceGetSeriesFromDiscordQueueSpy = vi
          .spyOn(haloService, "getSeriesFromDiscordQueue")
          .mockResolvedValue([Preconditions.checkExists(match1), Preconditions.checkExists(match2)]);
        haloServiceUpdateDiscordAssociationsSpy = vi
          .spyOn(haloService, "updateDiscordAssociations")
          .mockResolvedValue();

        getTeamsFromQueueSpy = vi.spyOn(discordService, "getTeamsFromQueue").mockResolvedValue(discordNeatQueueData);
        discordServiceStartThreadFromMessageSpy = vi
          .spyOn(discordService, "startThreadFromMessage")
          .mockResolvedValue(startThread);
        discordServiceCreateMessageSpy = vi.spyOn(discordService, "createMessage").mockResolvedValue(apiMessage);
        vi.spyOn(discordService, "getUsers").mockResolvedValue([
          {
            id: "000000000000000001",
            username: "soundmanD",
            global_name: "soundmanD",
            discriminator: "0001",
            avatar: "avatar1",
          },
          {
            id: "000000000000000002",
            username: "discord_user_02",
            global_name: "discord_user_02",
            discriminator: "0002",
            avatar: "avatar2",
          },
          {
            id: "000000000000000003",
            username: "discord_user_03",
            global_name: "discord_user_03",
            discriminator: "0003",
            avatar: "avatar3",
          },
        ]);
      });

      it("returns OK response and jobToComplete", () => {
        const { response, jobToComplete } = neatQueueService.handleRequest(
          getFakeNeatQueueData("matchCompleted"),
          neatQueueConfig,
        );
        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(200);
        expect(jobToComplete).toBeInstanceOf(Function);
      });

      it("handles no winning team event", async () => {
        const noWinningTeamData: NeatQueueMatchCompletedRequest = {
          ...getFakeNeatQueueData("matchCompleted"),
          winning_team_index: -1,
        };
        const { response, jobToComplete } = neatQueueService.handleRequest(noWinningTeamData, neatQueueConfig);
        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(200);

        await jobToComplete?.();

        expect(appDataDeleteSpy).toHaveBeenCalledWith("neatqueue:guild-1:channel-1:1299532381308325949");
      });

      it("discard neatqueue events that are not of concern", async () => {
        const matchCompletedTimes = new Date();
        const eventTimeline = [
          {
            timestamp: sub(matchCompletedTimes, { hours: 1, minutes: 5 }).toISOString(),
            event: getFakeNeatQueueData("joinQueue"),
          },
          {
            timestamp: sub(matchCompletedTimes, { hours: 1, minutes: 4 }).toISOString(),
            event: getFakeNeatQueueData("leaveQueue"),
          },
          {
            timestamp: sub(matchCompletedTimes, { hours: 1, minutes: 3 }).toISOString(),
            event: getFakeNeatQueueData("matchStarted"),
          },
          {
            timestamp: sub(matchCompletedTimes, { hours: 1 }).toISOString(),
            event: getFakeNeatQueueData("teamsCreated"),
          },
        ];
        appDataGetSpy.mockReset().mockResolvedValue(eventTimeline);

        const { response, jobToComplete } = neatQueueService.handleRequest(
          getFakeNeatQueueData("matchCompleted"),
          neatQueueConfig,
        );
        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(200);

        await expect(jobToComplete?.()).resolves.toBeUndefined();
      });

      it("discards substitution event if it was before teams created", async () => {
        const matchCompletedTimes = new Date();
        const eventTimeline = [
          {
            timestamp: sub(matchCompletedTimes, { hours: 1, minutes: 5 }).toISOString(),
            event: getFakeNeatQueueData("joinQueue"),
          },
          {
            timestamp: sub(matchCompletedTimes, { hours: 1, minutes: 4 }).toISOString(),
            event: getFakeNeatQueueData("leaveQueue"),
          },
          {
            timestamp: sub(matchCompletedTimes, { hours: 1, minutes: 3 }).toISOString(),
            event: getFakeNeatQueueData("substitution"),
          },
          {
            timestamp: sub(matchCompletedTimes, { hours: 1, minutes: 3 }).toISOString(),
            event: getFakeNeatQueueData("matchStarted"),
          },
          {
            timestamp: sub(matchCompletedTimes, { hours: 1 }).toISOString(),
            event: getFakeNeatQueueData("teamsCreated"),
          },
        ];
        appDataGetSpy.mockReset().mockResolvedValue(eventTimeline);
        const { response, jobToComplete } = neatQueueService.handleRequest(
          getFakeNeatQueueData("matchCompleted"),
          neatQueueConfig,
        );
        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(200);
        await expect(jobToComplete?.()).resolves.toBeUndefined();

        expect(haloServiceGetSeriesFromDiscordQueueSpy).toHaveBeenCalledWith({
          endDateTime: new Date("2025-01-01T00:00:00.000Z"),
          startDateTime: new Date("2024-12-31T23:00:00.000Z"),
          teams: [
            [
              {
                globalName: "soundmanD",
                id: "000000000000000001",
                username: "soundmanD",
              },
            ],
            [
              {
                globalName: "discord_user_02",
                id: "000000000000000002",
                username: "discord_user_02",
              },
            ],
          ],
        });
      });

      describe.each([
        {
          mode: NeatQueuePostSeriesDisplayMode.THREAD,
          modeName: "THREAD",
          channelId: "1299532381308325949",
          messageId: "1310523001611096064",
        },
        {
          mode: NeatQueuePostSeriesDisplayMode.MESSAGE,
          modeName: "MESSAGE",
          channelId: "results-channel-1",
          messageId: "1314562775950954626",
        },
        {
          mode: NeatQueuePostSeriesDisplayMode.CHANNEL,
          modeName: "CHANNEL",
          channelId: "other-channel-id",
          messageId: "1314562775950954626",
        },
      ])("NeatQueueConfig.PostSeriesMode = $modeName", ({ mode, channelId, messageId }) => {
        beforeEach(() => {
          neatQueueConfig.PostSeriesMode = mode;
          if (mode === NeatQueuePostSeriesDisplayMode.CHANNEL) {
            neatQueueConfig.PostSeriesChannelId = channelId;
          }
        });

        it("calls haloService.getSeriesFromDiscordQueue with expected parameters", async () => {
          const { jobToComplete } = neatQueueService.handleRequest(
            getFakeNeatQueueData("matchCompleted"),
            neatQueueConfig,
          );
          await jobToComplete?.();

          expect(haloServiceGetSeriesFromDiscordQueueSpy).toHaveBeenCalledWith({
            endDateTime: new Date("2025-01-01T00:00:00.000Z"),
            startDateTime: new Date("2024-12-31T23:50:00.000Z"),
            teams: [
              [
                {
                  globalName: "soundmanD",
                  id: "000000000000000001",
                  username: "soundmanD",
                },
              ],
              [
                {
                  globalName: "discord_user_02",
                  id: "000000000000000002",
                  username: "discord_user_02",
                },
              ],
            ],
          });
        });

        it("creates the thread/message and posts overviews, clears timeline", async () => {
          const { jobToComplete } = neatQueueService.handleRequest(
            getFakeNeatQueueData("matchCompleted"),
            neatQueueConfig,
          );

          await jobToComplete?.();

          expect(discordServiceStartThreadFromMessageSpy).toHaveBeenCalledWith(
            channelId,
            messageId,
            `Queue #2 series stats`,
          );

          expect(discordServiceCreateMessageSpy).toHaveBeenCalledTimes(5);
          expect(discordServiceCreateMessageSpy.mock.calls).toMatchSnapshot();
          expect(appDataDeleteSpy).toHaveBeenCalledWith("neatqueue:guild-1:channel-1:1299532381308325949");
        });

        it("creates the thread/message and posts overviews and game stats, clears timeline", async () => {
          vi.spyOn(databaseService, "getGuildConfig").mockResolvedValue(
            aFakeGuildConfigRow({
              StatsReturn: StatsReturnType.SERIES_AND_GAMES,
            }),
          );

          const { jobToComplete } = neatQueueService.handleRequest(
            getFakeNeatQueueData("matchCompleted"),
            neatQueueConfig,
          );

          await jobToComplete?.();

          expect(discordServiceStartThreadFromMessageSpy).toHaveBeenCalledWith(
            channelId,
            messageId,
            `Queue #2 series stats`,
          );

          expect(discordServiceCreateMessageSpy).toHaveBeenCalledTimes(6);
          expect(discordServiceCreateMessageSpy.mock.calls).toMatchSnapshot();
          expect(appDataDeleteSpy).toHaveBeenCalledWith("neatqueue:guild-1:channel-1:1299532381308325949");
        });

        it("calls haloService.updateDiscordAssociations with expected parameters", async () => {
          const { jobToComplete } = neatQueueService.handleRequest(
            getFakeNeatQueueData("matchCompleted"),
            neatQueueConfig,
          );
          await jobToComplete?.();
          expect(haloServiceUpdateDiscordAssociationsSpy).toHaveBeenCalled();
        });

        it("handles missing results message", async () => {
          const logSpy =
            mode === NeatQueuePostSeriesDisplayMode.THREAD
              ? vi.spyOn(logService, "warn")
              : vi.spyOn(logService, "error");

          getTeamsFromQueueSpy.mockReset().mockResolvedValue(null);

          const { jobToComplete } = neatQueueService.handleRequest(
            getFakeNeatQueueData("matchCompleted"),
            neatQueueConfig,
          );

          await jobToComplete?.();

          if (mode === NeatQueuePostSeriesDisplayMode.THREAD) {
            expect(logSpy).toHaveBeenCalledExactlyOnceWith(
              new EndUserError("Failed to find the results message", { handled: true }),
              new Map([["reason", "Failed to post series data to thread"]]),
            );
            expect(discordServiceStartThreadFromMessageSpy).not.toHaveBeenCalled();
            expect(discordServiceCreateMessageSpy).not.toHaveBeenCalled();
          } else {
            expect(logSpy).toHaveBeenCalledExactlyOnceWith(
              new EndUserError("Failed to find the results message", {
                data: {
                  Channel: `<#results-channel-1>`,
                  Completed: "<t:1735689600:f>",
                  Queue: "2",
                },
              }),
              new Map([["reason", "Failed to post series data direct to channel"]]),
            );
            expect(discordServiceStartThreadFromMessageSpy).not.toHaveBeenCalled();
            expect(discordServiceCreateMessageSpy).toHaveBeenCalledOnce();
            expect(discordServiceCreateMessageSpy.mock.calls[0]).toMatchSnapshot();
            expect(appDataDeleteSpy).toHaveBeenCalledWith("neatqueue:guild-1:channel-1:1299532381308325949");
          }
        });

        it("handles corrupted timeline data by leveraging broader 6h approach", async () => {
          appDataGetSpy.mockReset().mockRejectedValue(new Error("Corrupted timeline data"));
          const logServiceInfoSpy = vi.spyOn(logService, "info");

          const { jobToComplete } = neatQueueService.handleRequest(
            getFakeNeatQueueData("matchCompleted"),
            neatQueueConfig,
          );

          await jobToComplete?.();

          expect(logServiceInfoSpy).toHaveBeenCalledOnce();
          expect(discordServiceStartThreadFromMessageSpy).toHaveBeenCalledWith(
            channelId,
            messageId,
            `Queue #2 series stats`,
          );
          expect(discordServiceCreateMessageSpy).toHaveBeenCalledTimes(5);
        });

        it("handles failure to clear timeline data (high level error handling)", async () => {
          const noWinningTeamData: NeatQueueMatchCompletedRequest = {
            ...getFakeNeatQueueData("matchCompleted"),
            winning_team_index: -1,
          };
          appDataDeleteSpy.mockReset().mockRejectedValueOnce(new Error("Failed to delete timeline data"));

          const { jobToComplete } = neatQueueService.handleRequest(noWinningTeamData, neatQueueConfig);

          await jobToComplete?.();

          if (mode === NeatQueuePostSeriesDisplayMode.THREAD) {
            expect(discordServiceStartThreadFromMessageSpy).toHaveBeenCalledWith(
              channelId,
              messageId,
              `Queue #2 series stats`,
            );
          }

          expect(discordServiceCreateMessageSpy).toHaveBeenCalledTimes(1);
          expect(discordServiceCreateMessageSpy.mock.calls[0]).toMatchSnapshot();
        });

        it("handles substitution event by merging match data and displaying all players data", async () => {
          const matchCompletedTimes = new Date();
          const eventTimeline = [
            {
              timestamp: sub(matchCompletedTimes, { hours: 1, minutes: 15 }).toISOString(),
              event: getFakeNeatQueueData("teamsCreated"),
            },
            {
              timestamp: sub(matchCompletedTimes, { hours: 1 }).toISOString(),
              event: getFakeNeatQueueData("substitution"),
            },
          ];
          appDataGetSpy.mockReset().mockResolvedValue(eventTimeline);

          haloServiceGetSeriesFromDiscordQueueSpy.mockReset();
          haloServiceGetSeriesFromDiscordQueueSpy.mockImplementation(async (queueData) => {
            if (queueData.startDateTime.getTime() === new Date("2024-12-31T22:45:00.000Z").getTime()) {
              return Promise.resolve([
                Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")),
              ]);
            }
            return Promise.resolve([Preconditions.checkExists(matchStats.get("cf0fb794-2df1-4ba1-9415-00000oddball"))]);
          });

          const { jobToComplete } = neatQueueService.handleRequest(
            getFakeNeatQueueData("matchCompleted"),
            neatQueueConfig,
          );
          await jobToComplete?.();

          expect(haloServiceGetSeriesFromDiscordQueueSpy).toHaveBeenCalledTimes(2);
          expect(haloServiceGetSeriesFromDiscordQueueSpy).toHaveBeenNthCalledWith(1, {
            startDateTime: new Date("2024-12-31T22:45:00.000Z"),
            endDateTime: new Date("2024-12-31T23:00:00.000Z"),
            teams: [
              [
                {
                  globalName: "soundmanD",
                  id: "000000000000000001",
                  username: "soundmanD",
                },
              ],
              [
                {
                  globalName: "discord_user_02",
                  id: "000000000000000002",
                  username: "discord_user_02",
                },
              ],
            ],
          });
          expect(haloServiceGetSeriesFromDiscordQueueSpy).toHaveBeenNthCalledWith(2, {
            endDateTime: new Date("2025-01-01T00:00:00.000Z"),
            startDateTime: new Date("2024-12-31T23:00:00.000Z"),
            teams: [
              [
                {
                  globalName: "discord_user_03",
                  id: "000000000000000003",
                  username: "discord_user_03",
                },
              ],
              [
                {
                  globalName: "discord_user_02",
                  id: "000000000000000002",
                  username: "discord_user_02",
                },
              ],
            ],
          });

          expect(discordServiceStartThreadFromMessageSpy).toHaveBeenCalledWith(
            channelId,
            messageId,
            `Queue #2 series stats`,
          );

          expect(discordServiceCreateMessageSpy).toHaveBeenCalledTimes(5);
          expect(discordServiceCreateMessageSpy.mock.calls).toMatchSnapshot();
        });

        if (mode === NeatQueuePostSeriesDisplayMode.THREAD) {
          it("falls back to creating a message in post series channel if it fails to create thread", async () => {
            const error = new Error("Failed to create thread");
            const logServiceWarnSpy = vi.spyOn(logService, "warn");

            discordServiceStartThreadFromMessageSpy
              .mockReset()
              .mockRejectedValueOnce(error)
              .mockResolvedValueOnce({
                ...startThread,
                id: "thread-id-2",
              });

            const { jobToComplete } = neatQueueService.handleRequest(
              getFakeNeatQueueData("matchCompleted"),
              neatQueueConfig,
            );

            await jobToComplete?.();

            expect(logServiceWarnSpy).toHaveBeenCalledExactlyOnceWith(
              error,
              new Map([["reason", "Failed to post series data to thread"]]),
            );

            expect(discordServiceStartThreadFromMessageSpy).toHaveBeenCalledTimes(2);
            expect(discordServiceCreateMessageSpy).toHaveBeenCalledTimes(5);
            expect(discordServiceCreateMessageSpy.mock.calls[0]).toMatchSnapshot();
            expect(discordServiceCreateMessageSpy).toHaveBeenNthCalledWith(2, "thread-id-2", expect.any(Object));
            expect(discordServiceCreateMessageSpy).toHaveBeenNthCalledWith(3, "thread-id-2", expect.any(Object));
          });
        }
      });
    });

    it("returns OK response for unknown action", () => {
      const unknownRequest = {
        ...getFakeNeatQueueData("joinQueue"),
        action: "UNKNOWN_ACTION",
      } as unknown as NeatQueueRequest;
      const { response, jobToComplete } = neatQueueService.handleRequest(unknownRequest, neatQueueConfig);

      expect(response).toBeInstanceOf(Response);
      expect(jobToComplete).toBeUndefined();
    });
  });
});
