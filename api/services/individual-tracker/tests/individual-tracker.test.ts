import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../database/database";
import type { IndividualTrackerGamesRow } from "../../database/types/individual_tracker_games";
import {
  aFakeDatabaseServiceWith,
  aFakeIndividualTrackerGamesRow,
  aFakeIndividualTrackerProfilesRow,
} from "../../database/fakes/database.fake";
import { InvalidReorderError, ProfileNotFoundError } from "../errors";
import { IndividualTrackerService } from "../individual-tracker";

describe("IndividualTrackerService", () => {
  let databaseService: DatabaseService;
  let service: IndividualTrackerService;

  beforeEach(() => {
    databaseService = aFakeDatabaseServiceWith();
    service = new IndividualTrackerService(databaseService);
  });

  describe("getProfile", () => {
    it("returns null profile and empty games when user has no profiles", async () => {
      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([]);

      const result = await service.getProfile({ userId: "user-1" });

      expect(result).toEqual({ profile: null, games: [] });
    });

    it("returns profile and games for user's first profile", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ ProfileId: "profile-1" });
      const games = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Position: 1 }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2", Position: 2 }),
      ];

      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([profile]);
      const getGamesSpy = vi.spyOn(databaseService, "getIndividualTrackerGames").mockResolvedValue(games);

      const result = await service.getProfile({ userId: "user-1" });

      expect(result).toEqual({ profile, games });
      expect(getGamesSpy).toHaveBeenCalledOnce();
      expect(getGamesSpy).toHaveBeenCalledWith("profile-1");
    });

    it("returns empty games when profile has no games", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();

      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([profile]);
      vi.spyOn(databaseService, "getIndividualTrackerGames").mockResolvedValue([]);

      const result = await service.getProfile({ userId: "user-1" });

      expect(result).toEqual({ profile, games: [] });
    });
  });

  describe("createProfile", () => {
    it("creates profile with default name when name is not provided", async () => {
      const createProfileSpy = vi.spyOn(databaseService, "createIndividualTrackerProfile").mockResolvedValue(undefined);

      const result = await service.createProfile({ userId: "user-1" });

      expect(result.profile.UserId).toBe("user-1");
      expect(result.profile.Name).toBe("default");
      expect(result.profile.ActiveIdentityId).toBe(null);
      expect(result.profile.ProfileId).toBeTruthy();

      expect(createProfileSpy).toHaveBeenCalledOnce();
      expect(createProfileSpy).toHaveBeenCalledWith(expect.objectContaining(result.profile));
    });

    it("creates profile with provided name", async () => {
      vi.spyOn(databaseService, "createIndividualTrackerProfile").mockResolvedValue(undefined);

      const result = await service.createProfile({ userId: "user-1", name: "My Profile" });

      expect(result.profile.Name).toBe("My Profile");
    });

    it("trims whitespace from name and uses default for empty name", async () => {
      vi.spyOn(databaseService, "createIndividualTrackerProfile").mockResolvedValue(undefined);

      const result = await service.createProfile({ userId: "user-1", name: "   " });

      expect(result.profile.Name).toBe("default");
    });

    it("creates profile with provided activeIdentityId", async () => {
      vi.spyOn(databaseService, "createIndividualTrackerProfile").mockResolvedValue(undefined);

      const result = await service.createProfile({
        userId: "user-1",
        activeIdentityId: "identity-123",
      });

      expect(result.profile.ActiveIdentityId).toBe("identity-123");
    });

    it("sets ActiveIdentityId to null when not provided", async () => {
      vi.spyOn(databaseService, "createIndividualTrackerProfile").mockResolvedValue(undefined);

      const result = await service.createProfile({ userId: "user-1" });

      expect(result.profile.ActiveIdentityId).toBe(null);
    });

    it("generates unique ProfileId for each profile", async () => {
      vi.spyOn(databaseService, "createIndividualTrackerProfile").mockResolvedValue(undefined);

      const result1 = await service.createProfile({ userId: "user-1" });
      const result2 = await service.createProfile({ userId: "user-1" });

      expect(result1.profile.ProfileId).not.toBe(result2.profile.ProfileId);
    });

    it("sets timestamps for profile creation", async () => {
      vi.spyOn(databaseService, "createIndividualTrackerProfile").mockResolvedValue(undefined);

      const before = Math.floor(Date.now() / 1000);
      const result = await service.createProfile({ userId: "user-1" });
      const after = Math.floor(Date.now() / 1000);

      expect(result.profile.CreatedAt).toBeGreaterThanOrEqual(before);
      expect(result.profile.CreatedAt).toBeLessThanOrEqual(after);
      expect(result.profile.UpdatedAt).toBe(result.profile.CreatedAt);
    });
  });

  describe("updateProfile", () => {
    it("throws ProfileNotFoundError when profile does not exist", async () => {
      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(null);

      await expect(
        service.updateProfile({
          userId: "user-1",
          profileId: "profile-1",
          updates: { name: "New Name" },
        }),
      ).rejects.toThrow(ProfileNotFoundError);
    });

    it("throws ProfileNotFoundError when user does not own profile", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ UserId: "user-2" });

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);

      await expect(
        service.updateProfile({
          userId: "user-1",
          profileId: "profile-1",
          updates: { name: "New Name" },
        }),
      ).rejects.toThrow(ProfileNotFoundError);
    });

    it("updates profile name only when provided", async () => {
      const originalProfile = aFakeIndividualTrackerProfilesRow({ Name: "Original" });
      const updatedProfile = aFakeIndividualTrackerProfilesRow({ Name: "Updated" });

      vi.spyOn(databaseService, "getIndividualTrackerProfile")
        .mockResolvedValueOnce(originalProfile)
        .mockResolvedValueOnce(updatedProfile);
      const updateProfileSpy = vi.spyOn(databaseService, "updateIndividualTrackerProfile").mockResolvedValue(undefined);

      const result = await service.updateProfile({
        userId: "user-1",
        profileId: "profile-1",
        updates: { name: "Updated" },
      });

      expect(result.profile.Name).toBe("Updated");
      const [profileId, updates] = updateProfileSpy.mock.calls[0] ?? [];
      expect(profileId).toBe("profile-1");
      expect(updates).toMatchObject({ Name: "Updated" });
    });

    it("trims profile name before persisting", async () => {
      const originalProfile = aFakeIndividualTrackerProfilesRow({ Name: "Original" });
      const updatedProfile = aFakeIndividualTrackerProfilesRow({ Name: "Updated" });

      vi.spyOn(databaseService, "getIndividualTrackerProfile")
        .mockResolvedValueOnce(originalProfile)
        .mockResolvedValueOnce(updatedProfile);
      const updateProfileSpy = vi.spyOn(databaseService, "updateIndividualTrackerProfile").mockResolvedValue(undefined);

      await service.updateProfile({
        userId: "user-1",
        profileId: "profile-1",
        updates: { name: "  Updated  " },
      });

      expect(updateProfileSpy).toHaveBeenCalledOnce();
      expect(updateProfileSpy).toHaveBeenCalledWith("profile-1", expect.objectContaining({ Name: "Updated" }));
    });

    it("ignores empty name and does not update it", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ Name: "Original" });

      vi.spyOn(databaseService, "getIndividualTrackerProfile")
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(profile);
      const updateProfileSpy = vi.spyOn(databaseService, "updateIndividualTrackerProfile").mockResolvedValue(undefined);

      await service.updateProfile({
        userId: "user-1",
        profileId: "profile-1",
        updates: { name: "   " },
      });

      expect(updateProfileSpy).toHaveBeenCalledOnce();
      expect(updateProfileSpy).toHaveBeenCalledWith(
        "profile-1",
        expect.not.objectContaining({ Name: expect.any(String) as string }),
      );
    });

    it("updates activeIdentityId when explicitly set", async () => {
      const originalProfile = aFakeIndividualTrackerProfilesRow({ ActiveIdentityId: null });
      const updatedProfile = aFakeIndividualTrackerProfilesRow({ ActiveIdentityId: "identity-123" });

      vi.spyOn(databaseService, "getIndividualTrackerProfile")
        .mockResolvedValueOnce(originalProfile)
        .mockResolvedValueOnce(updatedProfile);
      vi.spyOn(databaseService, "updateIndividualTrackerProfile").mockResolvedValue(undefined);

      const result = await service.updateProfile({
        userId: "user-1",
        profileId: "profile-1",
        updates: { activeIdentityId: "identity-123" },
      });

      expect(result.profile.ActiveIdentityId).toBe("identity-123");
    });

    it("sets activeIdentityId to null when explicitly cleared", async () => {
      const originalProfile = aFakeIndividualTrackerProfilesRow({ ActiveIdentityId: "identity-123" });
      const updatedProfile = aFakeIndividualTrackerProfilesRow({ ActiveIdentityId: null });

      vi.spyOn(databaseService, "getIndividualTrackerProfile")
        .mockResolvedValueOnce(originalProfile)
        .mockResolvedValueOnce(updatedProfile);
      vi.spyOn(databaseService, "updateIndividualTrackerProfile").mockResolvedValue(undefined);

      const result = await service.updateProfile({
        userId: "user-1",
        profileId: "profile-1",
        updates: { activeIdentityId: null },
      });

      expect(result.profile.ActiveIdentityId).toBe(null);
    });

    it("updates UpdatedAt timestamp", async () => {
      const originalProfile = aFakeIndividualTrackerProfilesRow({ UpdatedAt: 1000 });
      const updatedProfile = aFakeIndividualTrackerProfilesRow();

      vi.spyOn(databaseService, "getIndividualTrackerProfile")
        .mockResolvedValueOnce(originalProfile)
        .mockResolvedValueOnce(updatedProfile);
      const updateProfileSpy = vi.spyOn(databaseService, "updateIndividualTrackerProfile").mockResolvedValue(undefined);

      await service.updateProfile({
        userId: "user-1",
        profileId: "profile-1",
        updates: { name: "Updated" },
      });

      expect(updateProfileSpy).toHaveBeenCalledOnce();
      expect(updateProfileSpy).toHaveBeenCalledWith(
        "profile-1",
        expect.objectContaining({ UpdatedAt: expect.any(Number) as number }),
      );
    });
  });

  describe("addGame", () => {
    it("throws ProfileNotFoundError when profile does not exist", async () => {
      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(null);

      await expect(
        service.addGame({
          userId: "user-1",
          profileId: "profile-1",
          matchId: "match-1",
        }),
      ).rejects.toThrow(ProfileNotFoundError);
    });

    it("throws ProfileNotFoundError when user does not own profile", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ UserId: "user-2" });

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);

      await expect(
        service.addGame({
          userId: "user-1",
          profileId: "profile-1",
          matchId: "match-1",
        }),
      ).rejects.toThrow(ProfileNotFoundError);
    });

    it("appends new game with correct position", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Position: 1 })];
      const updatedGames = [...existingGames, aFakeIndividualTrackerGamesRow({ MatchId: "match-2", Position: 2 })];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames")
        .mockResolvedValueOnce(existingGames)
        .mockResolvedValueOnce(updatedGames);
      const replaceGamesSpy = vi.spyOn(databaseService, "replaceIndividualTrackerGames").mockResolvedValue(undefined);

      await service.addGame({
        userId: "user-1",
        profileId: "profile-1",
        matchId: "match-2",
      });

      const replacedGames = replaceGamesSpy.mock.calls[0]?.[1];
      expect(replacedGames).toHaveLength(2);
      expect(replacedGames?.[1]).toMatchObject({
        MatchId: "match-2",
        Position: 2,
        Included: 1,
      });
    });

    it("marks existing game as Included when adding duplicate matchId", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Included: 0 as const })];
      const updatedGames = [aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Included: 1 as const })];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames")
        .mockResolvedValueOnce(existingGames)
        .mockResolvedValueOnce(updatedGames);
      const replaceGamesSpy = vi.spyOn(databaseService, "replaceIndividualTrackerGames").mockResolvedValue(undefined);

      await service.addGame({
        userId: "user-1",
        profileId: "profile-1",
        matchId: "match-1",
      });

      expect(replaceGamesSpy).toHaveBeenCalledOnce();
      expect(replaceGamesSpy).toHaveBeenCalledWith(
        "profile-1",
        expect.arrayContaining([expect.objectContaining({ MatchId: "match-1", Included: 1 })]),
      );
    });

    it("returns updated games after add", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames: IndividualTrackerGamesRow[] = [];
      const updatedGames = [aFakeIndividualTrackerGamesRow({ MatchId: "match-1" })];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames")
        .mockResolvedValueOnce(existingGames)
        .mockResolvedValueOnce(updatedGames);
      vi.spyOn(databaseService, "replaceIndividualTrackerGames").mockResolvedValue(undefined);

      const result = await service.addGame({
        userId: "user-1",
        profileId: "profile-1",
        matchId: "match-1",
      });

      expect(result.games).toEqual(updatedGames);
    });
  });

  describe("removeGame", () => {
    it("throws ProfileNotFoundError when profile does not exist", async () => {
      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(null);

      await expect(
        service.removeGame({
          userId: "user-1",
          profileId: "profile-1",
          matchId: "match-1",
        }),
      ).rejects.toThrow(ProfileNotFoundError);
    });

    it("throws ProfileNotFoundError when user does not own profile", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ UserId: "user-2" });

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);

      await expect(
        service.removeGame({
          userId: "user-1",
          profileId: "profile-1",
          matchId: "match-1",
        }),
      ).rejects.toThrow(ProfileNotFoundError);
    });

    it("marks game as Included=0", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Included: 1 as const })];
      const updatedGames = [aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Included: 0 as const })];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames")
        .mockResolvedValueOnce(existingGames)
        .mockResolvedValueOnce(updatedGames);
      const replaceGamesSpy = vi.spyOn(databaseService, "replaceIndividualTrackerGames").mockResolvedValue(undefined);

      await service.removeGame({
        userId: "user-1",
        profileId: "profile-1",
        matchId: "match-1",
      });

      expect(replaceGamesSpy).toHaveBeenCalledOnce();
      expect(replaceGamesSpy).toHaveBeenCalledWith(
        "profile-1",
        expect.arrayContaining([expect.objectContaining({ MatchId: "match-1", Included: 0 })]),
      );
    });

    it("preserves other games when removing one", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1" }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2" }),
      ];
      const updatedGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Included: 0 as const }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2" }),
      ];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames")
        .mockResolvedValueOnce(existingGames)
        .mockResolvedValueOnce(updatedGames);
      const replaceGamesSpy = vi.spyOn(databaseService, "replaceIndividualTrackerGames").mockResolvedValue(undefined);

      await service.removeGame({
        userId: "user-1",
        profileId: "profile-1",
        matchId: "match-1",
      });

      expect(replaceGamesSpy).toHaveBeenCalledOnce();
      expect(replaceGamesSpy).toHaveBeenCalledWith(
        "profile-1",
        expect.arrayContaining([
          expect.objectContaining({ MatchId: "match-1", Included: 0 }),
          expect.objectContaining({ MatchId: "match-2", Included: 1 }),
        ]),
      );
    });

    it("returns updated games after remove", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [aFakeIndividualTrackerGamesRow({ MatchId: "match-1" })];
      const updatedGames = [aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Included: 0 as const })];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames")
        .mockResolvedValueOnce(existingGames)
        .mockResolvedValueOnce(updatedGames);
      vi.spyOn(databaseService, "replaceIndividualTrackerGames").mockResolvedValue(undefined);

      const result = await service.removeGame({
        userId: "user-1",
        profileId: "profile-1",
        matchId: "match-1",
      });

      expect(result.games).toEqual(updatedGames);
    });
  });

  describe("reorderGames", () => {
    it("throws ProfileNotFoundError when profile does not exist", async () => {
      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(null);

      await expect(
        service.reorderGames({
          userId: "user-1",
          profileId: "profile-1",
          orderedMatchIds: ["match-1"],
        }),
      ).rejects.toThrow(ProfileNotFoundError);
    });

    it("throws ProfileNotFoundError when user does not own profile", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ UserId: "user-2" });

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);

      await expect(
        service.reorderGames({
          userId: "user-1",
          profileId: "profile-1",
          orderedMatchIds: ["match-1"],
        }),
      ).rejects.toThrow(ProfileNotFoundError);
    });

    it("throws InvalidReorderError when orderedMatchIds count does not match existing games", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1" }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2" }),
      ];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames").mockResolvedValue(existingGames);

      await expect(
        service.reorderGames({
          userId: "user-1",
          profileId: "profile-1",
          orderedMatchIds: ["match-1"],
        }),
      ).rejects.toThrow(InvalidReorderError);
    });

    it("throws InvalidReorderError when orderedMatchIds contains unknown matchId", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [aFakeIndividualTrackerGamesRow({ MatchId: "match-1" })];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames").mockResolvedValue(existingGames);

      await expect(
        service.reorderGames({
          userId: "user-1",
          profileId: "profile-1",
          orderedMatchIds: ["match-999"],
        }),
      ).rejects.toThrow(InvalidReorderError);
    });

    it("throws InvalidReorderError when orderedMatchIds contains duplicates", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1" }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2" }),
      ];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames").mockResolvedValue(existingGames);

      await expect(
        service.reorderGames({
          userId: "user-1",
          profileId: "profile-1",
          orderedMatchIds: ["match-1", "match-1"],
        }),
      ).rejects.toThrow(InvalidReorderError);
    });

    it("reorders games with correct positions", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Position: 1 }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2", Position: 2 }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-3", Position: 3 }),
      ];
      const expectedGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-3", Position: 1 }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Position: 2 }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2", Position: 3 }),
      ];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames")
        .mockResolvedValueOnce(existingGames)
        .mockResolvedValueOnce(expectedGames);
      const replaceGamesSpy = vi.spyOn(databaseService, "replaceIndividualTrackerGames").mockResolvedValue(undefined);

      await service.reorderGames({
        userId: "user-1",
        profileId: "profile-1",
        orderedMatchIds: ["match-3", "match-1", "match-2"],
      });

      expect(replaceGamesSpy).toHaveBeenCalledOnce();
      expect(replaceGamesSpy).toHaveBeenCalledWith(
        "profile-1",
        expect.arrayContaining([
          expect.objectContaining({ MatchId: "match-3", Position: 1 }),
          expect.objectContaining({ MatchId: "match-1", Position: 2 }),
          expect.objectContaining({ MatchId: "match-2", Position: 3 }),
        ]),
      );
    });

    it("returns reordered games", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Position: 1 }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2", Position: 2 }),
      ];
      const reorderedGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2", Position: 1 }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1", Position: 2 }),
      ];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames")
        .mockResolvedValueOnce(existingGames)
        .mockResolvedValueOnce(reorderedGames);
      vi.spyOn(databaseService, "replaceIndividualTrackerGames").mockResolvedValue(undefined);

      const result = await service.reorderGames({
        userId: "user-1",
        profileId: "profile-1",
        orderedMatchIds: ["match-2", "match-1"],
      });

      expect(result.games).toEqual(reorderedGames);
    });

    it("updates UpdatedAt for all games", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const existingGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1", UpdatedAt: 1000 }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2", UpdatedAt: 1000 }),
      ];
      const updatedGames = [
        aFakeIndividualTrackerGamesRow({ MatchId: "match-2", UpdatedAt: 2000 }),
        aFakeIndividualTrackerGamesRow({ MatchId: "match-1", UpdatedAt: 2000 }),
      ];

      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(profile);
      vi.spyOn(databaseService, "getIndividualTrackerGames")
        .mockResolvedValueOnce(existingGames)
        .mockResolvedValueOnce(updatedGames);
      const replaceGamesSpy = vi.spyOn(databaseService, "replaceIndividualTrackerGames").mockResolvedValue(undefined);

      await service.reorderGames({
        userId: "user-1",
        profileId: "profile-1",
        orderedMatchIds: ["match-2", "match-1"],
      });

      expect(replaceGamesSpy).toHaveBeenCalledOnce();
      expect(replaceGamesSpy).toHaveBeenCalledWith(
        "profile-1",
        expect.arrayContaining([
          expect.objectContaining({ MatchId: "match-2", UpdatedAt: expect.any(Number) as number }),
          expect.objectContaining({ MatchId: "match-1", UpdatedAt: expect.any(Number) as number }),
        ]),
      );
    });
  });
});
