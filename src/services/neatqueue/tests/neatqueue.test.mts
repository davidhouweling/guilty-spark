import type { MockInstance } from "vitest";
import { describe, beforeEach, it, expect, vi, afterEach } from "vitest";
import type { APIChannel, APIMessage } from "discord-api-types/v10";
import { ChannelType } from "discord-api-types/v10";
import { sub } from "date-fns";
import { NeatQueueService } from "../neatqueue.mjs";
import type { DatabaseService } from "../../database/database.mjs";
import {
  aFakeDatabaseServiceWith,
  aFakeDiscordAssociationsRow,
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
import { getRankedArenaCsrsData, matchStats } from "../../halo/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import {
  aGuildMemberWith,
  apiMessage,
  discordNeatQueueData,
  guild,
  guildMember,
  textChannel,
} from "../../discord/fakes/data.mjs";
import { EndUserError } from "../../../base/end-user-error.mjs";
import { StatsReturnType, MapsPostType } from "../../database/types/guild_config.mjs";
import { DiscordError } from "../../discord/discord-error.mjs";

const startThread: APIChannel = {
  type: ChannelType.PublicThread,
  id: "thread-id",
  name: "Match Completed",
  applied_tags: [],
};

describe("NeatQueueService", () => {
  // align this with time just after ctf.json match completed
  const now = new Date("2024-11-26T10:48:00.000Z").getTime();
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
        rawBody: '{"type":"neatqueue","guild":"guild-1","channel":"channel-1"}',
        neatQueueConfig: fakeConfig,
      });
    });

    it("returns isValid: false and error when Authorization header is missing", async () => {
      request.headers.delete("authorization");

      const result = await neatQueueService.verifyRequest(request);

      expect(result).toEqual({
        isValid: false,
        rawBody: '{"type":"neatqueue","guild":"guild-1","channel":"channel-1"}',
        error: "Missing Authorization header",
      });
    });

    it("returns isValid: false and error when request body is invalid JSON", async () => {
      request = new Request("https://example.com", {
        method: "POST",
        headers: new Headers({ authorization: "Bearer test" }),
        body: "not-json",
      });

      const result = await neatQueueService.verifyRequest(request);

      expect(result).toEqual({ isValid: false, rawBody: "not-json", error: "Invalid JSON" });
    });

    it("returns isValid: false when config is not found", async () => {
      vi.spyOn(databaseService, "findNeatQueueConfig").mockResolvedValue([]);

      const result = await neatQueueService.verifyRequest(request);

      expect(result).toEqual({
        isValid: false,
        rawBody: '{"type":"neatqueue","guild":"guild-1","channel":"channel-1"}',
      });
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

    describe("MATCH_STARTED", () => {
      let discordAssociationsSpy: MockInstance<typeof databaseService.getDiscordAssociations>;
      let guildIdSpy: MockInstance<typeof discordService.getGuild>;
      let getChannelSpy: MockInstance<typeof discordService.getChannel>;
      let getGuildMemberSpy: MockInstance<typeof discordService.getGuildMember>;
      let hasPermissionsSpy: MockInstance<typeof discordService.hasPermissions>;
      let createMessageSpy: MockInstance<typeof discordService.createMessage>;
      let getRankedArenaCsrsSpy: MockInstance<typeof haloService.getRankedArenaCsrs>;
      let getGuildConfigSpy: MockInstance<typeof databaseService.getGuildConfig>;
      let updateGuildConfigSpy: MockInstance<typeof databaseService.updateGuildConfig>;
      let warnSpy: MockInstance<typeof logService.warn>;
      let jobToComplete: () => Promise<void>;

      beforeEach(() => {
        discordAssociationsSpy = vi
          .spyOn(databaseService, "getDiscordAssociations")
          .mockResolvedValue([aFakeDiscordAssociationsRow()]);
        guildIdSpy = vi.spyOn(discordService, "getGuild").mockResolvedValue(guild);
        getChannelSpy = vi.spyOn(discordService, "getChannel").mockResolvedValue(textChannel);
        getGuildMemberSpy = vi.spyOn(discordService, "getGuildMember").mockResolvedValue(guildMember);
        hasPermissionsSpy = vi.spyOn(discordService, "hasPermissions").mockReturnValue({ hasAll: true, missing: [] });
        createMessageSpy = vi.spyOn(discordService, "createMessage").mockResolvedValue(apiMessage);
        getRankedArenaCsrsSpy = vi.spyOn(haloService, "getRankedArenaCsrs").mockResolvedValue(getRankedArenaCsrsData);
        getGuildConfigSpy = vi
          .spyOn(databaseService, "getGuildConfig")
          .mockResolvedValue(aFakeGuildConfigRow({ NeatQueueInformerPlayerConnections: "Y" }));
        updateGuildConfigSpy = vi.spyOn(databaseService, "updateGuildConfig").mockResolvedValue();
        warnSpy = vi.spyOn(logService, "warn");

        const request = getFakeNeatQueueData("matchStarted");
        jobToComplete = Preconditions.checkExists(
          neatQueueService.handleRequest(request, neatQueueConfig).jobToComplete,
        );
      });

      it("creates a message if permissions are present", async () => {
        await jobToComplete();

        expect(discordAssociationsSpy).toHaveBeenCalledOnce();
        expect(discordAssociationsSpy).toHaveBeenCalledWith(["discord_user_02", "discord_user_01"]);
        expect(guildIdSpy).toHaveBeenCalledOnce();
        expect(guildIdSpy).toHaveBeenCalledWith("guild-id");
        expect(getChannelSpy).toHaveBeenCalledOnce();
        expect(getChannelSpy).toHaveBeenCalledWith("1299532381308325949");
        expect(getGuildMemberSpy).toHaveBeenCalledOnce();
        expect(getGuildMemberSpy).toHaveBeenCalledWith("guild-id", "DISCORD_APP_ID");
        expect(createMessageSpy).toHaveBeenCalledOnce();
        expect(createMessageSpy.mock.calls[0]).toMatchInlineSnapshot(`
          [
            "1299532381308325949",
            {
              "components": [
                {
                  "components": [
                    {
                      "custom_id": "btn_connect_initiate",
                      "emoji": {
                        "name": "🔗",
                      },
                      "label": "Connect my Halo account",
                      "style": 1,
                      "type": 2,
                    },
                    {
                      "custom_id": "btn_maps_initiate",
                      "emoji": {
                        "name": "🗺️",
                      },
                      "label": "Generate maps",
                      "style": 2,
                      "type": 2,
                    },
                  ],
                  "type": 1,
                },
              ],
              "embeds": [
                {
                  "color": 3447003,
                  "description": "-# Legend: SP = season peak | ATP = all time peak",
                  "fields": [
                    {
                      "inline": true,
                      "name": "Player",
                      "value": "<@discord_user_02>
          <@discord_user_01>",
                    },
                    {
                      "inline": true,
                      "name": "Halo Profile",
                      "value": "*Not Connected*
          [gamertag0000000000001](https://halodatahive.com/Player/Infinite/gamertag0000000000001)",
                    },
                    {
                      "inline": true,
                      "name": "Current Rank (SP, ATP)",
                      "value": "*-*
          <:Diamond6:1398928201975205958>1451 (<:Diamond6:1398928201975205958>1482, <:Onyx:1398928229087182992>1565)",
                    },
                  ],
                  "footer": {
                    "text": "Something not right? Click the 'Connect my Halo account' button below to connect your Halo account.",
                  },
                  "title": "Players in queue",
                },
              ],
            },
          ]
        `);
      });

      it("logs a warning if permissions are missing", async () => {
        hasPermissionsSpy.mockReset().mockReturnValue({ hasAll: false, missing: [1n] });

        await jobToComplete();
        expect(warnSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
        expect(createMessageSpy).not.toHaveBeenCalled();
      });

      it("logs a warning if haloService.getUsersByXuids throws", async () => {
        const error = new Error("Failed to fetch users");
        vi.spyOn(haloService, "getUsersByXuids").mockRejectedValue(error);

        await jobToComplete();
        expect(warnSpy).toHaveBeenCalledWith(error, expect.any(Map));
        expect(createMessageSpy).not.toHaveBeenCalled();
      });

      it("logs a warning if haloService.getRankedArenaCsrs throws", async () => {
        const error = new Error("Failed to fetch ranked arena CSRs");
        getRankedArenaCsrsSpy.mockRejectedValue(error);

        await jobToComplete();
        expect(warnSpy).toHaveBeenCalledWith(error, expect.any(Map));
        expect(createMessageSpy).not.toHaveBeenCalled();
      });

      it("skips message creation when NeatQueueInformerPlayerConnections is disabled", async () => {
        getGuildConfigSpy.mockReset().mockResolvedValue(
          aFakeGuildConfigRow({
            NeatQueueInformerPlayerConnections: "N",
            NeatQueueInformerMapsPost: MapsPostType.OFF,
          }),
        );

        await jobToComplete();

        expect(createMessageSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("updates config and logs warning when Discord getChannel fails with missing access", async () => {
        getChannelSpy.mockReset().mockRejectedValue(
          new DiscordError(403, {
            code: 50001,
            message: "Missing Access",
          }),
        );

        await jobToComplete();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith(
          "guild-id",
          expect.objectContaining({
            NeatQueueInformerPlayerConnections: "N",
            NeatQueueInformerMapsPost: MapsPostType.OFF,
          }),
        );
        expect(warnSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
        expect(createMessageSpy).not.toHaveBeenCalled();
      });

      it("updates config and logs warning when Discord permission calculation returns false", async () => {
        hasPermissionsSpy.mockReset().mockReturnValue({ hasAll: false, missing: [1n] });

        await jobToComplete();

        expect(updateGuildConfigSpy).toHaveBeenCalledWith(
          "guild-id",
          expect.objectContaining({
            NeatQueueInformerPlayerConnections: "N",
            NeatQueueInformerMapsPost: MapsPostType.OFF,
          }),
        );
        expect(warnSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
        expect(createMessageSpy).not.toHaveBeenCalled();
      });

      it("skips all posting when both player connections and maps are disabled", async () => {
        getGuildConfigSpy.mockReset().mockResolvedValue(
          aFakeGuildConfigRow({
            NeatQueueInformerPlayerConnections: "N",
            NeatQueueInformerMapsPost: MapsPostType.OFF,
          }),
        );

        await jobToComplete();

        expect(createMessageSpy).not.toHaveBeenCalled();
        expect(guildIdSpy).not.toHaveBeenCalled();
        expect(getChannelSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("posts players message when player connections are enabled and maps are disabled", async () => {
        getGuildConfigSpy.mockReset().mockResolvedValue(
          aFakeGuildConfigRow({
            NeatQueueInformerPlayerConnections: "Y",
            NeatQueueInformerMapsPost: MapsPostType.OFF,
          }),
        );

        await jobToComplete();

        expect(createMessageSpy).toHaveBeenCalledTimes(1);
        const [, messageData] = createMessageSpy.mock.calls[0] as [
          string,
          { embeds: unknown[]; components: unknown[] },
        ];
        expect(messageData.embeds).toBeDefined();
        expect(messageData.components).toBeDefined();

        // Check that only connect button is present, not maps button
        const messageString = JSON.stringify(messageData);
        expect(messageString).toContain("btn_connect_initiate");
        expect(messageString).not.toContain("btn_maps_initiate");
      });

      it("posts maps message when maps are set to AUTO and player connections are disabled", async () => {
        getGuildConfigSpy.mockReset().mockResolvedValue(
          aFakeGuildConfigRow({
            NeatQueueInformerPlayerConnections: "N",
            NeatQueueInformerMapsPost: MapsPostType.AUTO,
          }),
        );
        const generateMapsSpy = vi.spyOn(haloService, "generateMaps").mockReturnValue([
          { map: "Map 1", mode: "Slayer" },
          { map: "Map 2", mode: "Capture the Flag" },
        ]);

        await jobToComplete();

        expect(generateMapsSpy).toHaveBeenCalledWith({
          playlist: expect.any(String) as string,
          format: expect.any(String) as string,
          count: expect.any(Number) as number,
        });
        expect(createMessageSpy).toHaveBeenCalledTimes(1);
        const [, messageData] = createMessageSpy.mock.calls[0] as [
          string,
          { embeds: unknown[]; components: unknown[] },
        ];
        expect(messageData.embeds).toBeDefined();
        expect(messageData.components).toBeDefined();
      });

      it("posts both players message and maps message when both are enabled", async () => {
        getGuildConfigSpy.mockReset().mockResolvedValue(
          aFakeGuildConfigRow({
            NeatQueueInformerPlayerConnections: "Y",
            NeatQueueInformerMapsPost: MapsPostType.AUTO,
          }),
        );
        const generateMapsSpy = vi.spyOn(haloService, "generateMaps").mockReturnValue([
          { map: "Map 1", mode: "Slayer" },
          { map: "Map 2", mode: "Capture the Flag" },
        ]);

        await jobToComplete();

        expect(generateMapsSpy).toHaveBeenCalledWith({
          playlist: expect.any(String) as string,
          format: expect.any(String) as string,
          count: expect.any(Number) as number,
        });
        expect(createMessageSpy).toHaveBeenCalledTimes(2);

        // First call should be players message
        const [, firstMessageData] = createMessageSpy.mock.calls[0] as [string, { embeds: unknown[] }];
        const firstMessageString = JSON.stringify(firstMessageData);
        expect(firstMessageString).toContain("Players in queue");

        // Second call should be maps message
        const [, secondMessageData] = createMessageSpy.mock.calls[1] as [
          string,
          { embeds: unknown[]; components: unknown[] },
        ];
        expect(secondMessageData.embeds).toBeDefined();
        expect(secondMessageData.components).toBeDefined();
      });

      it("includes maps button in players message when maps are set to BUTTON", async () => {
        getGuildConfigSpy.mockReset().mockResolvedValue(
          aFakeGuildConfigRow({
            NeatQueueInformerPlayerConnections: "Y",
            NeatQueueInformerMapsPost: MapsPostType.BUTTON,
          }),
        );

        await jobToComplete();

        expect(createMessageSpy).toHaveBeenCalledTimes(1);
        const [, messageData] = createMessageSpy.mock.calls[0] as [string, { components: unknown[] }];
        const messageString = JSON.stringify(messageData);
        expect(messageString).toContain("btn_connect_initiate");
        expect(messageString).toContain("btn_maps_initiate");
      });

      it("does not include maps button in players message when maps are set to OFF", async () => {
        getGuildConfigSpy.mockReset().mockResolvedValue(
          aFakeGuildConfigRow({
            NeatQueueInformerPlayerConnections: "Y",
            NeatQueueInformerMapsPost: MapsPostType.OFF,
          }),
        );

        await jobToComplete();

        expect(createMessageSpy).toHaveBeenCalledTimes(1);
        const [, messageData] = createMessageSpy.mock.calls[0] as [string, { components: unknown[] }];
        const messageString = JSON.stringify(messageData);
        expect(messageString).toContain("btn_connect_initiate");
        expect(messageString).not.toContain("btn_maps_initiate");
      });

      it("posts maps button when maps are set to BUTTON and player connections are disabled", async () => {
        getGuildConfigSpy.mockReset().mockResolvedValue(
          aFakeGuildConfigRow({
            NeatQueueInformerPlayerConnections: "N",
            NeatQueueInformerMapsPost: MapsPostType.BUTTON,
          }),
        );

        await jobToComplete();

        expect(createMessageSpy).toHaveBeenCalledTimes(1);
        const [, messageData] = createMessageSpy.mock.calls[0] as [string, { components: unknown[] }];
        const messageString = JSON.stringify(messageData);
        expect(messageString).toContain("btn_maps_initiate");
        expect(messageString).not.toContain("btn_connect_initiate");
        expect(messageString).not.toContain("Players in queue");
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
            timestamp: sub(new Date(), { minutes: 15 }).toISOString(),
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
          aGuildMemberWith({
            user: {
              id: "discord_user_01",
              username: "soundmanD",
              global_name: "soundmanD",
              discriminator: "0001",
              avatar: "avatar1",
            },
          }),
          aGuildMemberWith({
            user: {
              id: "discord_user_02",
              username: "discord_user_02",
              global_name: "discord_user_02",
              discriminator: "0002",
              avatar: "avatar2",
            },
          }),
          aGuildMemberWith({
            user: {
              id: "discord_user_03",
              username: "discord_user_03",
              global_name: "discord_user_03",
              discriminator: "0003",
              avatar: "avatar3",
            },
          }),
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
            timestamp: sub(matchCompletedTimes, { minutes: 20 }).toISOString(),
            event: getFakeNeatQueueData("joinQueue"),
          },
          {
            timestamp: sub(matchCompletedTimes, { minutes: 19 }).toISOString(),
            event: getFakeNeatQueueData("leaveQueue"),
          },
          {
            timestamp: sub(matchCompletedTimes, { minutes: 18 }).toISOString(),
            event: getFakeNeatQueueData("matchStarted"),
          },
          {
            timestamp: sub(matchCompletedTimes, { minutes: 15 }).toISOString(),
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
            timestamp: sub(matchCompletedTimes, { minutes: 19 }).toISOString(),
            event: getFakeNeatQueueData("joinQueue"),
          },
          {
            timestamp: sub(matchCompletedTimes, { minutes: 18 }).toISOString(),
            event: getFakeNeatQueueData("leaveQueue"),
          },
          {
            timestamp: sub(matchCompletedTimes, { minutes: 17 }).toISOString(),
            event: getFakeNeatQueueData("substitution"),
          },
          {
            timestamp: sub(matchCompletedTimes, { minutes: 16 }).toISOString(),
            event: getFakeNeatQueueData("matchStarted"),
          },
          {
            timestamp: sub(matchCompletedTimes, { minutes: 15 }).toISOString(),
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
          startDateTime: new Date("2024-11-26T10:33:00.000Z"),
          endDateTime: new Date("2024-11-26T10:48:00.000Z"),
          teams: [
            [
              {
                globalName: "soundmanD",
                guildNickname: null,
                id: "discord_user_01",
                username: "soundmanD",
              },
            ],
            [
              {
                globalName: "discord_user_02",
                guildNickname: null,
                id: "discord_user_02",
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
            startDateTime: new Date("2024-11-26T10:33:00.000Z"),
            endDateTime: new Date("2024-11-26T10:48:00.000Z"),
            teams: [
              [
                {
                  globalName: "soundmanD",
                  guildNickname: null,
                  id: "discord_user_01",
                  username: "soundmanD",
                },
              ],
              [
                {
                  globalName: "discord_user_02",
                  guildNickname: null,
                  id: "discord_user_02",
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
                  Completed: "<t:1732618080:f>",
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
              timestamp: sub(matchCompletedTimes, { minutes: 45 }).toISOString(),
              event: getFakeNeatQueueData("substitution"),
            },
          ];
          appDataGetSpy.mockReset().mockResolvedValue(eventTimeline);

          haloServiceGetSeriesFromDiscordQueueSpy.mockReset();
          haloServiceGetSeriesFromDiscordQueueSpy.mockImplementation(async (queueData) => {
            if (queueData.startDateTime.getTime() === new Date("2024-11-26T10:03:00.000Z").getTime()) {
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
            startDateTime: new Date("2024-11-26T09:33:00.000Z"),
            endDateTime: new Date("2024-11-26T10:03:00.000Z"),
            teams: [
              [
                {
                  globalName: "soundmanD",
                  guildNickname: null,
                  id: "discord_user_01",
                  username: "soundmanD",
                },
              ],
              [
                {
                  globalName: "discord_user_02",
                  guildNickname: null,
                  id: "discord_user_02",
                  username: "discord_user_02",
                },
              ],
            ],
          });
          expect(haloServiceGetSeriesFromDiscordQueueSpy).toHaveBeenNthCalledWith(2, {
            startDateTime: new Date("2024-11-26T10:03:00.000Z"),
            endDateTime: new Date("2024-11-26T10:48:00.000Z"),
            teams: [
              [
                {
                  globalName: "discord_user_03",
                  guildNickname: null,
                  id: "discord_user_03",
                  username: "discord_user_03",
                },
              ],
              [
                {
                  globalName: "discord_user_02",
                  guildNickname: null,
                  id: "discord_user_02",
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

  describe("handleRetry", () => {
    let fakeMessage: APIMessage;
    let fakeErrorEmbed: EndUserError;

    beforeEach(() => {
      fakeMessage = {
        ...apiMessage,
        channel_id: "channel-123",
      };

      fakeErrorEmbed = new EndUserError("Retry test error", {
        data: {
          Channel: "<#queue-channel-456>",
          Queue: "1",
          Started: "<t:1700000000:f>",
          Completed: "<t:1700003600:f>",
          Substitutions: "<@discord_user_01> subbed in for <@discord_user_02> on <t:1700001800:f>",
        },
      });

      vi.spyOn(discordService, "getChannel").mockResolvedValue({
        type: ChannelType.GuildText,
        id: "channel-123",
      } as APIChannel);

      vi.spyOn(discordService, "getTeamsFromQueue").mockResolvedValue({
        message: apiMessage,
        queue: 1,
        timestamp: new Date(),
        teams: [
          {
            name: "Team 1",
            players: [
              aGuildMemberWith({
                user: {
                  id: "discord_user_01",
                  username: "player1",
                  global_name: "Player 1",
                  discriminator: "0001",
                  avatar: "avatar1",
                },
              }),
              aGuildMemberWith({
                user: {
                  id: "discord_user_02",
                  username: "player2",
                  global_name: "Player 2",
                  discriminator: "0002",
                  avatar: "avatar2",
                },
              }),
            ],
          },
          {
            name: "Team 2",
            players: [
              aGuildMemberWith({
                user: {
                  id: "discord_user_03",
                  username: "player3",
                  global_name: "Player 3",
                  discriminator: "0003",
                  avatar: "avatar3",
                },
              }),
              aGuildMemberWith({
                user: {
                  id: "discord_user_04",
                  username: "player4",
                  global_name: "Player 4",
                  discriminator: "0004",
                  avatar: "avatar4",
                },
              }),
            ],
          },
        ],
      });

      vi.spyOn(discordService, "getDateFromTimestamp").mockImplementation((timestamp) => {
        if (timestamp === "<t:1700000000:f>") {
          return new Date(1700000000 * 1000);
        }
        if (timestamp === "<t:1700003600:f>") {
          return new Date(1700003600 * 1000);
        }
        if (timestamp === "<t:1700001800:f>") {
          return new Date(1700001800 * 1000);
        }
        return new Date();
      });

      vi.spyOn(haloService, "getSeriesFromDiscordQueue").mockResolvedValue([]);
      vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);
    });

    it("processes retry for failed series fetch", async () => {
      const getSeriesFromDiscordQueueSpy = vi.spyOn(haloService, "getSeriesFromDiscordQueue");
      const editMessageSpy = vi.spyOn(discordService, "editMessage");

      await neatQueueService.handleRetry({
        errorEmbed: fakeErrorEmbed,
        guildId: "guild-123",
        message: fakeMessage,
      });

      expect(getSeriesFromDiscordQueueSpy).toHaveBeenCalled();
      expect(editMessageSpy).toHaveBeenCalled();
    });

    it("handles missing queue message gracefully", async () => {
      vi.spyOn(discordService, "getTeamsFromQueue").mockResolvedValue(null);
      const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);

      await neatQueueService.handleRetry({
        errorEmbed: fakeErrorEmbed,
        guildId: "guild-123",
        message: fakeMessage,
      });

      expect(editMessageSpy).toHaveBeenCalledOnce();
      expect(editMessageSpy.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "channel-123",
          "1314562775950954626",
          {
            "components": [],
            "embeds": [
              {
                "color": 16711680,
                "description": "Failed to find the queue message in the last 100 messages of the channel",
                "fields": [
                  {
                    "name": "Additional Information",
                    "value": "**Channel**: <#queue-channel-456>
        **Queue**: 1
        **Started**: <t:1700000000:f>
        **Completed**: <t:1700003600:f>
        **Substitutions**: <@discord_user_01> subbed in for <@discord_user_02> on <t:1700001800:f>",
                  },
                ],
                "title": "Something went wrong",
              },
            ],
          },
        ]
      `);
    });

    it("handles non-text channel gracefully", async () => {
      vi.spyOn(discordService, "getChannel").mockResolvedValue({
        type: ChannelType.GuildVoice,
        id: "voice-channel-123",
      } as APIChannel);
      const logWarnSpy = vi.spyOn(logService, "warn");

      await neatQueueService.handleRetry({
        errorEmbed: fakeErrorEmbed,
        guildId: "guild-123",
        message: fakeMessage,
      });

      expect(logWarnSpy).toHaveBeenCalledWith("Expected channel for retry", expect.any(Map));
    });
  });

  describe("updatePlayersEmbed", () => {
    let discordAssociationsSpy: MockInstance<typeof databaseService.getDiscordAssociations>;
    let getRankedArenaCsrsSpy: MockInstance<typeof haloService.getRankedArenaCsrs>;

    beforeEach(() => {
      discordAssociationsSpy = vi
        .spyOn(databaseService, "getDiscordAssociations")
        .mockResolvedValue([aFakeDiscordAssociationsRow()]);
      getRankedArenaCsrsSpy = vi.spyOn(haloService, "getRankedArenaCsrs").mockResolvedValue(getRankedArenaCsrsData);
    });

    it("updates the players embed when timeline and match started event exist", async () => {
      const channelId = "channel-123";
      const messageId = "message-123";
      const guildId = "guild-123";
      const timeline = [
        {
          timestamp: new Date().toISOString(),
          event: getFakeNeatQueueData("matchStarted"),
        },
      ];
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({
        keys: [{ name: `neatqueue:${guildId}:${channelId}` }],
        list_complete: true,
        cacheStatus: null,
      });
      const appDataGetSpy = vi.spyOn(env.APP_DATA, "get") as MockInstance;
      appDataGetSpy.mockResolvedValue(timeline);
      const editMessageSpy = vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);

      await neatQueueService.updatePlayersEmbed(guildId, channelId, messageId);

      expect(appDataGetSpy).toHaveBeenCalledOnce();
      expect(appDataGetSpy).toHaveBeenCalledWith(`neatqueue:${guildId}:${channelId}`, { type: "json" });
      expect(discordAssociationsSpy).toHaveBeenCalledOnce();
      expect(discordAssociationsSpy).toHaveBeenCalledWith(["discord_user_02", "discord_user_01"]);
      expect(getRankedArenaCsrsSpy).toHaveBeenCalledOnce();
      expect(getRankedArenaCsrsSpy).toHaveBeenCalledWith(["0000000000001"]);
      expect(editMessageSpy).toHaveBeenCalledOnce();
      expect(editMessageSpy.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "channel-123",
          "message-123",
          {
            "components": [
              {
                "components": [
                  {
                    "custom_id": "btn_connect_initiate",
                    "emoji": {
                      "name": "🔗",
                    },
                    "label": "Connect my Halo account",
                    "style": 1,
                    "type": 2,
                  },
                  {
                    "custom_id": "btn_maps_initiate",
                    "emoji": {
                      "name": "🗺️",
                    },
                    "label": "Generate maps",
                    "style": 2,
                    "type": 2,
                  },
                ],
                "type": 1,
              },
            ],
            "embeds": [
              {
                "color": 3447003,
                "description": "-# Legend: SP = season peak | ATP = all time peak",
                "fields": [
                  {
                    "inline": true,
                    "name": "Player",
                    "value": "<@discord_user_02>
        <@discord_user_01>",
                  },
                  {
                    "inline": true,
                    "name": "Halo Profile",
                    "value": "*Not Connected*
        [gamertag0000000000001](https://halodatahive.com/Player/Infinite/gamertag0000000000001)",
                  },
                  {
                    "inline": true,
                    "name": "Current Rank (SP, ATP)",
                    "value": "*-*
        <:Diamond6:1398928201975205958>1451 (<:Diamond6:1398928201975205958>1482, <:Onyx:1398928229087182992>1565)",
                  },
                ],
                "footer": {
                  "text": "Something not right? Click the 'Connect my Halo account' button below to connect your Halo account.",
                },
                "title": "Players in queue",
              },
            ],
          },
        ]
      `);
    });

    it("logs error if no key found for channel", async () => {
      const logErrorSpy = vi.spyOn(logService, "error");
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null });
      await neatQueueService.updatePlayersEmbed("guild-123", "channel-123", "message-123");

      expect(logErrorSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
    });

    it("logs error if timeline is not an array", async () => {
      const logErrorSpy = vi.spyOn(logService, "error");
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({
        keys: [{ name: "neatqueue:guild-123:channel-123" }],
        list_complete: true,
        cacheStatus: null,
      });
      vi.spyOn(env.APP_DATA, "get").mockResolvedValue(new Map());
      await neatQueueService.updatePlayersEmbed("guild-123", "channel-123", "message-123");

      expect(logErrorSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
    });

    it("logs error if no match started event found", async () => {
      const logErrorSpy = vi.spyOn(logService, "error");
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({
        keys: [{ name: "neatqueue:guild-123:channel-123" }],
        list_complete: true,
        cacheStatus: null,
      });
      vi.spyOn(env.APP_DATA, "get").mockResolvedValue(new Map([["timeline", []]]));
      await neatQueueService.updatePlayersEmbed("guild-123", "channel-123", "message-123");

      expect(logErrorSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
    });

    it("fetches guild config when updating players embed", async () => {
      const guildId = "guild-123";
      const channelId = "channel-123";
      const messageId = "message-123";
      const timeline = [
        {
          timestamp: new Date().toISOString(),
          event: getFakeNeatQueueData("matchStarted"),
        },
      ];

      const getGuildConfigSpy = vi.spyOn(databaseService, "getGuildConfig").mockResolvedValue(aFakeGuildConfigRow());
      vi.spyOn(env.APP_DATA, "list").mockResolvedValue({
        keys: [{ name: `neatqueue:${guildId}:${channelId}` }],
        list_complete: true,
        cacheStatus: null,
      });
      const appDataGetSpy = vi.spyOn(env.APP_DATA, "get") as MockInstance;
      appDataGetSpy.mockResolvedValue(timeline);
      vi.spyOn(discordService, "editMessage").mockResolvedValue(apiMessage);

      await neatQueueService.updatePlayersEmbed(guildId, channelId, messageId);

      expect(getGuildConfigSpy).toHaveBeenCalledOnce();
      expect(getGuildConfigSpy).toHaveBeenCalledWith(guildId);
    });
  });
});
