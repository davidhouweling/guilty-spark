import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { MatchOutcome, RequestError, type HaloInfiniteClient } from "halo-infinite-api";
import { sub } from "date-fns";
import { HaloService } from "../halo.mjs";
import type { DatabaseService } from "../../database/database.mjs";
import { aFakeDatabaseServiceWith, aFakeDiscordAssociationsRow } from "../../database/fakes/database.fake.mjs";
import { matchStats, playerMatches, neatQueueSeriesData } from "../fakes/data.mjs";
import { AssociationReason, GamesRetrievable } from "../../database/types/discord_associations.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeHaloInfiniteClient } from "../fakes/infinite-client.fake.mjs";
import type { LogService } from "../../log/types.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";

describe("Halo service", () => {
  let logService: LogService;
  let databaseService: DatabaseService;
  let infiniteClient: MockProxy<HaloInfiniteClient>;
  let haloService: HaloService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime("2024-11-26T12:00:00.000Z");

    logService = aFakeLogServiceWith();
    databaseService = aFakeDatabaseServiceWith();
    infiniteClient = aFakeHaloInfiniteClient();

    haloService = new HaloService({ logService, databaseService, infiniteClient });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getSeriesFromDiscordQueue()", () => {
    it("returns the series from the discord queue", async () => {
      const series = await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

      expect(series.map((s) => s.MatchId)).toEqual([
        "d81554d7-ddfe-44da-a6cb-000000000ctf",
        "e20900f9-4c6c-4003-a175-00000000koth",
        "9535b946-f30c-4a43-b852-000000slayer",
      ]);
    });

    it("fetches possible users from database service", async () => {
      const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

      await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

      expect(getDiscordAssociationsSpy).toHaveBeenCalledOnce();
      expect(getDiscordAssociationsSpy).toHaveBeenCalledWith([
        "000000000000000001",
        "000000000000000002",
        "000000000000000003",
        "000000000000000004",
        "000000000000000005",
        "000000000000000006",
        "000000000000000007",
        "000000000000000008",
      ]);
    });

    it("retries display name search when previous search was unsuccessful and display name has changed", async () => {
      const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

      getDiscordAssociationsSpy.mockImplementation(async (discordIds) => {
        return Promise.resolve(
          discordIds.map((id) => {
            if (id === "000000000000000004") {
              return aFakeDiscordAssociationsRow({
                DiscordId: id,
                XboxId: "",
                GamesRetrievable: GamesRetrievable.NO,
                DiscordDisplayNameSearched: "oldDisplayName",
                AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
              });
            }

            return aFakeDiscordAssociationsRow({
              DiscordId: id,
            });
          }),
        );
      });

      await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

      expect(infiniteClient.getUser).toHaveBeenCalledWith("gamertag0000000000004");
    });

    it("searches for matches across all possible users", async () => {
      const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

      getDiscordAssociationsSpy.mockImplementation(async (discordIds) => {
        return Promise.resolve(
          discordIds.map((id) => {
            return aFakeDiscordAssociationsRow({
              DiscordId: id,
              XboxId: ["000000000000000001", "000000000000000003"].includes(id) ? id.substring(5) : "",
              GamesRetrievable: ["000000000000000001", "000000000000000003"].includes(id)
                ? GamesRetrievable.YES
                : GamesRetrievable.NO,
            });
          }),
        );
      });
      infiniteClient.getPlayerMatches.mockImplementation(async (xboxUserId) => {
        if (xboxUserId === "0000000000001") {
          return Promise.resolve(playerMatches);
        }
        if (xboxUserId === "0000000000003") {
          return Promise.resolve(playerMatches.slice(0, 3));
        }

        return Promise.resolve([]);
      });

      await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

      expect(infiniteClient.getPlayerMatches).toHaveBeenCalledTimes(3);
      expect(infiniteClient.getPlayerMatches).toHaveBeenCalledWith("0000000000001", 2, 40, 0);
      expect(infiniteClient.getPlayerMatches).toHaveBeenCalledWith("0000000000003", 2, 40, 0);
      expect(infiniteClient.getPlayerMatches).toHaveBeenCalledWith("0000000000004", 2, 40, 0);
    });

    it("throws an error when all users from database are not game retrievable", async () => {
      const discordIds = [
        "000000000000000001",
        "000000000000000002",
        "000000000000000003",
        "000000000000000004",
        "000000000000000005",
        "000000000000000006",
        "000000000000000007",
        "000000000000000008",
      ];
      vi.spyOn(databaseService, "getDiscordAssociations").mockResolvedValue(
        discordIds.map((id) =>
          aFakeDiscordAssociationsRow({
            DiscordId: id,
            XboxId: "",
            GamesRetrievable: GamesRetrievable.NO,
          }),
        ),
      );

      return expect(haloService.getSeriesFromDiscordQueue(neatQueueSeriesData)).rejects.toThrow(
        "Unable to match any of the Discord users to their Xbox accounts.\n**How to fix**: Players from the series, click the connect button below to connect your Discord account to your Xbox account.",
      );
    });

    it("throws an error when no users could be found for all users", async () => {
      infiniteClient.getUser.mockClear();
      infiniteClient.getUser.mockRejectedValue(new Error("User not found"));

      return expect(haloService.getSeriesFromDiscordQueue(neatQueueSeriesData)).rejects.toThrow(
        "Unable to match any of the Discord users to their Xbox accounts.\n**How to fix**: Players from the series, click the connect button below to connect your Discord account to your Xbox account.",
      );
    });

    it("throws an error when no matches could be found for all users", async () => {
      infiniteClient.getPlayerMatches.mockClear();
      infiniteClient.getPlayerMatches.mockResolvedValue([]);

      return expect(haloService.getSeriesFromDiscordQueue(neatQueueSeriesData)).rejects.toThrow(
        "Unable to match any of the Discord users to their Xbox accounts.\n**How to fix**: Players from the series, click the connect button below to connect your Discord account to your Xbox account.",
      );
    });
  });

  describe("getMatchDetails()", () => {
    it("returns the match details", async () => {
      const matchDetails = await haloService.getMatchDetails(["d81554d7-ddfe-44da-a6cb-000000000ctf"]);

      expect(matchDetails.map((s) => s.MatchId)).toEqual(["d81554d7-ddfe-44da-a6cb-000000000ctf"]);
    });

    it("uses the supplied filter", async () => {
      const filterMock = vi.fn().mockReturnValue(true);
      const matchDetails = await haloService.getMatchDetails(["d81554d7-ddfe-44da-a6cb-000000000ctf"], filterMock);

      expect(filterMock).toHaveBeenCalledOnce();
      expect(filterMock).toHaveBeenCalledWith(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"), 0);
      expect(matchDetails.map((s) => s.MatchId)).toEqual(["d81554d7-ddfe-44da-a6cb-000000000ctf"]);
    });

    it('sorts the matches by "MatchStartTime" in ascending order', async () => {
      const matchDetails = await haloService.getMatchDetails([
        "e20900f9-4c6c-4003-a175-00000000koth",
        "d81554d7-ddfe-44da-a6cb-000000000ctf",
        "9535b946-f30c-4a43-b852-000000slayer",
      ]);

      expect(matchDetails.map((s) => s.MatchId)).toEqual([
        "d81554d7-ddfe-44da-a6cb-000000000ctf",
        "e20900f9-4c6c-4003-a175-00000000koth",
        "9535b946-f30c-4a43-b852-000000slayer",
      ]);
    });
  });

  describe("getGameTypeAndMap()", () => {
    it.each([{ matchId: "d81554d7-ddfe-44da-a6cb-000000000ctf", gameTypeAndMap: "CTF: Empyrean - Ranked" }])(
      "returns the game type and map for match $matchId",
      async ({ matchId, gameTypeAndMap }) => {
        const result = await haloService.getGameTypeAndMap(
          Preconditions.checkExists(matchStats.get(matchId)).MatchInfo,
        );

        expect(result).toBe(gameTypeAndMap);
      },
    );

    it("caches the asset data for the map", async () => {
      const match = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      await haloService.getGameTypeAndMap(match.MatchInfo);
      await haloService.getGameTypeAndMap(match.MatchInfo);

      expect(infiniteClient.getSpecificAssetVersion).toHaveBeenCalledTimes(1);
    });
  });

  describe("getMatchOutcome()", () => {
    it.each([
      [MatchOutcome.Tie, "Tie"],
      [MatchOutcome.Win, "Win"],
      [MatchOutcome.Loss, "Loss"],
      [MatchOutcome.DidNotFinish, "DNF"],
    ])("returns the outcome for outcome %s", (outcome, expectedOutcome) => {
      const result = haloService.getMatchOutcome(outcome);

      expect(result).toBe(expectedOutcome);
    });
  });

  describe("getMatchScore()", () => {
    it.each([
      { matchId: "d81554d7-ddfe-44da-a6cb-000000000ctf", score: "3:0" },
      { matchId: "e20900f9-4c6c-4003-a175-00000000koth", score: "3:2" },
      { matchId: "9535b946-f30c-4a43-b852-000000slayer", score: "44:50" },
      { matchId: "cf0fb794-2df1-4ba1-9415-00000oddball", score: "1:2 (198:256)" },
      { matchId: "099deb74-3f60-48cf-8784-0strongholds", score: "175:250" },
    ])("returns the score for match $matchId", ({ matchId, score }) => {
      const result = haloService.getMatchScore(Preconditions.checkExists(matchStats.get(matchId)), "en-US");

      expect(result).toBe(score);
    });
  });

  describe("getTeamName()", () => {
    it.each([
      { teamId: 0, teamName: "Eagle" },
      { teamId: 1, teamName: "Cobra" },
      { teamId: 2, teamName: "Hades" },
      { teamId: 3, teamName: "Valkyrie" },
      { teamId: 4, teamName: "Rampart" },
      { teamId: 5, teamName: "Cutlass" },
      { teamId: 6, teamName: "Valor" },
      { teamId: 7, teamName: "Hazard" },
      { teamId: 8, teamName: "Unknown" },
    ])("returns the team name for team $teamId", ({ teamId, teamName }) => {
      const result = haloService.getTeamName(teamId);

      expect(result).toBe(teamName);
    });
  });

  describe("getPlayerXuid()", () => {
    it("returns the xuid for the specified player", () => {
      const match = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      const player = Preconditions.checkExists(match.Players[0]);

      const result = haloService.getPlayerXuid(player);
      expect(result).toBe("0100000000000000");
    });
  });

  describe("getPlayerXuidsToGametags()", () => {
    it("returns the xuids to gamertags map for the specified players", async () => {
      const match = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));

      const result = await haloService.getPlayerXuidsToGametags(match);
      expect(result).toEqual(
        new Map([
          ["0100000000000000", "gamertag0100000000000000"],
          ["0200000000000000", "gamertag0200000000000000"],
          ["0500000000000000", "gamertag0500000000000000"],
          ["0400000000000000", "gamertag0400000000000000"],
          ["0900000000000000", "gamertag0900000000000000"],
          ["0800000000000000", "gamertag0800000000000000"],
          ["1100000000000000", "gamertag1100000000000000"],
          ["1200000000000000", "gamertag1200000000000000"],
        ]),
      );
    });

    it("caches xuids and does not call infiniteClient.getUsers if all users are cache hits", async () => {
      const match = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));

      await haloService.getPlayerXuidsToGametags(match);
      await haloService.getPlayerXuidsToGametags(match);

      expect(infiniteClient.getUsers).toHaveBeenCalledTimes(1);
    });

    it("only calls infiniteClient.getUsers for cache misses", async () => {
      const match1 = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      const match2 = Preconditions.checkExists(matchStats.get("cf0fb794-2df1-4ba1-9415-00000oddball"));

      await haloService.getPlayerXuidsToGametags(match1);
      await haloService.getPlayerXuidsToGametags(match2);

      expect(infiniteClient.getUsers).toHaveBeenCalledTimes(2);
      expect(infiniteClient.getUsers).toHaveBeenNthCalledWith(1, [
        "0100000000000000",
        "0200000000000000",
        "0500000000000000",
        "0400000000000000",
        "0900000000000000",
        "0800000000000000",
        "1100000000000000",
        "1200000000000000",
      ]);
      expect(infiniteClient.getUsers).toHaveBeenNthCalledWith(2, [
        "0600000000000000",
        "0300000000000000",
        "0700000000000000",
      ]);
    });

    it('filters out "Bot" players', async () => {
      const match = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      Preconditions.checkExists(match.Players[0]).PlayerType = 2;

      const result = await haloService.getPlayerXuidsToGametags(match);
      expect(result).toEqual(
        new Map([
          ["0200000000000000", "gamertag0200000000000000"],
          ["0500000000000000", "gamertag0500000000000000"],
          ["0400000000000000", "gamertag0400000000000000"],
          ["0900000000000000", "gamertag0900000000000000"],
          ["0800000000000000", "gamertag0800000000000000"],
          ["1100000000000000", "gamertag1100000000000000"],
          ["1200000000000000", "gamertag1200000000000000"],
        ]),
      );
    });
  });

  describe("getUsersByXuids()", () => {
    it("calls infiniteClient.getUsers and returns the UserInfo for the given xuids", async () => {
      const xuids = ["0100000000000000", "0200000000000000", "0500000000000000"];
      const result = await haloService.getUsersByXuids(xuids);

      expect(infiniteClient.getUsers).toHaveBeenCalledTimes(1);
      expect(infiniteClient.getUsers).toHaveBeenCalledWith(xuids);
      expect(result).toEqual([
        {
          gamerpic: {
            large: "large0100000000000000.png",
            medium: "medium0100000000000000.png",
            small: "small0100000000000000.png",
            xlarge: "xlarge0100000000000000.png",
          },
          gamertag: "gamertag0100000000000000",
          xuid: "0100000000000000",
        },
        {
          gamerpic: {
            large: "large0200000000000000.png",
            medium: "medium0200000000000000.png",
            small: "small0200000000000000.png",
            xlarge: "xlarge0200000000000000.png",
          },
          gamertag: "gamertag0200000000000000",
          xuid: "0200000000000000",
        },
        {
          gamerpic: {
            large: "large0500000000000000.png",
            medium: "medium0500000000000000.png",
            small: "small0500000000000000.png",
            xlarge: "xlarge0500000000000000.png",
          },
          gamertag: "gamertag0500000000000000",
          xuid: "0500000000000000",
        },
      ]);
    });
  });

  describe("getDurationInSeconds()", () => {
    it("returns the duration in seconds", () => {
      const duration = "PT10M58.2413691S";
      const result = haloService.getDurationInSeconds(duration);

      expect(result).toBe(658.2);
    });

    it("returns the duration in a readable format (including days and hours)", () => {
      const duration = "P3DT4H30M15.5S";
      const result = haloService.getDurationInSeconds(duration);

      expect(result).toBe(275415.5);
    });
  });

  describe("getReadableDuration()", () => {
    it("returns the duration in a readable format", () => {
      const duration = "PT10M58.2413691S";
      const result = haloService.getReadableDuration(duration, "en-US");

      expect(result).toBe("10m 58s");
    });

    it("returns the duration in a readable format (including days and hours)", () => {
      const duration = "P3DT4H30M15.5S";
      const result = haloService.getReadableDuration(duration, "en-US");

      expect(result).toBe("3d 4h 30m 15s");
    });
  });

  describe("getMedal()", () => {
    it("returns the medal for the specified medalId", async () => {
      const result = await haloService.getMedal(3334154676);

      expect(result).toEqual({
        difficulty: "normal",
        name: "Guardian Angel",
        sortingWeight: 50,
        type: "skill",
      });
    });

    it("caches the medal data so that it only calls infinite api once", async () => {
      const getMedalsMetadataFileSpy = vi.spyOn(infiniteClient, "getMedalsMetadataFile");
      const cleanHaloService = new HaloService({ logService, databaseService, infiniteClient });

      await cleanHaloService.getMedal(3334154676);
      await cleanHaloService.getMedal(3334154676);

      expect(getMedalsMetadataFileSpy).toHaveBeenCalledTimes(1);
    });

    it("returns undefined if the medalId is not found", async () => {
      const result = await haloService.getMedal(0);

      expect(result).toBeUndefined();
    });
  });

  describe("getUserByGamertag()", () => {
    it("returns the user for the specified gamertag", async () => {
      const result = await haloService.getUserByGamertag("gamertag0100000000000000");

      expect(result).toEqual({
        gamerpic: {
          large: "large0100000000000000.png",
          medium: "medium0100000000000000.png",
          small: "small0100000000000000.png",
          xlarge: "xlarge0100000000000000.png",
        },
        gamertag: "gamertag0100000000000000",
        xuid: "0100000000000000",
      });
    });
  });

  describe("getRecentMatchHistory()", () => {
    it("returns the recent match history for the specified user", async () => {
      const result = await haloService.getRecentMatchHistory("gamertag0000000000001");

      expect(result.map((r) => r.MatchId)).toEqual([
        "9535b946-f30c-4a43-b852-000000slayer",
        "e20900f9-4c6c-4003-a175-00000000koth",
        "d81554d7-ddfe-44da-a6cb-000000000ctf",
        "099deb74-3f60-48cf-8784-0strongholds",
        "cf0fb794-2df1-4ba1-9415-00000oddball",
      ]);
    });

    it("returns an empty array if no matches are found", async () => {
      const result = await haloService.getRecentMatchHistory("gamertag0000000000002");

      expect(result).toEqual([]);
    });

    it("throws if the user is not found", async () => {
      const gamertag = "gamertag0000000000002";
      const response = new Response("", { status: 400, statusText: "Bad Request" });

      infiniteClient.getUser.mockRejectedValue(new RequestError(new URL("https://example.com"), response));

      return expect(haloService.getRecentMatchHistory(gamertag)).rejects.toThrow(
        `No user found with gamertag "${gamertag}"`,
      );
    });

    it("throws error if infiniteClient.getPlayerMatches throws error", async () => {
      const gamertag = "gamertag0000000000001";
      infiniteClient.getPlayerMatches.mockRejectedValue(new Error("Error"));

      return expect(haloService.getRecentMatchHistory(gamertag)).rejects.toThrow("Unable to retrieve match history");
    });
  });

  describe("updateDiscordAssociations()", () => {
    it("updates the discord associations with the user cache", async () => {
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");
      await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
      await haloService.updateDiscordAssociations();

      expect(upsertDiscordAssociationsSpy).toHaveBeenCalledOnce();
      expect(upsertDiscordAssociationsSpy.mock.lastCall).toMatchInlineSnapshot(`
        [
          [
            {
              "AssociationDate": 1732622400000,
              "AssociationReason": "D",
              "DiscordDisplayNameSearched": "gamertag0000000000004",
              "DiscordId": "000000000000000004",
              "GamesRetrievable": "N",
              "XboxId": "0000000000004",
            },
            {
              "AssociationDate": 1732622400000,
              "AssociationReason": "U",
              "DiscordDisplayNameSearched": null,
              "DiscordId": "000000000000000001",
              "GamesRetrievable": "Y",
              "XboxId": "0000000000001",
            },
            {
              "AssociationDate": 1732622400000,
              "AssociationReason": "D",
              "DiscordDisplayNameSearched": "DiscordUser02",
              "DiscordId": "000000000000000002",
              "GamesRetrievable": "N",
              "XboxId": "",
            },
            {
              "AssociationDate": 1732622400000,
              "AssociationReason": "U",
              "DiscordDisplayNameSearched": null,
              "DiscordId": "000000000000000003",
              "GamesRetrievable": "N",
              "XboxId": "0000000000003",
            },
            {
              "AssociationDate": 1732622400000,
              "AssociationReason": "D",
              "DiscordDisplayNameSearched": "DiscordUser05",
              "DiscordId": "000000000000000005",
              "GamesRetrievable": "N",
              "XboxId": "",
            },
            {
              "AssociationDate": 1732622400000,
              "AssociationReason": "U",
              "DiscordDisplayNameSearched": null,
              "DiscordId": "000000000000000006",
              "GamesRetrievable": "N",
              "XboxId": "0000000000006",
            },
            {
              "AssociationDate": 1732622400000,
              "AssociationReason": "D",
              "DiscordDisplayNameSearched": "DiscordUser07",
              "DiscordId": "000000000000000007",
              "GamesRetrievable": "N",
              "XboxId": "",
            },
            {
              "AssociationDate": 1732622400000,
              "AssociationReason": "D",
              "DiscordDisplayNameSearched": "DiscordUser08",
              "DiscordId": "000000000000000008",
              "GamesRetrievable": "N",
              "XboxId": "",
            },
          ],
        ]
      `);
    });

    it("updates the discord associations even when no user is found", async () => {
      vi.spyOn(databaseService, "upsertDiscordAssociations");
      vi.spyOn(databaseService, "getDiscordAssociations").mockResolvedValue([]);
      infiniteClient.getUser.mockRejectedValue(
        new RequestError(new URL("https://example.com"), new Response("", { status: 400 })),
      );
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      await expect(async () => haloService.getSeriesFromDiscordQueue(neatQueueSeriesData)).rejects.toThrow();

      expect(upsertDiscordAssociationsSpy).toHaveBeenCalled();
    });

    it("updates the discord associations even when no matches are found", async () => {
      vi.spyOn(databaseService, "upsertDiscordAssociations");
      infiniteClient.getPlayerMatches.mockResolvedValue([]);
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      await expect(async () => haloService.getSeriesFromDiscordQueue(neatQueueSeriesData)).rejects.toThrow();

      expect(upsertDiscordAssociationsSpy).toHaveBeenCalled();
    });

    it("does not update the discord associations if the queue time is less than 10 minutes and no user is found", async () => {
      vi.spyOn(databaseService, "upsertDiscordAssociations");
      vi.spyOn(databaseService, "getDiscordAssociations").mockResolvedValue([]);
      infiniteClient.getUser.mockRejectedValue(
        new RequestError(new URL("https://example.com"), new Response("", { status: 400 })),
      );
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      await expect(async () =>
        haloService.getSeriesFromDiscordQueue({
          ...neatQueueSeriesData,
          startDateTime: sub(neatQueueSeriesData.endDateTime, { minutes: 5 }),
        }),
      ).rejects.toThrow();

      expect(upsertDiscordAssociationsSpy).not.toHaveBeenCalled();
    });

    it("does not update the discord associations if the queue time is less than 10 minutes and no matches are found", async () => {
      vi.spyOn(databaseService, "upsertDiscordAssociations");
      infiniteClient.getPlayerMatches.mockResolvedValue([]);
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      await expect(async () =>
        haloService.getSeriesFromDiscordQueue({
          ...neatQueueSeriesData,
          startDateTime: sub(neatQueueSeriesData.endDateTime, { minutes: 5 }),
        }),
      ).rejects.toThrow();

      expect(upsertDiscordAssociationsSpy).not.toHaveBeenCalled();
    });
  });
});
