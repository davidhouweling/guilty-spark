import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { HaloService } from "../halo.mjs";
import type { DatabaseService } from "../../database/database.mjs";
import { aFakeDatabaseServiceWith, aFakeDiscordAssociationsRow } from "../../database/fakes/database.fake.mjs";
import { matchStats } from "../fakes/data.mjs";
import { GamesRetrievable } from "../../database/types/discord_associations.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeHaloInfiniteClient } from "../fakes/infinite-client.fake.mjs";
import { discordNeatQueueData } from "../../discord/fakes/data.mjs";

describe("Halo service", () => {
  let databaseService: DatabaseService;
  let infiniteClient: MockProxy<HaloInfiniteClient>;
  let haloService: HaloService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime("2024-11-26T12:00:00.000Z");

    infiniteClient = aFakeHaloInfiniteClient();

    databaseService = aFakeDatabaseServiceWith();
    haloService = new HaloService({ databaseService, infiniteClient });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getSeriesFromDiscordQueue()", () => {
    it("returns the series from the discord queue", async () => {
      const series = await haloService.getSeriesFromDiscordQueue(discordNeatQueueData);

      expect(series.map((s) => s.MatchId)).toEqual([
        "d81554d7-ddfe-44da-a6cb-000000000ctf",
        "e20900f9-4c6c-4003-a175-00000000koth",
        "9535b946-f30c-4a43-b852-000000slayer",
      ]);
    });

    it("fetches possible users from database service", async () => {
      const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

      await haloService.getSeriesFromDiscordQueue(discordNeatQueueData);

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

      return expect(haloService.getSeriesFromDiscordQueue(discordNeatQueueData)).rejects.toThrow(
        "Unable to match any of the Discord users to their Xbox accounts",
      );
    });

    it("throws an error when no users could be found for all users", async () => {
      infiniteClient.getUser.mockClear();
      infiniteClient.getUser.mockRejectedValue(new Error("User not found"));

      return expect(haloService.getSeriesFromDiscordQueue(discordNeatQueueData)).rejects.toThrow(
        "Unable to match any of the Discord users to their Xbox accounts",
      );
    });

    it("throws an error when no matches could be found for all users", async () => {
      infiniteClient.getPlayerMatches.mockClear();
      infiniteClient.getPlayerMatches.mockResolvedValue([]);

      return expect(haloService.getSeriesFromDiscordQueue(discordNeatQueueData)).rejects.toThrow(
        "No matches found either because discord users could not be resolved to xbox users or no matches visible in Halo Waypoint",
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
        const result = await haloService.getGameTypeAndMap(Preconditions.checkExists(matchStats.get(matchId)));

        expect(result).toBe(gameTypeAndMap);
      },
    );

    it("caches the asset data for the map", async () => {
      const match = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      await haloService.getGameTypeAndMap(match);
      await haloService.getGameTypeAndMap(match);

      expect(infiniteClient.getSpecificAssetVersion).toHaveBeenCalledTimes(1);
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
      const result = haloService.getMatchScore(Preconditions.checkExists(matchStats.get(matchId)));

      expect(result).toBe(score);
    });
  });

  describe("getTeamName()", () => {
    it.each([
      { teamId: 0, teamName: "Eagle" },
      { teamId: 1, teamName: "Cobra" },
      { teamId: 2, teamName: "Green" },
      { teamId: 3, teamName: "Orange" },
      { teamId: 4, teamName: "Unknown" },
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
  });

  describe("getReadableDuration()", () => {
    it("returns the duration in a readable format", () => {
      const duration = "PT10M58.2413691S";
      const result = haloService.getReadableDuration(duration);

      expect(result).toBe("10m 58s");
    });

    it("returns the duration in a readable format (including days and hours)", () => {
      const duration = "P3DT4H30M15.5S";
      const result = haloService.getReadableDuration(duration);

      expect(result).toBe("3d 4h 30m 15s");
    });
  });

  describe("updateDiscordAssociations()", () => {
    it("updates the discord associations with the user cache", async () => {
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");
      await haloService.getSeriesFromDiscordQueue(discordNeatQueueData);
      await haloService.updateDiscordAssociations();

      expect(upsertDiscordAssociationsSpy).toHaveBeenCalledOnce();
      expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith([
        {
          AssociationDate: 1732622400000,
          AssociationReason: "U",
          DiscordId: "000000000000000001",
          GamesRetrievable: "Y",
          XboxId: "xuid0000000000001",
        },
        {
          AssociationDate: 1732622400000,
          AssociationReason: "U",
          DiscordId: "000000000000000002",
          GamesRetrievable: "N",
          XboxId: "xuid0000000000002",
        },
        {
          AssociationDate: 1732622400000,
          AssociationReason: "U",
          DiscordId: "000000000000000003",
          GamesRetrievable: "N",
          XboxId: "xuid0000000000003",
        },
        {
          AssociationDate: 1732622400000,
          AssociationReason: "U",
          DiscordId: "000000000000000004",
          GamesRetrievable: "N",
          XboxId: "xuid0000000000004",
        },
        {
          AssociationDate: 1732622400000,
          AssociationReason: "U",
          DiscordId: "000000000000000005",
          GamesRetrievable: "N",
          XboxId: "xuid0000000000005",
        },
        {
          AssociationDate: 1732622400000,
          AssociationReason: "U",
          DiscordId: "000000000000000006",
          GamesRetrievable: "N",
          XboxId: "xuid0000000000006",
        },
        {
          AssociationDate: 1732622400000,
          AssociationReason: "U",
          DiscordId: "000000000000000007",
          GamesRetrievable: "N",
          XboxId: "xuid0000000000007",
        },
        {
          AssociationDate: 1732622400000,
          AssociationReason: "U",
          DiscordId: "000000000000000008",
          GamesRetrievable: "N",
          XboxId: "xuid0000000000008",
        },
      ]);
    });
  });
});
