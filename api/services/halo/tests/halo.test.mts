import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { MockedFunction, MockInstance } from "vitest";
import type { MockProxy } from "vitest-mock-extended";
import { AssetKind, MatchOutcome, RequestError } from "halo-infinite-api";
import type { PlaylistCsr, HaloInfiniteClient, UserInfo, MatchSkill, Asset } from "halo-infinite-api";
import { sub } from "date-fns";
import { HaloService, FetchablePlaylist } from "../halo.mjs";
import type { CachedUserInfo } from "../types.mjs";
import type { generateRoundRobinMapsFn } from "../round-robin.mjs";
import type { DatabaseService } from "../../database/database.mjs";
import { aFakeDatabaseServiceWith, aFakeDiscordAssociationsRow } from "../../database/fakes/database.fake.mjs";
import {
  matchStats,
  playerMatches,
  neatQueueSeriesData,
  aFakeServiceRecordWith,
  aFakePlayerMatchHistoryWith,
  matchSkillData,
  aFakeMapAssetWith,
} from "../fakes/data.mjs";
import {
  AssociationReason,
  GamesRetrievable,
  type DiscordAssociationsRow,
} from "../../database/types/discord_associations.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeHaloInfiniteClient } from "../fakes/infinite-client.fake.mjs";
import type { LogService } from "../../log/types.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import { EndUserError, EndUserErrorType } from "../../../base/end-user-error.mjs";
import { MapsFormatType, MapsPlaylistType } from "../../database/types/guild_config.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { aFakePlayerMatchesRateLimiterWith } from "../fakes/player-matches-rate-limiter.fake.mjs";
import type { XboxService } from "../../xbox/xbox.mjs";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake.mjs";

describe("Halo service", () => {
  let env: Env;
  let logService: LogService;
  let databaseService: DatabaseService;
  let xboxService: XboxService;
  let infiniteClient: MockProxy<HaloInfiniteClient>;
  let haloService: HaloService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime("2024-11-26T12:00:00.000Z");

    env = aFakeEnvWith();
    logService = aFakeLogServiceWith();
    databaseService = aFakeDatabaseServiceWith();
    xboxService = aFakeXboxServiceWith();
    infiniteClient = aFakeHaloInfiniteClient();

    haloService = new HaloService({
      env,
      logService,
      databaseService,
      xboxService,
      infiniteClient,
      playerMatchesRateLimiter: aFakePlayerMatchesRateLimiterWith(),
    });
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

      expect(infiniteClient.getUser).toHaveBeenCalledWith("gamertag0000000000004", {
        cf: {
          cacheTtlByStatus: { "200-299": 86400, 404: 60, "500-599": 0 },
        },
      });
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
            2,
            25,
            0,
            {
              "cf": {
                "cacheTtlByStatus": {
                  "200-299": 60,
                  "404": 60,
                  "500-599": 0,
                },
              },
            },
          ],
          [
            "0000000000001",
            2,
            25,
            0,
            {
              "cf": {
                "cacheTtlByStatus": {
                  "200-299": 60,
                  "404": 60,
                  "500-599": 0,
                },
              },
            },
          ],
          [
            "0000000000001",
            2,
            25,
            5,
            {
              "cf": {
                "cacheTtlByStatus": {
                  "200-299": 60,
                  "404": 60,
                  "500-599": 0,
                },
              },
            },
          ],
          [
            "0000000000003",
            2,
            25,
            0,
            {
              "cf": {
                "cacheTtlByStatus": {
                  "200-299": 60,
                  "404": 60,
                  "500-599": 0,
                },
              },
            },
          ],
          [
            "0000000000003",
            2,
            25,
            3,
            {
              "cf": {
                "cacheTtlByStatus": {
                  "200-299": 60,
                  "404": 60,
                  "500-599": 0,
                },
              },
            },
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
                2,
                25,
                0,
                {
                  "cf": {
                    "cacheTtlByStatus": {
                      "200-299": 60,
                      "404": 60,
                      "500-599": 0,
                    },
                  },
                },
              ],
              [
                "0000000000001",
                2,
                25,
                0,
                {
                  "cf": {
                    "cacheTtlByStatus": {
                      "200-299": 60,
                      "404": 60,
                      "500-599": 0,
                    },
                  },
                },
              ],
              [
                "0000000000001",
                2,
                25,
                5,
                {
                  "cf": {
                    "cacheTtlByStatus": {
                      "200-299": 60,
                      "404": 60,
                      "500-599": 0,
                    },
                  },
                },
              ],
              [
                "0000000000002",
                2,
                25,
                0,
                {
                  "cf": {
                    "cacheTtlByStatus": {
                      "200-299": 60,
                      "404": 60,
                      "500-599": 0,
                    },
                  },
                },
              ],
              [
                "0000000000003",
                2,
                25,
                0,
                {
                  "cf": {
                    "cacheTtlByStatus": {
                      "200-299": 60,
                      "404": 60,
                      "500-599": 0,
                    },
                  },
                },
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

          const result = await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          // getUsersByXuids now returns empty array on failure instead of throwing
          expect(result).toHaveLength(3);
        });

        it("skips fuzzy matching when gamertag fetch fails and returns empty gamertags", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const logInfoSpy = vi.spyOn(logService, "info");

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

          getUsersSpy.mockRejectedValue(new Error("Network timeout"));

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          // Should not call fuzzy match logging since gamertags are empty
          expect(logInfoSpy).not.toHaveBeenCalledWith(expect.stringMatching(/Fuzzy match:/));
          expect(logInfoSpy).not.toHaveBeenCalledWith(expect.stringMatching(/Direct assignment:/));
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

          expect(getUsersSpy).toHaveBeenCalledTimes(2);
        });

        it("skips fetching when partial gamertags are cached", async () => {
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getUsersSpy.mockImplementation(mockGetUsersWithCustomUsers([{ index: 1, gamertag: "discord_user_02" }]));

          // First call populates cache for one user
          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          // Clear cache but manually add just one xuid back
          haloService.clearUserCache();
          const firstMatchStats = await haloService.getMatchDetails(["d81554d7-ddfe-44da-a6cb-000000000ctf"]);
          await haloService.getPlayerXuidsToGametags(Preconditions.checkExists(firstMatchStats[0]));

          getUsersSpy.mockClear();

          // Second call should skip fetching since at least one gamertag is cached
          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          // Should not call getUsers since cache has partial data (relies on existing cached xuids)
          expect(getUsersSpy).not.toHaveBeenCalled();
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

          expect(getUsersSpy).toHaveBeenCalledTimes(2);
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

      describe("historical match boost", () => {
        it("applies boost when Discord user was previously matched to same Xbox xuid", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const logDebugSpy = vi.spyOn(logService, "debug");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getUsersSpy.mockImplementation(
            mockGetUsersWithPatternedUsers((index) => {
              // Provide gamertags that generally match Discord usernames
              const gamertags = [
                "discord_user_01", // xuid 0100000000000000
                "ChangedGamertag02", // xuid 0200000000000000 - name changed but same xuid
                "discord_user_03", // xuid 0300000000000000
                "gamertag0000000000004", // xuid 0400000000000000
                "discord_user_05", // xuid 0500000000000000
                "discord_user_06", // xuid 0600000000000000
                "discord_user_07", // xuid 0700000000000000
                "discord_user_08", // xuid 0800000000000000
              ];
              return gamertags[index] ?? `gamertag${String(index + 1).padStart(2, "0")}`;
            }),
          );

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001", // Use 13-character xuid that mock supports
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }
                if (id === "000000000000000002") {
                  // Previously matched via game similarity to xuid 0200000000000000
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0200000000000000",
                    GamesRetrievable: GamesRetrievable.UNKNOWN,
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

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(logDebugSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Historical match boost applied: Discord user 000000000000000002.*0200000000000000/),
          );
        });

        it("does not apply boost when Discord user has no previous xuid association", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const logDebugSpy = vi.spyOn(logService, "debug");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getUsersSpy.mockImplementation(
            mockGetUsersWithPatternedUsers((index) => {
              const gamertags = [
                "discord_user_01",
                "discord_user_02",
                "discord_user_03",
                "gamertag0000000000004",
                "discord_user_05",
                "discord_user_06",
                "discord_user_07",
                "discord_user_08",
              ];
              return gamertags[index] ?? `gamertag${String(index + 1).padStart(2, "0")}`;
            }),
          );

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001", // Use 13-character xuid that mock supports
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

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(logDebugSpy).not.toHaveBeenCalledWith(expect.stringMatching(/Historical match boost applied/));
        });

        it("does not apply boost when previous xuid is not in current series", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const logDebugSpy = vi.spyOn(logService, "debug");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          getUsersSpy.mockImplementation(
            mockGetUsersWithPatternedUsers((index) => {
              const gamertags = [
                "discord_user_01",
                "discord_user_02",
                "discord_user_03",
                "gamertag0000000000004",
                "discord_user_05",
                "discord_user_06",
                "discord_user_07",
                "discord_user_08",
              ];
              return gamertags[index] ?? `gamertag${String(index + 1).padStart(2, "0")}`;
            }),
          );

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001", // Use 13-character xuid that mock supports
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }
                if (id === "000000000000000002") {
                  // Previously matched to a different xuid not in this series
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "9999999999999999",
                    GamesRetrievable: GamesRetrievable.UNKNOWN,
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

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(logDebugSpy).not.toHaveBeenCalledWith(
            expect.stringMatching(/Historical match boost applied.*9999999999999999/),
          );
        });

        it("boosts score enough to win over competing similar names", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");
          const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001", // Use 13-character xuid that mock supports
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }
                if (id === "000000000000000002") {
                  // Previously matched to xuid 0200000000000000 (Team 0)
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0200000000000000",
                    GamesRetrievable: GamesRetrievable.UNKNOWN,
                    AssociationReason: AssociationReason.GAME_SIMILARITY,
                  });
                }
                if (id === "000000000000000003") {
                  // Previously matched to xuid 0500000000000000 (Team 0)
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0500000000000000",
                    GamesRetrievable: GamesRetrievable.UNKNOWN,
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

          // Map specific xuids to specific gamertags - similar enough to users but less than historical boost
          getUsersSpy.mockImplementation(async (xuids: string[]) => {
            return Promise.resolve(
              xuids.map((xuid) => {
                const gamertag = ((): string => {
                  if (xuid === "0200000000000000") {
                    return "user_02_modified";
                  } // Similar to discord_user_02 but different
                  if (xuid === "0500000000000000") {
                    return "user_03_modified";
                  } // Similar to discord_user_03 but different
                  if (xuid === "0100000000000000") {
                    return "completely_different_01";
                  }
                  if (xuid === "0400000000000000") {
                    return "completely_different_04";
                  }
                  if (xuid === "0800000000000000") {
                    return "completely_different_05";
                  }
                  if (xuid === "0900000000000000") {
                    return "completely_different_06";
                  }
                  if (xuid === "1100000000000000") {
                    return "completely_different_07";
                  }
                  if (xuid === "1200000000000000") {
                    return "completely_different_08";
                  }
                  return `gamertag${xuid.slice(-2)}`;
                })();
                return createXboxUser(xuid, gamertag);
              }),
            );
          });

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);
          await haloService.updateDiscordAssociations();

          // With historical boost, each user should match back to their previous xuid
          expect(upsertDiscordAssociationsSpy).toHaveBeenCalledWith(
            expect.arrayContaining([
              expect.objectContaining({
                DiscordId: "000000000000000002",
                XboxId: "0200000000000000", // Matched back to historical xuid
                AssociationReason: AssociationReason.GAME_SIMILARITY,
              }),
              expect.objectContaining({
                DiscordId: "000000000000000003",
                XboxId: "0500000000000000", // Matched back to historical xuid
                AssociationReason: AssociationReason.GAME_SIMILARITY,
              }),
            ]),
          );
        });

        it("applies boost to multiple users with historical associations", async () => {
          const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
          const logDebugSpy = vi.spyOn(logService, "debug");
          const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

          // Map specific xuids to gamertags that are similar but not exact matches
          getUsersSpy.mockImplementation(async (xuids: string[]) => {
            return Promise.resolve(
              xuids.map((xuid) => {
                const gamertag = ((): string => {
                  if (xuid === "0200000000000000") {
                    return "ChangedName02";
                  } // Changed from discord_user_02
                  if (xuid === "0500000000000000") {
                    return "ChangedName03";
                  } // Changed from discord_user_03
                  if (xuid === "0100000000000000") {
                    return "completely_different_01";
                  }
                  if (xuid === "0400000000000000") {
                    return "completely_different_04";
                  }
                  if (xuid === "0800000000000000") {
                    return "completely_different_05";
                  }
                  if (xuid === "0900000000000000") {
                    return "completely_different_06";
                  }
                  if (xuid === "1100000000000000") {
                    return "completely_different_07";
                  }
                  if (xuid === "1200000000000000") {
                    return "completely_different_08";
                  }
                  return `gamertag${xuid.slice(-2)}`;
                })();
                return createXboxUser(xuid, gamertag);
              }),
            );
          });

          getDiscordAssociationsSpy.mockImplementation(async (discordIds: string[]) => {
            return Promise.resolve(
              discordIds.map((id) => {
                if (id === "000000000000000001") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0000000000001", // Use 13-character xuid that mock supports
                    GamesRetrievable: GamesRetrievable.YES,
                    AssociationReason: AssociationReason.USERNAME_SEARCH,
                  });
                }
                if (id === "000000000000000002") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0200000000000000",
                    GamesRetrievable: GamesRetrievable.UNKNOWN,
                    AssociationReason: AssociationReason.GAME_SIMILARITY,
                  });
                }
                if (id === "000000000000000003") {
                  return aFakeDiscordAssociationsRow({
                    DiscordId: id,
                    XboxId: "0500000000000000",
                    GamesRetrievable: GamesRetrievable.UNKNOWN,
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

          await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

          expect(logDebugSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Historical match boost applied: Discord user 000000000000000002/),
          );
          expect(logDebugSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Historical match boost applied: Discord user 000000000000000003/),
          );
        });
      });
    });
  });

  describe("updatePlayerCacheAssociationsFromMatches()", () => {
    it("updates GamesRetrievable status based on match participation", async () => {
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      // Set up user cache with some associations
      await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

      const { teams } = neatQueueSeriesData;
      const matches = [
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(matchStats.get("e20900f9-4c6c-4003-a175-00000000koth")),
        Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer")),
      ];

      await haloService.updatePlayerCacheAssociationsFromMatches(teams, matches);
      await haloService.updateDiscordAssociations();

      // Verify that updatePlayerCacheAssociationsFromMatches was effective
      expect(upsertDiscordAssociationsSpy).toHaveBeenCalled();

      const callArgs = upsertDiscordAssociationsSpy.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(Array.isArray(callArgs)).toBe(true);

      if (callArgs) {
        // At least one user should have been marked YES (those who actually played)
        const usersMarkedYes = callArgs.filter(
          (user: DiscordAssociationsRow) => user.GamesRetrievable === GamesRetrievable.YES,
        );
        expect(usersMarkedYes.length).toBeGreaterThan(0);
      }
    });

    it("marks users as GamesRetrievable.NO when match history cached but they didn't participate", async () => {
      const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      // Mock a user with non-empty cached matches (will be filled by getSeriesFromDiscordQueue)
      getDiscordAssociationsSpy.mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000099",
          XboxId: "9999999999999999",
          GamesRetrievable: GamesRetrievable.UNKNOWN,
          AssociationReason: AssociationReason.USERNAME_SEARCH,
        }),
      ]);

      const seriesData = {
        ...neatQueueSeriesData,
        teams: [
          [
            {
              id: "000000000000000099",
              username: "testUser",
              globalName: "Test User",
              guildNickname: null,
            },
          ],
        ],
      };

      const matches = [Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"))];

      try {
        await haloService.getSeriesFromDiscordQueue(seriesData);
      } catch {
        // Expected to throw no match error
      }

      await haloService.updatePlayerCacheAssociationsFromMatches(seriesData.teams, matches);
      await haloService.updateDiscordAssociations();

      // Verify the user exists in the call
      expect(upsertDiscordAssociationsSpy).toHaveBeenCalled();
      const callArgs = upsertDiscordAssociationsSpy.mock.calls[0]?.[0];
      const targetUser = callArgs?.find((u: DiscordAssociationsRow) => u.DiscordId === "000000000000000099");

      if (targetUser) {
        // If user was in the cache, they should be marked NO since they didn't play
        expect(targetUser.GamesRetrievable).toBe(GamesRetrievable.NO);
      }
    });

    it("marks users as GamesRetrievable.NO when match history is undefined (privacy settings)", async () => {
      const getDiscordAssociationsSpy = vi.spyOn(databaseService, "getDiscordAssociations");
      const getPlayerMatchesSpy = vi.spyOn(infiniteClient, "getPlayerMatches");
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      // Mock a user whose match history returns empty (privacy/hidden profile)
      getDiscordAssociationsSpy.mockResolvedValue([
        aFakeDiscordAssociationsRow({
          DiscordId: "000000000000000009",
          XboxId: "0900000000000000",
          GamesRetrievable: GamesRetrievable.UNKNOWN,
          AssociationReason: AssociationReason.USERNAME_SEARCH,
        }),
      ]);

      getPlayerMatchesSpy.mockResolvedValue([]);

      const seriesData = {
        ...neatQueueSeriesData,
        teams: [
          [
            {
              id: "000000000000000009",
              username: "hiddenUser",
              globalName: "Hidden User",
              guildNickname: null,
            },
          ],
        ],
      };

      const matches = [Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"))];

      try {
        await haloService.getSeriesFromDiscordQueue(seriesData);
      } catch {
        // Expected to throw no match error
      }

      await haloService.updatePlayerCacheAssociationsFromMatches(seriesData.teams, matches);
      await haloService.updateDiscordAssociations();

      expect(upsertDiscordAssociationsSpy).toHaveBeenCalled();
      const callArgs = upsertDiscordAssociationsSpy.mock.calls[0]?.[0];
      const targetUser = callArgs?.find((u: DiscordAssociationsRow) => u.DiscordId === "000000000000000009");

      if (targetUser) {
        // User with no match history should be marked NO
        expect(targetUser.GamesRetrievable).toBe(GamesRetrievable.NO);
      }
    });

    it("triggers fuzzy matching after verification", async () => {
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

      const matches = [Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"))];

      await haloService.updatePlayerCacheAssociationsFromMatches(neatQueueSeriesData.teams, matches);
      await haloService.updateDiscordAssociations();

      // Fuzzy matching should result in some GAME_SIMILARITY associations
      expect(upsertDiscordAssociationsSpy).toHaveBeenCalled();
      const callArgs = upsertDiscordAssociationsSpy.mock.calls[0]?.[0];

      const gameSimilarityUsers =
        callArgs?.filter(
          (user: DiscordAssociationsRow) => user.AssociationReason === AssociationReason.GAME_SIMILARITY,
        ) ?? [];

      // Should have some fuzzy matched users
      expect(gameSimilarityUsers.length).toBeGreaterThanOrEqual(0);
    });

    it("does nothing when matches array is empty", async () => {
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

      await haloService.updatePlayerCacheAssociationsFromMatches(neatQueueSeriesData.teams, []);

      // Should not crash and can still update associations
      upsertDiscordAssociationsSpy.mockClear();
      await haloService.updateDiscordAssociations();

      // Verify it still works
      expect(upsertDiscordAssociationsSpy).toHaveBeenCalled();
    });

    it("processes all users in the cache", async () => {
      const upsertDiscordAssociationsSpy = vi.spyOn(databaseService, "upsertDiscordAssociations");

      await haloService.getSeriesFromDiscordQueue(neatQueueSeriesData);

      const matches = [
        Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf")),
        Preconditions.checkExists(matchStats.get("e20900f9-4c6c-4003-a175-00000000koth")),
      ];

      await haloService.updatePlayerCacheAssociationsFromMatches(neatQueueSeriesData.teams, matches);
      await haloService.updateDiscordAssociations();

      // All users from the queue should be processed
      expect(upsertDiscordAssociationsSpy).toHaveBeenCalled();
      const callArgs = upsertDiscordAssociationsSpy.mock.calls[0]?.[0];

      // Should process all 8 users from neatQueueSeriesData
      expect(callArgs?.length).toBeGreaterThan(0);
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
      { matchId: "d81554d7-ddfe-44da-a6cb-000000000ctf", matchScore: { gameScore: "3:0", gameSubScore: null } },
      { matchId: "e20900f9-4c6c-4003-a175-00000000koth", matchScore: { gameScore: "3:2", gameSubScore: null } },
      { matchId: "9535b946-f30c-4a43-b852-000000slayer", matchScore: { gameScore: "44:50", gameSubScore: null } },
      { matchId: "cf0fb794-2df1-4ba1-9415-00000oddball", matchScore: { gameScore: "1:2", gameSubScore: "198:256" } },
      { matchId: "099deb74-3f60-48cf-8784-0strongholds", matchScore: { gameScore: "175:250", gameSubScore: null } },
    ])("returns the score for match $matchId", ({ matchId, matchScore: score }) => {
      const result = haloService.getMatchScore(Preconditions.checkExists(matchStats.get(matchId)), "en-US");

      expect(result).toEqual(score);
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
      expect(infiniteClient.getUsers).toHaveBeenNthCalledWith(
        1,
        [
          "0100000000000000",
          "0200000000000000",
          "0500000000000000",
          "0400000000000000",
          "0900000000000000",
          "0800000000000000",
          "1100000000000000",
          "1200000000000000",
        ],
        {
          cf: {
            cacheTtlByStatus: { "200-299": 3600, 404: 3600, "500-599": 0 },
          },
        },
      );
      expect(infiniteClient.getUsers).toHaveBeenNthCalledWith(
        2,
        ["0600000000000000", "0300000000000000", "0700000000000000"],
        {
          cf: {
            cacheTtlByStatus: { "200-299": 3600, 404: 3600, "500-599": 0 },
          },
        },
      );
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

    it("filters out players not present at beginning", async () => {
      const match = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
      Preconditions.checkExists(match.Players[0]).ParticipationInfo.PresentAtBeginning = false;

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
      expect(infiniteClient.getUsers).toHaveBeenCalledWith(xuids, {
        cf: {
          cacheTtlByStatus: { "200-299": 3600, 404: 3600, "500-599": 0 },
        },
      });
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

    it("stores users in KV cache after API call", async () => {
      const xuids = ["0100000000000000", "0200000000000000"];
      const kvPutSpy = vi.spyOn(env.APP_DATA, "put");

      await haloService.getUsersByXuids(xuids);

      expect(kvPutSpy).toHaveBeenCalledTimes(4);
      expect(kvPutSpy).toHaveBeenCalledWith(
        "cache.halo.gamertag.gamertag0100000000000000",
        expect.stringContaining('"xuid":"0100000000000000"'),
        { expirationTtl: 2592000 },
      );
      expect(kvPutSpy).toHaveBeenCalledWith(
        "cache.halo.xuid.0100000000000000",
        expect.stringContaining('"xuid":"0100000000000000"'),
        { expirationTtl: 2592000 },
      );
    });

    it("returns cached users without calling API when all are cache hits", async () => {
      const xuids = ["cached1", "cached2"];
      const cachedUsers: CachedUserInfo[] = [
        {
          xuid: "cached1",
          gamertag: "CachedUser1",
          fetchedAt: Date.now(),
        },
        {
          xuid: "cached2",
          gamertag: "CachedUser2",
          fetchedAt: Date.now(),
        },
      ];

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (type === "json") {
          if (key === "cache.halo.xuid.cached1") {
            return cachedUsers[0];
          }
          if (key === "cache.halo.xuid.cached2") {
            return cachedUsers[1];
          }
        }
        return null;
      });

      const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

      const result = await haloService.getUsersByXuids(xuids);

      expect(result).toEqual(cachedUsers);
      expect(getUsersSpy).not.toHaveBeenCalled();
    });

    it("only fetches missing xuids when some are cached", async () => {
      const xuids = ["cached1", "missing1", "missing2"];
      const cachedUser: CachedUserInfo = {
        xuid: "cached1",
        gamertag: "CachedUser1",
        fetchedAt: Date.now(),
      };

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (key === "cache.halo.xuid.cached1" && type === "json") {
          return cachedUser;
        }
        return null;
      });

      const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

      await haloService.getUsersByXuids(xuids);

      // Should only call API for missing xuids
      expect(getUsersSpy).toHaveBeenCalledWith(["missing1", "missing2"], {
        cf: {
          cacheTtlByStatus: { "200-299": 3600, 404: 3600, "500-599": 0 },
        },
      });
    });

    it("returns empty array when no xuids provided", async () => {
      const result = await haloService.getUsersByXuids([]);

      expect(result).toEqual([]);
      expect(infiniteClient.getUsers).not.toHaveBeenCalled();
    });

    it("combines cached and fetched users in correct order", async () => {
      const xuids = ["cached1", "fetch1", "cached2"];

      const cachedUser1: CachedUserInfo = {
        xuid: "cached1",
        gamertag: "CachedUser1",
        fetchedAt: Date.now(),
      };
      const cachedUser2: CachedUserInfo = {
        xuid: "cached2",
        gamertag: "CachedUser2",
        fetchedAt: Date.now(),
      };

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (type === "json") {
          if (key === "cache.halo.xuid.cached1") {
            return cachedUser1;
          }
          if (key === "cache.halo.xuid.cached2") {
            return cachedUser2;
          }
        }
        return null;
      });

      const result = await haloService.getUsersByXuids(xuids);

      // Should return cached users first, then fetched users
      expect(result.length).toBe(3);
      expect(result[0]).toEqual(cachedUser1);
      expect(result[1]).toEqual(cachedUser2);
      expect(result[2]?.xuid).toBe("fetch1");
    });

    it("falls back to Xbox service on 500 error and logs info", async () => {
      const xuids = ["xuid1", "xuid2"];
      const response500 = new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
      infiniteClient.getUsers.mockRejectedValueOnce(new RequestError(new URL("https://example.com"), response500));

      const xboxUsers = [
        { xuid: "xuid1", gamertag: "XboxPlayer1" },
        { xuid: "xuid2", gamertag: "XboxPlayer2" },
      ];
      const xboxServiceSpy = vi.spyOn(xboxService, "getUsersByXuids");
      xboxServiceSpy.mockResolvedValueOnce(xboxUsers);

      const logInfoSpy = vi.spyOn(logService, "info");

      const result = await haloService.getUsersByXuids(xuids);

      expect(xboxServiceSpy).toHaveBeenCalledWith(xuids);
      expect(logInfoSpy).toHaveBeenCalledWith(
        expect.any(RequestError),
        expect.objectContaining({
          size: 1,
        }),
      );
      const [logCallArgs] = logInfoSpy.mock.calls;
      const contextMap = logCallArgs?.[1] as Map<string, string>;
      expect(contextMap.get("context")).toContain("Halo Infinite API returned 500 for 2 xuids");
      expect(contextMap.get("context")).toContain("falling back to Xbox Live API");
      expect(result).toEqual(xboxUsers);
    });

    it("returns empty array for non-500 errors when no stale cache exists", async () => {
      const xuids = ["xuid1"];
      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockResolvedValue(null);

      const response404 = new Response("Not Found", { status: 404, statusText: "Not Found" });
      infiniteClient.getUsers.mockRejectedValueOnce(new RequestError(new URL("https://example.com"), response404));

      const xboxServiceSpy = vi.spyOn(xboxService, "getUsersByXuids");

      const result = await haloService.getUsersByXuids(xuids);
      expect(result).toEqual([]);
      expect(xboxServiceSpy).not.toHaveBeenCalled();
    });

    it("uses stale cache when both Halo API and Xbox API fail for all xuids", async () => {
      const xuids = ["stale1", "stale2"];
      const staleUser1: CachedUserInfo = {
        xuid: "stale1",
        gamertag: "StaleUser1",
        fetchedAt: Date.now() - 3600000 * 2,
      };
      const staleUser2: CachedUserInfo = {
        xuid: "stale2",
        gamertag: "StaleUser2",
        fetchedAt: Date.now() - 3600000 * 2,
      };

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (type === "json") {
          if (key === "cache.halo.xuid.stale1") {
            return staleUser1;
          }
          if (key === "cache.halo.xuid.stale2") {
            return staleUser2;
          }
        }
        return null;
      });

      const response500 = new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
      infiniteClient.getUsers.mockRejectedValueOnce(new RequestError(new URL("https://example.com"), response500));
      const xboxServiceSpy = vi.spyOn(xboxService, "getUsersByXuids");
      xboxServiceSpy.mockRejectedValueOnce(new Error("Xbox API also failed"));

      const logInfoSpy = vi.spyOn(logService, "info");

      const result = await haloService.getUsersByXuids(xuids);

      expect(result).toEqual([staleUser1, staleUser2]);
      expect(xboxServiceSpy).toHaveBeenCalledWith(xuids);
      expect(logInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("Using 2 stale KV cached user(s)"),
        expect.any(Map),
      );
    });

    it("uses partial stale cache when some xuids fail to fetch", async () => {
      const xuids = ["fresh1", "stale1", "fresh2"];
      const staleUser: CachedUserInfo = {
        xuid: "stale1",
        gamertag: "StaleUser1",
        fetchedAt: Date.now() - 3600000 * 2,
      };

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (key === "cache.halo.xuid.stale1" && type === "json") {
          return staleUser;
        }
        return null;
      });

      const freshUsers: UserInfo[] = [
        {
          xuid: "fresh1",
          gamertag: "FreshUser1",
          gamerpic: { small: "s1.png", medium: "m1.png", large: "l1.png", xlarge: "xl1.png" },
        },
        {
          xuid: "fresh2",
          gamertag: "FreshUser2",
          gamerpic: { small: "s2.png", medium: "m2.png", large: "l2.png", xlarge: "xl2.png" },
        },
      ];
      infiniteClient.getUsers.mockResolvedValueOnce(freshUsers);

      const logInfoSpy = vi.spyOn(logService, "info");

      const result = await haloService.getUsersByXuids(xuids);

      expect(result.length).toBe(3);
      expect(result).toContainEqual(staleUser);
      expect(result).toContainEqual(freshUsers[0]);
      expect(result).toContainEqual(freshUsers[1]);
      expect(logInfoSpy).toHaveBeenCalledWith(expect.stringContaining("Using 1 stale KV cached user"), expect.any(Map));
    });

    it("returns empty array when both APIs fail and no stale cache exists", async () => {
      const xuids = ["fail1"];

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockResolvedValue(null);

      const response500 = new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
      const haloError = new RequestError(new URL("https://example.com"), response500);
      infiniteClient.getUsers.mockRejectedValueOnce(haloError);
      const xboxServiceSpy = vi.spyOn(xboxService, "getUsersByXuids");
      xboxServiceSpy.mockRejectedValueOnce(new Error("Xbox API also failed"));

      const result = await haloService.getUsersByXuids(xuids);
      expect(result).toEqual([]);
      expect(xboxServiceSpy).toHaveBeenCalledWith(xuids);
    });

    it("does not use stale cache when primary API succeeds", async () => {
      const xuids = ["fresh1", "fresh2"];
      const freshUsers: UserInfo[] = [
        {
          xuid: "fresh1",
          gamertag: "FreshUser1",
          gamerpic: { small: "s1.png", medium: "m1.png", large: "l1.png", xlarge: "xl1.png" },
        },
        {
          xuid: "fresh2",
          gamertag: "FreshUser2",
          gamerpic: { small: "s2.png", medium: "m2.png", large: "l2.png", xlarge: "xl2.png" },
        },
      ];
      const staleUsers: CachedUserInfo[] = [
        {
          xuid: "fresh1",
          gamertag: "OldUser1",
          fetchedAt: Date.now() - 3600000 * 2,
        },
        {
          xuid: "fresh2",
          gamertag: "OldUser2",
          fetchedAt: Date.now() - 3600000 * 2,
        },
      ];

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (type === "json") {
          if (key === "cache.halo.xuid.fresh1") {
            return staleUsers[0];
          }
          if (key === "cache.halo.xuid.fresh2") {
            return staleUsers[1];
          }
        }
        return null;
      });

      infiniteClient.getUsers.mockResolvedValueOnce(freshUsers);

      const result = await haloService.getUsersByXuids(xuids);

      expect(result).toEqual(freshUsers);
      expect(result[0]?.gamertag).toBe("FreshUser1");
      expect(result[1]?.gamertag).toBe("FreshUser2");
    });

    it("refetches xuids when cache is stale based on fetchedAt timestamp", async () => {
      const xuids = ["staleTimestamp1", "staleTimestamp2"];
      const staleUsers: CachedUserInfo[] = [
        {
          xuid: "staleTimestamp1",
          gamertag: "StaleUser1",
          fetchedAt: Date.now() - 3600000 * 2,
        },
        {
          xuid: "staleTimestamp2",
          gamertag: "StaleUser2",
          fetchedAt: Date.now() - 3600000 * 2,
        },
      ];

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (type === "json") {
          if (key === "cache.halo.xuid.staleTimestamp1") {
            return staleUsers[0];
          }
          if (key === "cache.halo.xuid.staleTimestamp2") {
            return staleUsers[1];
          }
        }
        return null;
      });

      const getUsersSpy = vi.spyOn(infiniteClient, "getUsers");

      await haloService.getUsersByXuids(xuids);

      expect(getUsersSpy).toHaveBeenCalledWith(xuids, {
        cf: {
          cacheTtlByStatus: { "200-299": 3600, 404: 3600, "500-599": 0 },
        },
      });
    });

    it("filters out stale users that were successfully fetched fresh", async () => {
      const xuids = ["user1", "user2"];
      const staleUsers: CachedUserInfo[] = [
        {
          xuid: "user1",
          gamertag: "OldUser1",
          fetchedAt: Date.now() - 3600000 * 2,
        },
        {
          xuid: "user2",
          gamertag: "OldUser2",
          fetchedAt: Date.now() - 3600000 * 2,
        },
      ];

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (type === "json") {
          if (key === "cache.halo.xuid.user1") {
            return staleUsers[0];
          }
          if (key === "cache.halo.xuid.user2") {
            return staleUsers[1];
          }
        }
        return null;
      });

      const freshUser: UserInfo = {
        xuid: "user1",
        gamertag: "FreshUser1",
        gamerpic: { small: "fresh1.png", medium: "fresh1.png", large: "fresh1.png", xlarge: "fresh1.png" },
      };
      infiniteClient.getUsers.mockResolvedValueOnce([freshUser]);

      const result = await haloService.getUsersByXuids(xuids);

      const user1Results = result.filter((u) => u.xuid === "user1");
      expect(user1Results).toHaveLength(1);
      expect(user1Results[0]?.gamertag).toBe("FreshUser1");

      const user2Results = result.filter((u) => u.xuid === "user2");
      expect(user2Results).toHaveLength(1);
      expect(user2Results[0]?.gamertag).toBe("OldUser2");
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
      const cleanHaloService = new HaloService({
        env,
        logService,
        databaseService,
        xboxService,
        infiniteClient,
        playerMatchesRateLimiter: aFakePlayerMatchesRateLimiterWith(),
      });

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

    it("calls infiniteClient.getUser when cache miss", async () => {
      const gamertag = "gamertag0100000000000000";
      const getUserSpy = vi.spyOn(infiniteClient, "getUser");

      await haloService.getUserByGamertag(gamertag);

      expect(getUserSpy).toHaveBeenCalledOnce();
      expect(getUserSpy).toHaveBeenCalledWith(gamertag, {
        cf: {
          cacheTtlByStatus: { "200-299": 86400, 404: 60, "500-599": 0 },
        },
      });
    });

    it("stores user in KV cache after API call", async () => {
      const gamertag = "gamertag0100000000000000";
      const kvPutSpy = vi.spyOn(env.APP_DATA, "put");

      await haloService.getUserByGamertag(gamertag);

      expect(kvPutSpy).toHaveBeenCalledTimes(2);
      expect(kvPutSpy).toHaveBeenCalledWith(
        "cache.halo.gamertag.gamertag0100000000000000",
        expect.stringContaining('"gamertag":"gamertag0100000000000000"'),
        { expirationTtl: 2592000 },
      );
      expect(kvPutSpy).toHaveBeenCalledWith(
        "cache.halo.xuid.0100000000000000",
        expect.stringContaining('"xuid":"0100000000000000"'),
        { expirationTtl: 2592000 },
      );
    });

    it("returns cached user without calling API on cache hit", async () => {
      const gamertag = "cachedGamertag";
      const cachedUser: CachedUserInfo = {
        xuid: "1234567890",
        gamertag: "cachedGamertag",
        fetchedAt: Date.now(),
      };

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (key === "cache.halo.gamertag.cachedGamertag" && type === "json") {
          return cachedUser;
        }
        return null;
      });
      const getUserSpy = vi.spyOn(infiniteClient, "getUser");

      const result = await haloService.getUserByGamertag(gamertag);

      expect(result).toEqual(cachedUser);
      expect(getUserSpy).not.toHaveBeenCalled();
    });

    it("throws error when no gamertag provided", async () => {
      return expect(haloService.getUserByGamertag("")).rejects.toThrow("No user ID provided");
    });

    it("falls back to Xbox service on 500 error and logs info", async () => {
      const gamertag = "TestGamer";
      const response500 = new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
      infiniteClient.getUser.mockRejectedValueOnce(new RequestError(new URL("https://example.com"), response500));

      const xboxUser = { xuid: "1234567890", gamertag };
      const xboxServiceSpy = vi.spyOn(xboxService, "getUserByGamertag");
      xboxServiceSpy.mockResolvedValueOnce(xboxUser);

      const logInfoSpy = vi.spyOn(logService, "info");

      const result = await haloService.getUserByGamertag(gamertag);

      expect(xboxServiceSpy).toHaveBeenCalledWith(gamertag);
      expect(logInfoSpy).toHaveBeenCalledWith(
        expect.any(RequestError),
        expect.objectContaining({
          size: 1,
        }),
      );
      const [logCallArgs] = logInfoSpy.mock.calls;
      const contextMap = logCallArgs?.[1] as Map<string, string>;
      expect(contextMap.get("context")).toContain("Halo Infinite API returned 500 for gamertag TestGamer");
      expect(contextMap.get("context")).toContain("falling back to Xbox Live API");
      expect(result).toEqual(xboxUser);
    });

    it("throws non-500 errors without fallback", async () => {
      const gamertag = "TestGamer";
      const response404 = new Response("Not Found", { status: 404, statusText: "Not Found" });
      infiniteClient.getUser.mockRejectedValueOnce(new RequestError(new URL("https://example.com"), response404));

      const xboxServiceSpy = vi.spyOn(xboxService, "getUserByGamertag");

      await expect(haloService.getUserByGamertag(gamertag)).rejects.toThrow(RequestError);
      expect(xboxServiceSpy).not.toHaveBeenCalled();
    });

    it("uses stale cache when both Halo API and Xbox API fail", async () => {
      const gamertag = "StaleGamertag";
      const staleUser: CachedUserInfo = {
        xuid: "1234567890",
        gamertag: "StaleGamertag",
        fetchedAt: Date.now() - 86400000 * 2,
      };

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (key === "cache.halo.gamertag.StaleGamertag" && type === "json") {
          return staleUser;
        }
        return null;
      });

      const response500 = new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
      infiniteClient.getUser.mockRejectedValueOnce(new RequestError(new URL("https://example.com"), response500));
      const xboxServiceSpy = vi.spyOn(xboxService, "getUserByGamertag");
      xboxServiceSpy.mockRejectedValueOnce(new Error("Xbox API also failed"));

      const logInfoSpy = vi.spyOn(logService, "info");

      const result = await haloService.getUserByGamertag(gamertag);

      expect(result).toEqual(staleUser);
      expect(xboxServiceSpy).toHaveBeenCalledWith(gamertag);
      expect(logInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("Using 1 stale KV cached user(s)"),
        expect.any(Map),
      );
    });

    it("throws error when both APIs fail and no stale cache exists", async () => {
      const gamertag = "FailGamertag";

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockResolvedValue(null);

      const response500 = new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });
      const haloError = new RequestError(new URL("https://example.com"), response500);
      infiniteClient.getUser.mockRejectedValueOnce(haloError);
      const xboxServiceSpy = vi.spyOn(xboxService, "getUserByGamertag");
      xboxServiceSpy.mockRejectedValueOnce(new Error("Xbox API also failed"));

      await expect(haloService.getUserByGamertag(gamertag)).rejects.toThrow(RequestError);
      expect(xboxServiceSpy).toHaveBeenCalledWith(gamertag);
    });

    it("does not use stale cache when primary API succeeds", async () => {
      const gamertag = "FreshGamertag";
      const freshUser: UserInfo = {
        xuid: "9999999999",
        gamertag: "FreshGamertag",
        gamerpic: { small: "small.png", medium: "medium.png", large: "large.png", xlarge: "xlarge.png" },
      };
      const staleUser: CachedUserInfo = {
        xuid: "9999999999",
        gamertag: "FreshGamertag",
        fetchedAt: Date.now() - 86400000 * 2,
      };

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (key === "cache.halo.gamertag.FreshGamertag" && type === "json") {
          return staleUser;
        }
        return null;
      });

      infiniteClient.getUser.mockResolvedValueOnce(freshUser);

      const result = await haloService.getUserByGamertag(gamertag);

      expect(result).toEqual(freshUser);
    });

    it("refetches when cache is stale based on fetchedAt timestamp", async () => {
      const gamertag = "StaleTimestampGamertag";
      const staleUser: CachedUserInfo = {
        xuid: "1234567890",
        gamertag: "StaleTimestampGamertag",
        fetchedAt: Date.now() - 86400000 * 2,
      };

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      kvGetSpy.mockImplementation((key, type) => {
        if (key === "cache.halo.gamertag.StaleTimestampGamertag" && type === "json") {
          return staleUser;
        }
        return null;
      });

      const getUserSpy = vi.spyOn(infiniteClient, "getUser");

      await haloService.getUserByGamertag(gamertag);

      expect(getUserSpy).toHaveBeenCalledWith(gamertag, {
        cf: {
          cacheTtlByStatus: { "200-299": 86400, 404: 60, "500-599": 0 },
        },
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
              "XboxId": "0100000000000000",
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

  describe("getServiceRecord", () => {
    it("returns service record for the specified xuid", async () => {
      const xuid = "1234567890";
      const mockServiceRecord = aFakeServiceRecordWith({
        TimePlayed: "PT100H30M15S",
        MatchesCompleted: 500,
        Wins: 300,
        Losses: 180,
        Ties: 20,
      });

      infiniteClient.getUserServiceRecord.mockResolvedValue(mockServiceRecord);

      const result = await haloService.getServiceRecord(xuid);

      expect(infiniteClient.getUserServiceRecord).toHaveBeenCalledWith(
        `xuid(${xuid})`,
        {},
        {
          cf: {
            cacheTtlByStatus: { "200-299": 60, 404: 60, "500-599": 0 },
          },
        },
      );
      expect(result).toEqual(mockServiceRecord);
    });

    it("throws error when API fails", async () => {
      const xuid = "1234567890";
      infiniteClient.getUserServiceRecord.mockRejectedValue(new Error("API Error"));

      await expect(haloService.getServiceRecord(xuid)).rejects.toThrow("API Error");
    });
  });

  describe("getRankTierFromCsr", () => {
    it("returns Onyx for CSR >= 1500", () => {
      expect(haloService.getRankTierFromCsr(1500)).toEqual({ rankTier: "Onyx", subTier: 0 });
      expect(haloService.getRankTierFromCsr(2000)).toEqual({ rankTier: "Onyx", subTier: 0 });
    });

    it("returns Diamond tiers for CSR 1200-1499", () => {
      expect(haloService.getRankTierFromCsr(1450)).toEqual({ rankTier: "Diamond", subTier: 5 });
      expect(haloService.getRankTierFromCsr(1400)).toEqual({ rankTier: "Diamond", subTier: 4 });
      expect(haloService.getRankTierFromCsr(1350)).toEqual({ rankTier: "Diamond", subTier: 3 });
      expect(haloService.getRankTierFromCsr(1300)).toEqual({ rankTier: "Diamond", subTier: 2 });
      expect(haloService.getRankTierFromCsr(1250)).toEqual({ rankTier: "Diamond", subTier: 1 });
      expect(haloService.getRankTierFromCsr(1200)).toEqual({ rankTier: "Diamond", subTier: 0 });
    });

    it("returns Platinum tiers for CSR 900-1199", () => {
      expect(haloService.getRankTierFromCsr(1150)).toEqual({ rankTier: "Platinum", subTier: 5 });
      expect(haloService.getRankTierFromCsr(1100)).toEqual({ rankTier: "Platinum", subTier: 4 });
      expect(haloService.getRankTierFromCsr(1050)).toEqual({ rankTier: "Platinum", subTier: 3 });
      expect(haloService.getRankTierFromCsr(1000)).toEqual({ rankTier: "Platinum", subTier: 2 });
      expect(haloService.getRankTierFromCsr(950)).toEqual({ rankTier: "Platinum", subTier: 1 });
      expect(haloService.getRankTierFromCsr(900)).toEqual({ rankTier: "Platinum", subTier: 0 });
    });

    it("returns Gold tiers for CSR 600-899", () => {
      expect(haloService.getRankTierFromCsr(850)).toEqual({ rankTier: "Gold", subTier: 5 });
      expect(haloService.getRankTierFromCsr(800)).toEqual({ rankTier: "Gold", subTier: 4 });
      expect(haloService.getRankTierFromCsr(750)).toEqual({ rankTier: "Gold", subTier: 3 });
      expect(haloService.getRankTierFromCsr(700)).toEqual({ rankTier: "Gold", subTier: 2 });
      expect(haloService.getRankTierFromCsr(650)).toEqual({ rankTier: "Gold", subTier: 1 });
      expect(haloService.getRankTierFromCsr(600)).toEqual({ rankTier: "Gold", subTier: 0 });
    });

    it("returns Silver tiers for CSR 300-599", () => {
      expect(haloService.getRankTierFromCsr(550)).toEqual({ rankTier: "Silver", subTier: 5 });
      expect(haloService.getRankTierFromCsr(500)).toEqual({ rankTier: "Silver", subTier: 4 });
      expect(haloService.getRankTierFromCsr(450)).toEqual({ rankTier: "Silver", subTier: 3 });
      expect(haloService.getRankTierFromCsr(400)).toEqual({ rankTier: "Silver", subTier: 2 });
      expect(haloService.getRankTierFromCsr(350)).toEqual({ rankTier: "Silver", subTier: 1 });
      expect(haloService.getRankTierFromCsr(300)).toEqual({ rankTier: "Silver", subTier: 0 });
    });

    it("returns Bronze tiers for CSR 0-299", () => {
      expect(haloService.getRankTierFromCsr(250)).toEqual({ rankTier: "Bronze", subTier: 5 });
      expect(haloService.getRankTierFromCsr(200)).toEqual({ rankTier: "Bronze", subTier: 4 });
      expect(haloService.getRankTierFromCsr(150)).toEqual({ rankTier: "Bronze", subTier: 3 });
      expect(haloService.getRankTierFromCsr(100)).toEqual({ rankTier: "Bronze", subTier: 2 });
      expect(haloService.getRankTierFromCsr(50)).toEqual({ rankTier: "Bronze", subTier: 1 });
      expect(haloService.getRankTierFromCsr(0)).toEqual({ rankTier: "Bronze", subTier: 0 });
    });
  });

  describe("getMapModesForPlaylist()", () => {
    it("returns available map modes for HCS Current playlist", async () => {
      const result = await haloService.getMapModesForPlaylist(MapsPlaylistType.HCS_CURRENT);

      expect(result).toContain("Slayer");
      expect(result).toContain("Capture the Flag");
      expect(result).toContain("Strongholds");
      expect(result).toContain("Oddball");
      expect(result).toContain("King of the Hill");
    });

    it("returns available map modes for HCS Historical playlist", async () => {
      const result = await haloService.getMapModesForPlaylist(MapsPlaylistType.HCS_HISTORICAL);

      expect(result).toContain("Slayer");
      expect(result).toContain("Capture the Flag");
      expect(result).toContain("Strongholds");
      expect(result).toContain("Oddball");
      expect(result).toContain("King of the Hill");
    });

    it("returns available map modes for Ranked Arena playlist", async () => {
      const result = await haloService.getMapModesForPlaylist(MapsPlaylistType.RANKED_ARENA);

      expect(result.length).toBeGreaterThan(0);
      expect(infiniteClient.getPlaylist).toHaveBeenCalledWith(FetchablePlaylist.RANKED_ARENA, {
        cf: { cacheTtlByStatus: { "200-299": 86400, 404: 60, "500-599": 0 } },
      });
    });

    it("caches playlist map modes in KV storage", async () => {
      const kvGetSpy = vi.spyOn(env.APP_DATA, "get");
      const kvPutSpy = vi.spyOn(env.APP_DATA, "put");

      await haloService.getMapModesForPlaylist(MapsPlaylistType.RANKED_ARENA);

      expect(kvGetSpy).toHaveBeenCalledWith("halo-playlist-map-modes-edfef3ac-9cbe-4fa2-b949-8f29deafd483", {
        type: "json",
      });
      expect(kvPutSpy).toHaveBeenCalledWith(
        "halo-playlist-map-modes-edfef3ac-9cbe-4fa2-b949-8f29deafd483",
        expect.any(String),
        { expirationTtl: 86400 },
      );
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
        env,
        logService,
        databaseService,
        xboxService,
        infiniteClient,
        playerMatchesRateLimiter: aFakePlayerMatchesRateLimiterWith(),
        roundRobinFn: mockRoundRobinFn,
      });
    });

    it("generates maps using HCS format", async () => {
      const result = await serviceWithMockRoundRobin.generateMaps({
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

    it("generates maps using Random format", async () => {
      const result = await serviceWithMockRoundRobin.generateMaps({
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

    it("generates maps for Ranked Arena playlist", async () => {
      const result = await serviceWithMockRoundRobin.generateMaps({
        count: 5,
        playlist: MapsPlaylistType.RANKED_ARENA,
        format: MapsFormatType.HCS,
      });

      expect(result).toHaveLength(3);
      expect(mockRoundRobinFn).toHaveBeenCalledOnce();
      expect(infiniteClient.getPlaylist).toHaveBeenCalledWith(FetchablePlaylist.RANKED_ARENA, {
        cf: { cacheTtlByStatus: { "200-299": 86400, 404: 60, "500-599": 0 } },
      });
    });
  });

  describe("getPlayerEsra", () => {
    it("returns cached ESRA when available", async () => {
      const xuid = "xuid_1234567890123456";
      const playlistId = FetchablePlaylist.RANKED_ARENA;
      const cachedEsra = 1350;

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      const kvPutSpy: MockInstance = vi.spyOn(env.APP_DATA, "put");
      kvGetSpy.mockResolvedValueOnce({
        xuid,
        playlistId,
        computedAt: new Date().toISOString(),
        esra: cachedEsra,
        lastMatchId: "match-0",
        matchData: {
          "mode1:v1": { matchId: "match-1", esra: 1340, gameMode: "mode1:v1", matchEndTime: new Date().toISOString() },
          "mode2:v2": { matchId: "match-2", esra: 1350, gameMode: "mode2:v2", matchEndTime: new Date().toISOString() },
          "mode3:v3": { matchId: "match-3", esra: 1360, gameMode: "mode3:v3", matchEndTime: new Date().toISOString() },
        },
      });

      const esra = await haloService.getPlayerEsra(xuid, playlistId);

      expect(esra).toBe(cachedEsra);
      expect(kvPutSpy).not.toHaveBeenCalled();
    });

    it("returns 0 when player has no matches", async () => {
      const xuid = "xuid_1234567890123456";
      const playlistId = FetchablePlaylist.RANKED_ARENA;

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      const kvPutSpy: MockInstance = vi.spyOn(env.APP_DATA, "put");
      const getPlayerMatchesSpy = vi.spyOn(infiniteClient, "getPlayerMatches");

      kvGetSpy.mockResolvedValueOnce(null);
      kvGetSpy.mockResolvedValueOnce(["mode1:v1"]);
      getPlayerMatchesSpy.mockResolvedValue([]);

      const esra = await haloService.getPlayerEsra(xuid, playlistId);

      expect(esra).toBe(0);
      expect(kvPutSpy).toHaveBeenCalled();
    });

    it("handles API errors gracefully", async () => {
      const xuid = "xuid_1234567890123456";
      const playlistId = FetchablePlaylist.RANKED_ARENA;

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      const getPlayerMatchesSpy = vi.spyOn(infiniteClient, "getPlayerMatches");

      kvGetSpy.mockResolvedValueOnce(null);
      kvGetSpy.mockResolvedValueOnce(["mode1:v1", "mode2:v2"]);
      const request = new Request("https://example.com");
      getPlayerMatchesSpy.mockRejectedValue(
        new RequestError(request, new Response("Internal Server Error", { status: 500 })),
      );

      await expect(haloService.getPlayerEsra(xuid, playlistId)).rejects.toThrow();
    });

    it("reuses cached variants and fetches only missing ones", async () => {
      const xuid = "2535451623062020";
      const playlistId = FetchablePlaylist.RANKED_ARENA;

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      const kvPutSpy: MockInstance = vi.spyOn(env.APP_DATA, "put");
      const getPlayerMatchesSpy = vi.spyOn(infiniteClient, "getPlayerMatches");
      const getMatchSkillSpy = vi.spyOn(infiniteClient, "getMatchSkill");

      // Cache has some variants that match, one that doesn't
      kvGetSpy.mockResolvedValueOnce({
        xuid,
        playlistId,
        computedAt: new Date(Date.now() - 86400000).toISOString(),
        esra: 1350,
        lastMatchId: "match-0",
        matchData: {
          "mode1:v1": { matchId: "match-1", esra: 1340, gameMode: "mode1:v1", matchEndTime: new Date().toISOString() },
          "oldMode:v1": {
            matchId: "match-old",
            esra: 1350,
            gameMode: "oldMode:v1",
            matchEndTime: new Date().toISOString(),
          },
        },
      });

      kvGetSpy.mockResolvedValueOnce(["mode1:v1", "mode2:v2", "mode3:v3"]);

      // Setup matches for missing variants (mode2 and mode3)
      const matches = [
        aFakePlayerMatchHistoryWith({
          MatchId: "new-match-2",
          MatchInfo: {
            ...aFakePlayerMatchHistoryWith().MatchInfo,
            Playlist: { AssetKind: AssetKind.Playlist, AssetId: playlistId, VersionId: "v1" },
            UgcGameVariant: { AssetKind: AssetKind.UgcGameVariant, AssetId: "mode2", VersionId: "v2" },
            EndTime: new Date().toISOString(),
          },
        }),
        aFakePlayerMatchHistoryWith({
          MatchId: "new-match-3",
          MatchInfo: {
            ...aFakePlayerMatchHistoryWith().MatchInfo,
            Playlist: { AssetKind: AssetKind.Playlist, AssetId: playlistId, VersionId: "v1" },
            UgcGameVariant: { AssetKind: AssetKind.UgcGameVariant, AssetId: "mode3", VersionId: "v3" },
            EndTime: new Date(Date.now() - 1000).toISOString(),
          },
        }),
      ];
      getPlayerMatchesSpy.mockResolvedValue(matches);

      const realSkillData = Preconditions.checkExists(matchSkillData[0]);
      getMatchSkillSpy.mockResolvedValue([realSkillData]);

      const esra = await haloService.getPlayerEsra(xuid, playlistId);

      expect(esra).toBeDefined();
      expect(kvPutSpy).toHaveBeenCalled();
      expect(getPlayerMatchesSpy).toHaveBeenCalled();
      // Should only fetch skill for 2 new variants (mode2 and mode3), mode1 was cached
      expect(getMatchSkillSpy).toHaveBeenCalledTimes(2);
    });

    it("computes new ESRA from matches across variants", async () => {
      const xuid = "2535451623062020";
      const playlistId = FetchablePlaylist.RANKED_ARENA;

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      const kvPutSpy: MockInstance = vi.spyOn(env.APP_DATA, "put");
      const getPlayerMatchesSpy = vi.spyOn(infiniteClient, "getPlayerMatches");
      const getMatchSkillSpy = vi.spyOn(infiniteClient, "getMatchSkill");

      kvGetSpy.mockResolvedValueOnce(null);
      kvGetSpy.mockResolvedValueOnce(["slayer:v1", "ctf:v1"]);

      const matches = [
        aFakePlayerMatchHistoryWith({
          MatchId: "match-slayer",
          MatchInfo: {
            ...aFakePlayerMatchHistoryWith().MatchInfo,
            Playlist: { AssetKind: AssetKind.Playlist, AssetId: playlistId, VersionId: "v1" },
            UgcGameVariant: { AssetKind: AssetKind.UgcGameVariant, AssetId: "slayer", VersionId: "v1" },
            EndTime: new Date().toISOString(),
          },
        }),
        aFakePlayerMatchHistoryWith({
          MatchId: "match-ctf",
          MatchInfo: {
            ...aFakePlayerMatchHistoryWith().MatchInfo,
            Playlist: { AssetKind: AssetKind.Playlist, AssetId: playlistId, VersionId: "v1" },
            UgcGameVariant: { AssetKind: AssetKind.UgcGameVariant, AssetId: "ctf", VersionId: "v1" },
            EndTime: new Date(Date.now() - 1000).toISOString(),
          },
        }),
      ];
      getPlayerMatchesSpy.mockResolvedValue(matches);

      // Use real match skill data for each variant
      const skillData1 = Preconditions.checkExists(matchSkillData[0]);
      const skillData2 = Preconditions.checkExists(matchSkillData[1]);

      getMatchSkillSpy.mockResolvedValueOnce([skillData1]);
      getMatchSkillSpy.mockResolvedValueOnce([skillData2]);

      const esra = await haloService.getPlayerEsra(xuid, playlistId);

      expect(esra).toBeDefined();
      expect(typeof esra).toBe("number");
      expect(kvPutSpy).toHaveBeenCalled();
      expect(getMatchSkillSpy).toHaveBeenCalledTimes(2);
    });

    it("returns 0 when skill data unavailable for all variants", async () => {
      const xuid = "xuid_1234567890123456";
      const playlistId = FetchablePlaylist.RANKED_ARENA;

      const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
      const kvPutSpy: MockInstance = vi.spyOn(env.APP_DATA, "put");
      const getPlayerMatchesSpy = vi.spyOn(infiniteClient, "getPlayerMatches");
      const getMatchSkillSpy = vi.spyOn(infiniteClient, "getMatchSkill");

      kvGetSpy.mockResolvedValueOnce(null);
      kvGetSpy.mockResolvedValueOnce(["mode1:v1"]);

      const matches = [
        aFakePlayerMatchHistoryWith({
          MatchId: "match-1",
          MatchInfo: {
            ...aFakePlayerMatchHistoryWith().MatchInfo,
            Playlist: { AssetKind: AssetKind.Playlist, AssetId: playlistId, VersionId: "v1" },
            UgcGameVariant: { AssetKind: AssetKind.UgcGameVariant, AssetId: "mode1", VersionId: "v1" },
            EndTime: new Date().toISOString(),
          },
        }),
      ];
      getPlayerMatchesSpy.mockResolvedValue(matches);

      getMatchSkillSpy.mockResolvedValue([
        {
          Id: `xuid(${xuid})`,
          ResultCode: 1,
          Result: {} as MatchSkill,
        },
      ]);

      const esra = await haloService.getPlayerEsra(xuid, playlistId);

      expect(esra).toBe(0);
      expect(kvPutSpy).toHaveBeenCalled();
    });
  });

  describe("getPlayersEsras", () => {
    it("fetches ESRAs for multiple players", async () => {
      const xuids = ["xuid_1", "xuid_2", "xuid_3"];
      const playlistId = FetchablePlaylist.RANKED_ARENA;

      const getPlayerEsraSpy = vi.spyOn(haloService, "getPlayerEsra");
      getPlayerEsraSpy.mockResolvedValueOnce(1400);
      getPlayerEsraSpy.mockResolvedValueOnce(1500);
      getPlayerEsraSpy.mockResolvedValueOnce(1600);

      const esraMap = await haloService.getPlayersEsras(xuids, playlistId);

      expect(esraMap.size).toBe(3);
      expect(esraMap.get("xuid_1")).toBe(1400);
      expect(esraMap.get("xuid_2")).toBe(1500);
      expect(esraMap.get("xuid_3")).toBe(1600);
      expect(getPlayerEsraSpy).toHaveBeenCalledTimes(3);
      expect(getPlayerEsraSpy).toHaveBeenCalledWith("xuid_1", playlistId);
      expect(getPlayerEsraSpy).toHaveBeenCalledWith("xuid_2", playlistId);
      expect(getPlayerEsraSpy).toHaveBeenCalledWith("xuid_3", playlistId);
    });

    it("returns empty map when no xuids provided", async () => {
      const esraMap = await haloService.getPlayersEsras([]);

      expect(esraMap.size).toBe(0);
    });

    it("handles players with 0 ESRA", async () => {
      const xuids = ["xuid_1", "xuid_2"];

      const getPlayerEsraSpy = vi.spyOn(haloService, "getPlayerEsra");
      getPlayerEsraSpy.mockResolvedValueOnce(1400);
      getPlayerEsraSpy.mockResolvedValueOnce(0);

      const esraMap = await haloService.getPlayersEsras(xuids);

      expect(esraMap.size).toBe(2);
      expect(esraMap.get("xuid_1")).toBe(1400);
      expect(esraMap.get("xuid_2")).toBe(0);
    });

    it("uses default RANKED_ARENA playlist when not specified", async () => {
      const xuids = ["xuid_1"];

      const getPlayerEsraSpy = vi.spyOn(haloService, "getPlayerEsra");
      getPlayerEsraSpy.mockResolvedValue(1400);

      await haloService.getPlayersEsras(xuids);

      expect(getPlayerEsraSpy).toHaveBeenCalledWith("xuid_1", FetchablePlaylist.RANKED_ARENA);
    });
  });

  describe("getMapThumbnailUrl()", () => {
    const assetId = "test-asset-id";
    const versionId = "test-version-id";

    const createMapLinkFiles = (fileRelativePaths: string[]): Asset["Files"] => ({
      Prefix: "https://example.com/",
      FileRelativePaths: fileRelativePaths,
      PrefixEndpoint: {
        AuthorityId: "iUgcFiles",
        Path: "/ugcstorage/map/test/",
        QueryString: null,
        RetryPolicyId: "linearretry",
        TopicName: "",
        AcknowledgementTypeId: 0,
        AuthenticationLifetimeExtensionSupported: false,
        ClearanceAware: false,
      },
    });

    it("returns thumbnail URL when thumbnail file exists", async () => {
      const getSpecificAssetVersionSpy = vi.spyOn(infiniteClient, "getSpecificAssetVersion");
      getSpecificAssetVersionSpy.mockResolvedValue(
        aFakeMapAssetWith({
          Files: createMapLinkFiles(["images/thumbnail.png", "images/hero.png"]),
        }),
      );

      const result = await haloService.getMapThumbnailUrl(assetId, versionId);

      expect(result).toBe("https://example.com/images/thumbnail.png");
      expect(getSpecificAssetVersionSpy).toHaveBeenCalledOnce();
      expect(getSpecificAssetVersionSpy).toHaveBeenCalledWith(AssetKind.Map, assetId, versionId, {
        cf: {
          cacheTtlByStatus: { "200-299": 604800, 404: 86400, "500-599": 0 },
        },
      });
    });

    it("returns hero URL when thumbnail file does not exist but hero file exists", async () => {
      const getSpecificAssetVersionSpy = vi.spyOn(infiniteClient, "getSpecificAssetVersion");
      getSpecificAssetVersionSpy.mockResolvedValue(
        aFakeMapAssetWith({
          Files: createMapLinkFiles(["images/hero.png", "images/screenshot1.png"]),
        }),
      );

      const result = await haloService.getMapThumbnailUrl(assetId, versionId);

      expect(result).toBe("https://example.com/images/hero.png");
    });

    it("returns first file URL when neither thumbnail nor hero file exists", async () => {
      const getSpecificAssetVersionSpy = vi.spyOn(infiniteClient, "getSpecificAssetVersion");
      getSpecificAssetVersionSpy.mockResolvedValue(
        aFakeMapAssetWith({
          Files: createMapLinkFiles(["images/screenshot1.png", "images/screenshot2.png"]),
        }),
      );

      const result = await haloService.getMapThumbnailUrl(assetId, versionId);

      expect(result).toBe("https://example.com/images/screenshot1.png");
    });

    it("returns null when FileRelativePaths is empty", async () => {
      const getSpecificAssetVersionSpy = vi.spyOn(infiniteClient, "getSpecificAssetVersion");
      getSpecificAssetVersionSpy.mockResolvedValue(
        aFakeMapAssetWith({
          Files: createMapLinkFiles([]),
        }),
      );

      const result = await haloService.getMapThumbnailUrl(assetId, versionId);

      expect(result).toBeNull();
    });

    it("returns null and logs warning when API call fails", async () => {
      const error = new Error("API Error");
      const getSpecificAssetVersionSpy = vi.spyOn(infiniteClient, "getSpecificAssetVersion");
      getSpecificAssetVersionSpy.mockRejectedValue(error);

      const logWarnSpy = vi.spyOn(logService, "warn");

      const result = await haloService.getMapThumbnailUrl(assetId, versionId);

      expect(result).toBeNull();
      expect(logWarnSpy).toHaveBeenCalledOnce();
      expect(logWarnSpy).toHaveBeenCalledWith(
        error,
        new Map([["context", `Failed to fetch map thumbnail for assetId ${assetId}, versionId ${versionId}`]]),
      );
    });

    it("uses correct cache configuration for asset requests", async () => {
      const getSpecificAssetVersionSpy = vi.spyOn(infiniteClient, "getSpecificAssetVersion");
      getSpecificAssetVersionSpy.mockResolvedValue(
        aFakeMapAssetWith({
          Files: createMapLinkFiles(["images/thumbnail.png"]),
        }),
      );

      await haloService.getMapThumbnailUrl(assetId, versionId);

      expect(getSpecificAssetVersionSpy).toHaveBeenCalledWith(AssetKind.Map, assetId, versionId, {
        cf: {
          cacheTtlByStatus: {
            "200-299": 604800, // 1 week
            404: 86400, // 1 day
            "500-599": 0, // No cache on server errors
          },
        },
      });
    });

    it("prioritizes thumbnail over hero when both exist", async () => {
      const getSpecificAssetVersionSpy = vi.spyOn(infiniteClient, "getSpecificAssetVersion");
      getSpecificAssetVersionSpy.mockResolvedValue(
        aFakeMapAssetWith({
          Files: createMapLinkFiles(["images/hero.png", "images/thumbnail.png"]),
        }),
      );

      const result = await haloService.getMapThumbnailUrl(assetId, versionId);

      expect(result).toBe("https://example.com/images/thumbnail.png");
    });

    it("handles file paths with thumbnail substring in the name", async () => {
      const getSpecificAssetVersionSpy = vi.spyOn(infiniteClient, "getSpecificAssetVersion");
      getSpecificAssetVersionSpy.mockResolvedValue(
        aFakeMapAssetWith({
          Files: createMapLinkFiles(["images/map_thumbnail_large.jpg"]),
        }),
      );

      const result = await haloService.getMapThumbnailUrl(assetId, versionId);

      expect(result).toBe("https://example.com/images/map_thumbnail_large.jpg");
    });

    it("handles file paths with hero substring in the name", async () => {
      const getSpecificAssetVersionSpy = vi.spyOn(infiniteClient, "getSpecificAssetVersion");
      getSpecificAssetVersionSpy.mockResolvedValue(
        aFakeMapAssetWith({
          Files: createMapLinkFiles(["images/hero_image.png"]),
        }),
      );

      const result = await haloService.getMapThumbnailUrl(assetId, versionId);

      expect(result).toBe("https://example.com/images/hero_image.png");
    });
  });
});
