import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { MockedFunction } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { MatchOutcome, RequestError, AssetKind } from "halo-infinite-api";
import type { PlaylistCsr, HaloInfiniteClient, UserInfo } from "halo-infinite-api";
import { sub } from "date-fns";
import { HaloService, FetchablePlaylist } from "../halo.mjs";
import type { generateRoundRobinMapsFn } from "../round-robin.mjs";
import type { DatabaseService } from "../../database/database.mjs";
import { aFakeDatabaseServiceWith, aFakeDiscordAssociationsRow } from "../../database/fakes/database.fake.mjs";
import { matchStats, playerMatches, neatQueueSeriesData } from "../fakes/data.mjs";
import { AssociationReason, GamesRetrievable } from "../../database/types/discord_associations.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeHaloInfiniteClient } from "../fakes/infinite-client.fake.mjs";
import type { LogService } from "../../log/types.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import { EndUserError, EndUserErrorType } from "../../../base/end-user-error.mjs";
import { MapsFormatType, MapsPlaylistType } from "../../database/types/guild_config.mjs";

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
    haloService.clearUserCache(); // Clear cache between tests
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
      infiniteClient.getPlayerMatches.mockImplementation(async (xboxUserId, _matchType, _count, start) => {
        if (xboxUserId === "0000000000001" && start === 0) {
          return Promise.resolve(playerMatches);
        }
        if (xboxUserId === "0000000000003" && start === 0) {
          return Promise.resolve(playerMatches.slice(0, 3));
        }

        return Promise.resolve([]);
      });

      await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

      expect(infiniteClient.getPlayerMatches).toHaveBeenCalledTimes(5);
      expect(infiniteClient.getPlayerMatches.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "0000000000004",
            0,
            25,
            0,
          ],
          [
            "0000000000001",
            0,
            25,
            0,
          ],
          [
            "0000000000001",
            0,
            25,
            5,
          ],
          [
            "0000000000003",
            0,
            25,
            0,
          ],
          [
            "0000000000003",
            0,
            25,
            3,
          ],
        ]
      `);
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

    describe("fuzzy matching", () => {
      const expectGameSimilarityAssociation = (discordId: string): ReturnType<typeof expect.objectContaining> =>
        expect.objectContaining({
          DiscordId: discordId,
          AssociationReason: AssociationReason.GAME_SIMILARITY,
          GamesRetrievable: GamesRetrievable.UNKNOWN,
        });

      const expectUserNameSearchAssociation = (
        discordId: string,
        xboxId: string,
      ): ReturnType<typeof expect.objectContaining> =>
        expect.objectContaining({
          DiscordId: discordId,
          XboxId: xboxId,
          AssociationReason: AssociationReason.USERNAME_SEARCH,
          GamesRetrievable: GamesRetrievable.YES,
        });

      const expectMultipleGameSimilarityAssociations = (
        discordIds: string[],
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      ): ReturnType<typeof expect.objectContaining>[] => discordIds.map((id) => expectGameSimilarityAssociation(id));

      // Helper functions for creating Xbox user objects
      const createXboxGamerpic = (xuid: string): UserInfo["gamerpic"] => ({
        small: `small${xuid}.png`,
        medium: `medium${xuid}.png`,
        large: `large${xuid}.png`,
        xlarge: `xlarge${xuid}.png`,
      });

      const createXboxUser = (xuid: string, gamertag: string): UserInfo => ({
        xuid,
        gamertag,
        gamerpic: createXboxGamerpic(xuid),
      });

      const createDefaultXboxUser = (xuid: string, index: number, prefix = "OtherGamertag"): UserInfo =>
        createXboxUser(xuid, `${prefix}${String(index + 1).padStart(2, "0")}`);

      // Helper function for creating getUsersSpy mocks
      const mockGetUsersWithCustomUsers = (
        customUsers: { index: number; gamertag: string }[],
        defaultPrefix = "OtherGamertag",
      ) => {
        return async (xuids: string[]): ReturnType<HaloInfiniteClient["getUsers"]> => {
          return Promise.resolve(
            xuids.map((xuid, index) => {
              const customUser = customUsers.find((user) => user.index === index);
              if (customUser) {
                return createXboxUser(xuid, customUser.gamertag);
              }
              return createDefaultXboxUser(xuid, index, defaultPrefix);
            }),
          );
        };
      };

      const mockGetUsersWithPatternedUsers = (pattern: (index: number) => string) => {
        return async (xuids: string[]): ReturnType<HaloInfiniteClient["getUsers"]> => {
          return Promise.resolve(xuids.map((xuid, index) => createXboxUser(xuid, pattern(index))));
        };
      };

      describe("when Discord users have no existing Xbox associations", () => {
        beforeEach(() => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id, index) => {
                if (index === 0) {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });

          getUsersSpy.mockImplementation(
            mockGetUsersWithPatternedUsers((index) => `DiscordUser${String(index + 1).padStart(2, "0")}`),
          );
        });

        it("attempts fuzzy matching between Discord usernames and Xbox gamertags", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(getUsersSpy).toHaveBeenCalled();
          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledOnce();
          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([expectGameSimilarityAssociation("000000000000000002")]),
          );
        });

        it("creates associations with GAME_SIMILARITY reason when matches are found", async () => {
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([expectGameSimilarityAssociation("000000000000000002")]),
          );
        });

        it("logs info messages with match scores and reasoning", async () => {
          const logInfoSpy = vi.spyOn(logService, "info");

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(logInfoSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Fuzzy match: Discord user.*with score.*Name scores:/),
          );
        });

        it("returns series matches when fuzzy matching succeeds", async () => {
          const result = await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(result).toHaveLength(3);
        });
      });

      describe("when Discord users have partial Xbox associations", () => {
        beforeEach(() => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id, index) => {
                if (index < 3) {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: `000000000000${String(index + 1)}`,
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });

          getUsersSpy.mockImplementation(
            mockGetUsersWithPatternedUsers((index) => `PartialUser${String(index + 1).padStart(2, "0")}`),
          );
        });

        it("only attempts fuzzy matching for unassociated Discord users", async () => {
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining(
              expectMultipleGameSimilarityAssociations([
                "000000000000000004",
                "000000000000000005",
                "000000000000000006",
                "000000000000000007",
                "000000000000000008",
              ]),
            ),
          );

          expect(upsertDiscordAssociationsSpy).not.toHaveBeenCalledWith(
            expect.arrayContaining(
              expectMultipleGameSimilarityAssociations([
                "000000000000000001",
                "000000000000000002",
                "000000000000000003",
              ]),
            ),
          );
        });

        it("preserves some existing associations while creating new fuzzy matches for others", async () => {
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expectUserNameSearchAssociation("000000000000000001", "0000000000001"),
              expectGameSimilarityAssociation("000000000000000002"),
              expectGameSimilarityAssociation("000000000000000003"),
              expectGameSimilarityAssociation("000000000000000004"),
              expectGameSimilarityAssociation("000000000000000005"),
              expectGameSimilarityAssociation("000000000000000006"),
              expectGameSimilarityAssociation("000000000000000007"),
              expectGameSimilarityAssociation("000000000000000008"),
            ]),
          );
        });

        it("successfully finds series matches using both existing associations and fuzzy-matched users", async () => {
          const getPlayerMatchesSpy = vi.spyOn(infiniteClient, "getPlayerMatches");

          const result = await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(result).toHaveLength(3);
          expect(result.map((match) => match.MatchId)).toEqual([
            "d81554d7-ddfe-44da-a6cb-000000000ctf",
            "e20900f9-4c6c-4003-a175-00000000koth",
            "9535b946-f30c-4a43-b852-000000slayer",
          ]);

          expect(getPlayerMatchesSpy).toHaveBeenCalledTimes(5);
          expect(getPlayerMatchesSpy.mock.calls).toMatchInlineSnapshot(`
            [
              [
                "0000000000004",
                0,
                25,
                0,
              ],
              [
                "0000000000001",
                0,
                25,
                0,
              ],
              [
                "0000000000001",
                0,
                25,
                5,
              ],
              [
                "0000000000002",
                0,
                25,
                0,
              ],
              [
                "0000000000003",
                0,
                25,
                0,
              ],
            ]
          `);
        });
      });

      describe("exact username matching scenarios", () => {
        beforeEach(() => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id, index) => {
                if (index === 0) {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });

          getUsersSpy.mockImplementation(
            mockGetUsersWithPatternedUsers((index) => `discord_user_0${String(index + 2)}`),
          );
        });

        it("creates perfect score associations when Discord username exactly matches Xbox gamertag", async () => {
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([expectGameSimilarityAssociation("000000000000000002")]),
          );
        });

        it("handles case-insensitive exact matches", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithPatternedUsers((index) => `DISCORD_USER_0${String(index + 2)}`),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([expectGameSimilarityAssociation("000000000000000002")]),
          );
        });

        it("prioritizes exact matches over partial matches when multiple candidates exist", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([
              { index: 1, gamertag: "discord_user_02" },
              { index: 2, gamertag: "discord_user_02_similar" },
            ]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([expectGameSimilarityAssociation("000000000000000002")]),
          );
        });
      });

      describe("partial username matching scenarios", () => {
        beforeEach(() => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });
        });

        it("creates associations when Discord username is substring of Xbox gamertag", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([{ index: 1, gamertag: "Pro_discord_user_02_Gaming" }]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([expectGameSimilarityAssociation("000000000000000002")]),
          );
        });

        it("creates associations when Xbox gamertag is substring of Discord username", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "user_02" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([expectGameSimilarityAssociation("000000000000000002")]),
          );
        });

        it("calculates similarity scores for name variations (username, globalName, guildNickname)", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const logInfoSpy = vi.spyOn(logService, "info");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "DiscordUser02_Pro" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(logInfoSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Fuzzy match.*Name scores:.*discord_user_02.*DiscordUser02/),
          );
        });

        it("selects best matching Discord name variant for association", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "DiscordUser02_Gaming" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expect.objectContaining({
                DiscordId: "000000000000000002",
                DiscordDisplayNameSearched: "discord_user_02", // Algorithm uses the name variant that actually matched
                AssociationReason: AssociationReason.GAME_SIMILARITY,
                GamesRetrievable: GamesRetrievable.UNKNOWN,
              }),
            ]),
          );
        });
      });

      describe("complex fuzzy matching scenarios", () => {
        beforeEach(() => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });
        });

        it("handles multiple Discord users with similar names to same Xbox gamertag", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([
              { index: 1, gamertag: "discord_user_02" }, // Exact match for discord_user_02
              { index: 2, gamertag: "discord_user_02_alt" }, // Close match for discord_user_02
              { index: 3, gamertag: "discord_user_03" }, // Exact match for discord_user_03
            ]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expectGameSimilarityAssociation("000000000000000002"), // discord_user_02 gets exact match
              expectGameSimilarityAssociation("000000000000000003"), // discord_user_03 gets exact match
            ]),
          );
        });

        it("prevents duplicate assignments using greedy algorithm", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([
              { index: 1, gamertag: "disc_user_02" }, // Similar to discord_user_02
              { index: 2, gamertag: "discord_user_03_pro" }, // Similar to discord_user_03
              { index: 3, gamertag: "discord_user_04_gamer" }, // Similar to discord_user_04
            ]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          const allAssociations = upsertDiscordAssociationsSpy.mock.calls.flat().flat();
          const xboxIds = allAssociations.map((association) => association.XboxId).filter((id) => id !== "");
          const uniqueXboxIds = new Set(xboxIds);

          expect(xboxIds.length).toBe(uniqueXboxIds.size);
        });

        it("assigns remaining single Discord user to remaining single Xbox player as low confidence match", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([
              { index: 1, gamertag: "discord_user_02_v2" }, // Moderately similar to discord_user_02
            ]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([expectGameSimilarityAssociation("000000000000000002")]),
          );
        });

        it("filters out matches below minimum confidence threshold", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithPatternedUsers((index) => `CompletelyUnrelated${String(index + 1).padStart(3, "0")}`),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          const allAssociations = upsertDiscordAssociationsSpy.mock.calls.flat().flat();
          const gameSimilarityAssociations = allAssociations.filter(
            (association) => association.AssociationReason === AssociationReason.GAME_SIMILARITY,
          );

          expect(gameSimilarityAssociations.length).toBe(0);
        });
      });

      describe("team-based fuzzy matching", () => {
        beforeEach(() => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });
        });

        it("performs fuzzy matching within each team separately", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([
              { index: 1, gamertag: "discord_user_02" }, // Team 1 user
              { index: 4, gamertag: "discord_user_05" }, // Team 2 user
            ]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expectGameSimilarityAssociation("000000000000000002"), // Team 1
              expectGameSimilarityAssociation("000000000000000005"), // Team 2
            ]),
          );
        });

        it("groups Xbox players by team from match data", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const logInfoSpy = vi.spyOn(logService, "info");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([
              { index: 1, gamertag: "discord_user_02" },
              { index: 2, gamertag: "discord_user_03" },
            ]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(logInfoSpy).toHaveBeenCalledWith(expect.stringMatching(/Fuzzy match: Discord user.*with score/));
        });

        it("only matches Discord users to Xbox players on same team", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([
              { index: 1, gamertag: "discord_user_05" }, // Team 1 Xbox user similar to Team 2 Discord user
              { index: 4, gamertag: "discord_user_02" }, // Team 2 Xbox user similar to Team 1 Discord user
            ]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expectGameSimilarityAssociation("000000000000000002"), // discord_user_02 matches team 2 Xbox user
              expectGameSimilarityAssociation("000000000000000005"), // discord_user_05 matches team 1 Xbox user
            ]),
          );
        });

        it("handles mismatched team sizes gracefully", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([
              { index: 1, gamertag: "discord_user_02" },

              { index: 4, gamertag: "discord_user_05" },
            ]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expectGameSimilarityAssociation("000000000000000002"),
              expectGameSimilarityAssociation("000000000000000005"),
            ]),
          );
        });
      });

      describe("edge cases and error handling", () => {
        it("returns original series when no unassociated Discord users exist", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id, index) => {
                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: `000000000000${String(index + 1)}`,
                  GamesRetrievable: GamesRetrievable.YES,
                  AssociationReason: AssociationReason.USERNAME_SEARCH,
                });
              }),
            );
          });

          const result = await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(getUsersSpy).toHaveBeenCalled();
          expect(result).toHaveLength(3);
        });

        it("continues processing when Xbox gamertag lookup fails", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });

          getUsersSpy.mockRejectedValue(new Error("Xbox API failed"));

          await expect(haloService.getSeriesFromDiscordQueue(neatQueueSeriesData)).rejects.toThrow("Xbox API failed");
        });

        it("handles empty series matches gracefully", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });

          infiniteClient.getPlayerMatches.mockResolvedValue([]);

          await expect(haloService.getSeriesFromDiscordQueue(neatQueueSeriesData)).rejects.toThrow(
            "Unable to match any of the Discord users to their Xbox accounts",
          );
        });

        it("handles malformed Discord user data", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });

          getUsersSpy.mockImplementation(mockGetUsersWithPatternedUsers((index) => `TestUser${String(index)}`));

          const malformedSeriesData = {
            ...neatQueueSeriesData,
            teams: [
              [
                {
                  id: "000000000000000001",
                  username: "", // Empty username
                  globalName: null,
                  guildNickname: null,
                },
                {
                  id: "000000000000000002",
                  username: "discord_user_02",
                  globalName: "DiscordUser02",
                  guildNickname: null,
                },
              ],
              [
                {
                  id: "000000000000000003",
                  username: "discord_user_03",
                  globalName: null,
                  guildNickname: null,
                },
              ],
            ],
          };

          await expect(haloService.getSeriesFromDiscordQueue(malformedSeriesData)).rejects.toThrow(
            "Unable to match any of the Discord users to their Xbox accounts",
          );
        });

        it("handles Xbox players without gamertags", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });

          getUsersSpy.mockImplementation(async (xuids: string[]) => {
            return Promise.resolve(
              xuids.map((xuid, index) => ({
                xuid,
                gamertag: index === 1 ? "" : `GameTag${String(index)}`, // Empty gamertag for one user
                gamerpic: createXboxGamerpic(xuid),
              })),
            );
          });

          await expect(haloService.getSeriesFromDiscordQueue(neatQueueSeriesData)).rejects.toThrow(
            "Unable to match any of the Discord users to their Xbox accounts",
          );
        });
      });

      describe("caching and performance", () => {
        beforeEach(() => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });
        });

        it("reuses cached Xbox gamertags when available", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "discord_user_02" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(getUsersSpy).toHaveBeenCalledTimes(4);
        });

        it("caches newly fetched Xbox gamertags for future use", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const logInfoSpy = vi.spyOn(logService, "info");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "discord_user_02" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(getUsersSpy).toHaveBeenCalled();
          expect(logInfoSpy).toHaveBeenCalledWith(expect.stringMatching(/Fuzzy match: Discord user.*with score/));
        });

        it("updates user cache with fuzzy match associations", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "discord_user_02" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([expectGameSimilarityAssociation("000000000000000002")]),
          );
        });

        it("preserves existing cache entries while adding new ones", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "discord_user_02" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 2, gamertag: "discord_user_03" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(getUsersSpy).toHaveBeenCalledTimes(4);
        });
      });

      describe("database interaction", () => {
        beforeEach(() => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });
        });

        it("calls updateDiscordAssociations with fuzzy match data when series duration > 10 minutes", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "discord_user_02" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledOnce();
        });

        it("includes fuzzy match associations in database update", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([
              { index: 1, gamertag: "discord_user_02" },
              { index: 2, gamertag: "discord_user_03" },
            ]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expectGameSimilarityAssociation("000000000000000002"),
              expectGameSimilarityAssociation("000000000000000003"),
            ]),
          );
        });

        it("preserves GamesRetrievable status from previous GAME_SIMILARITY associations", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }
                if (id === "000000000000000002") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000002",
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.GAME_SIMILARITY,
                  });
                }

                return aFakeDiscordAssociationsRow({
                  DiscordId: id,
                  XboxId: "",
                  GamesRetrievable: GamesRetrievable.NO,
                  AssociationReason: AssociationReason.DISPLAY_NAME_SEARCH,
                });
              }),
            );
          });

          getUsersSpy.mockImplementation(
            mockGetUsersWithCustomUsers([{ index: 1, gamertag: "discord_user_02_updated" }]),
          );

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expect.objectContaining({
                DiscordId: "000000000000000002",
                AssociationReason: AssociationReason.GAME_SIMILARITY,
                GamesRetrievable: GamesRetrievable.NO,
              }),
            ]),
          );
        });

        it("sets GamesRetrievable to UNKNOWN for new fuzzy match associations", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "discord_user_02" }]));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expect.objectContaining({
                DiscordId: "000000000000000002",
                AssociationReason: AssociationReason.GAME_SIMILARITY,
                GamesRetrievable: GamesRetrievable.UNKNOWN,
              }),
            ]),
          );
        });
      });
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
    it.each([
      {
        matchId: "d81554d7-ddfe-44da-a6cb-000000000ctf",
        gameTypeAndMap: "Capture the Flag: Empyrean - Ranked",
      },
    ])("returns the game type and map for match $matchId", async ({ matchId, gameTypeAndMap }) => {
      const result = await haloService.getGameTypeAndMap(Preconditions.checkExists(matchStats.get(matchId)).MatchInfo);

      expect(result).toBe(gameTypeAndMap);
    });

    it("caches the asset data for the map and game type", async () => {
      const match = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      await haloService.getGameTypeAndMap(match.MatchInfo);
      await haloService.getGameTypeAndMap(match.MatchInfo);

      // Should be called once for map and once for game type
      expect(infiniteClient.getSpecificAssetVersion).toHaveBeenCalledTimes(2);
      // Should not call again on repeated invocation (cache hit)
      await haloService.getGameTypeAndMap(match.MatchInfo);
      expect(infiniteClient.getSpecificAssetVersion).toHaveBeenCalledTimes(2);
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

  describe("getSeriesScore()", () => {
    it("returns default score for empty matches array", () => {
      const result = haloService.getSeriesScore([], "en-US");

      expect(result).toBe("🦅 0:0 🐍");
    });

    it("calculates series score from single match", () => {
      const matches = [Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"))];
      const result = haloService.getSeriesScore(matches, "en-US");

      expect(result).toBe("🦅 1:0 🐍");
    });

    it("calculates series score from multiple matches", () => {
      const matches = [
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")), // Team 0 wins
        Preconditions.checkExists(matchStats.get("e20900f9-4c6c-4003-a175-00000000koth")), // Team 0 wins
        Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")), // Team 1 wins
      ];
      const result = haloService.getSeriesScore(matches, "en-US");

      expect(result).toBe("🦅 2:1 🐍");
    });

    it("skips duplicate matches of same map and game type", () => {
      const ctfMatch = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      const duplicateCtfMatch = {
        ...ctfMatch,
        MatchId: "duplicate-ctf-match",
        // Same map variant and game variant category
      };

      const matches = [ctfMatch, duplicateCtfMatch];
      const result = haloService.getSeriesScore(matches, "en-US");

      // Should only count the first match, skip the duplicate
      expect(result).toBe("🦅 1:0 🐍");
    });

    it("counts separate matches of different maps or game types", () => {
      const matches = [
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")), // Team 0 wins (CTF)
        Preconditions.checkExists(matchStats.get("e20900f9-4c6c-4003-a175-00000000koth")), // Team 0 wins (KOTH)
      ];
      const result = haloService.getSeriesScore(matches, "en-US");

      expect(result).toBe("🦅 2:0 🐍");
    });

    it("formats score with locale", () => {
      const matches = [
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")), // Team 0 wins
        Preconditions.checkExists(matchStats.get("e20900f9-4c6c-4003-a175-00000000koth")), // Team 0 wins
      ];
      const result = haloService.getSeriesScore(matches, "de-DE");

      expect(result).toBe("🦅 2:0 🐍");
    });

    it("handles more than 2 teams", () => {
      // Create a mock match with 3 teams where team 1 wins
      const multiTeamMatch = {
        ...Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Teams: [
          {
            ...Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")?.Teams[0]),
            Outcome: MatchOutcome.Loss,
          },
          {
            ...Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")?.Teams[1]),
            Outcome: MatchOutcome.Win,
          },
          {
            ...Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")?.Teams[0]),
            Outcome: MatchOutcome.Loss,
          },
        ],
      };

      const result = haloService.getSeriesScore([multiTeamMatch], "en-US");

      expect(result).toBe("0:1:0");
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

    it("returns '0s' when the duration is zero", () => {
      const duration = "PT0S";
      const result = haloService.getReadableDuration(duration, "en-US");

      expect(result).toBe("0s");
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

      return expect(haloService.getRecentMatchHistory(gamertag)).rejects.toThrowError(
        new EndUserError(`No user found with gamertag "${gamertag}"`, {
          title: "User not found",
          handled: true,
          errorType: EndUserErrorType.WARNING,
          data: {
            gamertag,
          },
        }),
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
              "AssociationReason": "G",
              "DiscordDisplayNameSearched": "gamertag0000000000004",
              "DiscordId": "000000000000000004",
              "GamesRetrievable": "?",
              "XboxId": "0200000000000000",
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
            {
              "AssociationDate": 1732622400000,
              "AssociationReason": "U",
              "DiscordDisplayNameSearched": null,
              "DiscordId": "000000000000000001",
              "GamesRetrievable": "Y",
              "XboxId": "0000000000001",
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

  describe("wrapPlayerXuid", () => {
    it("wraps a xuid in xuid() format", () => {
      expect(haloService.wrapPlayerXuid("1234567890")).toBe("xuid(1234567890)");
    });
  });

  describe("getRankedArenaCsrs", () => {
    it("returns an empty map if no xuids provided", async () => {
      const result = await haloService.getRankedArenaCsrs([]);
      expect(result.size).toBe(0);
    });

    it("returns a map of xuid to CSR if found", async () => {
      const fakeCsr: PlaylistCsr = {
        Value: 1500,
        Tier: "Diamond",
        SubTier: 6,
        MeasurementMatchesRemaining: 0,
        TierStart: 0,
        NextTier: "Onyx",
        NextTierStart: 1600,
        InitialMeasurementMatches: 10,
        DemotionProtectionMatchesRemaining: 0,
        InitialDemotionProtectionMatches: 5,
        NextSubTier: 0,
      };
      infiniteClient.getPlaylistCsr.mockResolvedValue([
        { Id: "xuid(123)", ResultCode: 0, Result: { Current: fakeCsr, SeasonMax: fakeCsr, AllTimeMax: fakeCsr } },
        {
          Id: "xuid(456)",
          ResultCode: 0,
          Result: { Current: { ...fakeCsr, Value: 1400 }, SeasonMax: fakeCsr, AllTimeMax: fakeCsr },
        },
      ]);
      const result = await haloService.getRankedArenaCsrs(["123", "456"]);
      expect(result.get("123")).toEqual({ Current: fakeCsr, SeasonMax: fakeCsr, AllTimeMax: fakeCsr });
      expect(result.get("456")).toEqual({
        Current: { ...fakeCsr, Value: 1400 },
        SeasonMax: fakeCsr,
        AllTimeMax: fakeCsr,
      });
    });

    it("logs a warning if no CSR found for a xuid", async () => {
      const warnSpy = vi.spyOn(logService, "warn");
      infiniteClient.getPlaylistCsr.mockResolvedValue([]);
      await haloService.getRankedArenaCsrs(["789"]);
      expect(warnSpy).toHaveBeenCalledWith("No CSR found for xuid 789");
    });
  });

  describe("getPlaylistMapModes()", () => {
    it("returns the map modes for a playlist", async () => {
      const result = await haloService.getPlaylistMapModes(FetchablePlaylist.RANKED_ARENA);

      expect(result).toHaveLength(3);
      expect(result).toEqual([
        { mode: "Ranked:King of the Hill", map: "Live Fire - Ranked" },
        { mode: "Ranked:Slayer", map: "Live Fire - Ranked" },
        { mode: "Capture the Flag", map: "Aquarius" },
      ]);
    });

    it("fetches playlist from infinite client", async () => {
      await haloService.getPlaylistMapModes(FetchablePlaylist.RANKED_ARENA);

      expect(infiniteClient.getPlaylist).toHaveBeenCalledOnce();
      expect(infiniteClient.getPlaylist).toHaveBeenCalledWith("edfef3ac-9cbe-4fa2-b949-8f29deafd483");
    });

    it("fetches specific playlist asset version using playlist version id", async () => {
      await haloService.getPlaylistMapModes(FetchablePlaylist.RANKED_ARENA);

      expect(infiniteClient.getSpecificAssetVersion).toHaveBeenCalledWith(
        AssetKind.Playlist,
        "edfef3ac-9cbe-4fa2-b949-8f29deafd483",
        "fc29d7fc-5a05-47a3-9d3b-5206d6fab796",
      );
    });

    it("fetches map mode pair assets for each rotation entry", async () => {
      await haloService.getPlaylistMapModes(FetchablePlaylist.RANKED_ARENA);

      expect(infiniteClient.getSpecificAssetVersion).toHaveBeenCalledWith(
        AssetKind.MapModePair,
        "91957e4b-b5e4-4a11-ac69-dce934fa7002",
        "b000bde4-9a6d-486d-87c7-26dbc4cee721",
      );

      expect(infiniteClient.getSpecificAssetVersion).toHaveBeenCalledWith(
        AssetKind.MapModePair,
        "be1c791b-fbae-4e8d-aeee-9f48df6fee9d",
        "3c670ec5-b4c2-4dba-b3ea-46d70178033c",
      );

      expect(infiniteClient.getSpecificAssetVersion).toHaveBeenCalledWith(
        AssetKind.MapModePair,
        "2bb084c2-a047-4fe9-9023-4100cbe6860d",
        "90309230-ea75-436f-bca9-3732b22c1aa3",
      );
    });

    it("extracts mode from UgcGameVariantLink PublicName", async () => {
      const result = await haloService.getPlaylistMapModes(FetchablePlaylist.RANKED_ARENA);

      const modes = result.map((r) => r.mode);
      expect(modes).toContain("Ranked:King of the Hill");
      expect(modes).toContain("Ranked:Slayer");
      expect(modes).toContain("Capture the Flag");
    });

    it("extracts map from MapLink PublicName", async () => {
      const result = await haloService.getPlaylistMapModes(FetchablePlaylist.RANKED_ARENA);

      const maps = result.map((r) => r.map);
      expect(maps).toContain("Live Fire - Ranked");
      expect(maps).toContain("Aquarius");
    });

    it("handles failed map mode pair fetches by filtering them out", async () => {
      const cleanHaloService = new HaloService({ logService, databaseService, infiniteClient });
      const originalMock = Preconditions.checkExists(infiniteClient.getSpecificAssetVersion.getMockImplementation());

      infiniteClient.getSpecificAssetVersion.mockImplementation(async (assetKind, assetId, versionId) => {
        if (assetKind === AssetKind.MapModePair && assetId === "be1c791b-fbae-4e8d-aeee-9f48df6fee9d") {
          return Promise.reject(new Error("Failed to fetch"));
        }
        return originalMock(assetKind, assetId, versionId);
      });

      const result = await cleanHaloService.getPlaylistMapModes(FetchablePlaylist.RANKED_ARENA);

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { mode: "Ranked:King of the Hill", map: "Live Fire - Ranked" },
        { mode: "Capture the Flag", map: "Aquarius" },
      ]);
    });
  });

  describe("generateMaps", () => {
    let mockRoundRobinFn: MockedFunction<generateRoundRobinMapsFn>;
    let serviceWithMockRoundRobin: HaloService;

    beforeEach(() => {
      mockRoundRobinFn = vi.fn<generateRoundRobinMapsFn>().mockReturnValue([
        { mode: "Slayer", map: "Live Fire" },
        { mode: "Strongholds", map: "Recharge" },
        { mode: "Capture the Flag", map: "Aquarius" },
      ]);
      serviceWithMockRoundRobin = new HaloService({
        logService,
        databaseService,
        infiniteClient,
        roundRobinFn: mockRoundRobinFn,
      });
    });

    it("generates maps using HCS format", () => {
      const result = serviceWithMockRoundRobin.generateMaps({
        count: 3,
        playlist: MapsPlaylistType.HCS_CURRENT,
        format: MapsFormatType.HCS,
      });

      expect(result).toHaveLength(3);
      expect(mockRoundRobinFn).toHaveBeenCalledOnce();

      const [actualArgs] = Preconditions.checkExists(mockRoundRobinFn.mock.calls[0]);

      expect(actualArgs.count).toBe(3);
      expect(actualArgs.formatSequence).toEqual(["objective", "slayer", "objective"]);

      expect(Array.isArray(actualArgs.pool)).toBe(true);
      expect(actualArgs.pool.length).toBeGreaterThan(0);

      for (const item of actualArgs.pool) {
        expect(typeof item).toBe("object");
        expect(item).toHaveProperty("mode");
        expect(item).toHaveProperty("map");
        expect(typeof item.mode).toBe("string");
        expect(typeof item.map).toBe("string");
        expect(["Slayer", "Capture the Flag", "Strongholds", "Oddball", "King of the Hill", "Neutral Bomb"]).toContain(
          item.mode,
        );
        expect(item.map.length).toBeGreaterThan(0);
      }
    });

    it("generates maps using Random format", () => {
      const result = serviceWithMockRoundRobin.generateMaps({
        count: 5,
        playlist: MapsPlaylistType.HCS_CURRENT,
        format: MapsFormatType.RANDOM,
      });

      expect(result).toHaveLength(3);
      expect(mockRoundRobinFn).toHaveBeenCalledOnce();

      const [actualArgs] = Preconditions.checkExists(mockRoundRobinFn.mock.calls[0]);

      expect(actualArgs.count).toBe(5);

      expect(Array.isArray(actualArgs.pool)).toBe(true);
      expect(actualArgs.pool.length).toBeGreaterThan(0);

      for (const item of actualArgs.pool) {
        expect(typeof item).toBe("object");
        expect(item).toHaveProperty("mode");
        expect(item).toHaveProperty("map");
        expect(typeof item.mode).toBe("string");
        expect(typeof item.map).toBe("string");
        expect(["Slayer", "Capture the Flag", "Strongholds", "Oddball", "King of the Hill", "Neutral Bomb"]).toContain(
          item.mode,
        );
        expect(item.map.length).toBeGreaterThan(0);
      }

      expect(Array.isArray(actualArgs.formatSequence)).toBe(true);
      expect(actualArgs.formatSequence.length).toBeGreaterThan(0);
      for (const format of actualArgs.formatSequence) {
        expect(["slayer", "objective"]).toContain(format);
      }
    });
  });
});
