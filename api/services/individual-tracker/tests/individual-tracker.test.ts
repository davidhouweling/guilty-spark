import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aFakeDatabaseServiceWith,
  aFakeIndividualTrackerProfilesRow,
  aFakeIndividualTrackersRow,
  aFakeLinkedIdentitiesRow,
} from "../../database/fakes/database.fake";
import type { DatabaseService } from "../../database/database";
import { IndividualTrackerService, MAX_TRACKERS_PER_USER } from "../individual-tracker";
import { IdentityNotOwnedError, ProfileNotFoundError, TrackerLimitReachedError, TrackerNotFoundError } from "../errors";

describe("IndividualTrackerService", () => {
  let databaseService: DatabaseService;
  let service: IndividualTrackerService;

  beforeEach(() => {
    databaseService = aFakeDatabaseServiceWith();
    service = new IndividualTrackerService({ databaseService });
  });

  describe("getOrCreateProfile", () => {
    it("returns the existing profile when one exists", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "user-1" });
      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([profile]);
      const createSpy: MockInstance<DatabaseService["createIndividualTrackerProfile"]> = vi.spyOn(
        databaseService,
        "createIndividualTrackerProfile",
      );

      expect(await service.getOrCreateProfile("user-1")).toEqual(profile);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("creates a default profile keyed to the user's active xbox identity when none exists", async () => {
      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([]);
      vi.spyOn(databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([
        aFakeLinkedIdentitiesRow({ IdentityId: "xbox-id", UserId: "user-1", Provider: "xbox", IsActive: 1 }),
      ]);
      const createSpy: MockInstance<DatabaseService["createIndividualTrackerProfile"]> = vi
        .spyOn(databaseService, "createIndividualTrackerProfile")
        .mockResolvedValue();

      const profile = await service.getOrCreateProfile("user-1");

      expect(profile.UserId).toBe("user-1");
      expect(profile.Name).toBe("default");
      expect(profile.ActiveIdentityId).toBe("xbox-id");
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ UserId: "user-1", Name: "default", ActiveIdentityId: "xbox-id" }),
      );
    });

    it("creates a default profile with no active identity when there is no active xbox identity", async () => {
      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([]);
      vi.spyOn(databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([]);
      vi.spyOn(databaseService, "createIndividualTrackerProfile").mockResolvedValue();

      const profile = await service.getOrCreateProfile("user-1");

      expect(profile.ActiveIdentityId).toBeNull();
    });
  });

  describe("updateProfile", () => {
    it("throws ProfileNotFoundError when the profile does not exist", async () => {
      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(null);

      await expect(service.updateProfile({ userId: "user-1", profileId: "p1" })).rejects.toThrow(ProfileNotFoundError);
    });

    it("throws ProfileNotFoundError when the profile belongs to another user", async () => {
      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(
        aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "other-user" }),
      );

      await expect(service.updateProfile({ userId: "user-1", profileId: "p1" })).rejects.toThrow(ProfileNotFoundError);
    });

    it("updates the name and active identity and returns the refreshed profile", async () => {
      const existing = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "user-1", Name: "Old" });
      const updated = aFakeIndividualTrackerProfilesRow({
        ProfileId: "p1",
        UserId: "user-1",
        Name: "New",
        ActiveIdentityId: "id-2",
      });
      vi.spyOn(databaseService, "getIndividualTrackerProfile")
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      vi.spyOn(databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([
        aFakeLinkedIdentitiesRow({ IdentityId: "id-2", UserId: "user-1" }),
      ]);
      const updateSpy: MockInstance<DatabaseService["updateIndividualTrackerProfile"]> = vi
        .spyOn(databaseService, "updateIndividualTrackerProfile")
        .mockResolvedValue();

      const result = await service.updateProfile({
        userId: "user-1",
        profileId: "p1",
        name: "New",
        activeIdentityId: "id-2",
      });

      expect(result).toEqual(updated);
      expect(updateSpy).toHaveBeenCalledWith("p1", expect.objectContaining({ Name: "New", ActiveIdentityId: "id-2" }));
    });

    it("ignores a blank name", async () => {
      const existing = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "user-1", Name: "Old" });
      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(existing);
      const updateSpy: MockInstance<DatabaseService["updateIndividualTrackerProfile"]> = vi
        .spyOn(databaseService, "updateIndividualTrackerProfile")
        .mockResolvedValue();

      await service.updateProfile({ userId: "user-1", profileId: "p1", name: "   " });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy.mock.calls[0]?.[1]).not.toHaveProperty("Name");
    });

    it("throws IdentityNotOwnedError when the active identity is not linked to the user", async () => {
      vi.spyOn(databaseService, "getIndividualTrackerProfile").mockResolvedValue(
        aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "user-1" }),
      );
      vi.spyOn(databaseService, "findLinkedIdentitiesByUserId").mockResolvedValue([]);
      const updateSpy: MockInstance<DatabaseService["updateIndividualTrackerProfile"]> = vi
        .spyOn(databaseService, "updateIndividualTrackerProfile")
        .mockResolvedValue();

      await expect(
        service.updateProfile({ userId: "user-1", profileId: "p1", activeIdentityId: "not-mine" }),
      ).rejects.toThrow(IdentityNotOwnedError);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe("listTrackers", () => {
    it("returns the trackers found for the user", async () => {
      const rows = [aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1" })];
      vi.spyOn(databaseService, "findIndividualTrackersByUserId").mockResolvedValue(rows);

      expect(await service.listTrackers("user-1")).toEqual(rows);
    });
  });

  describe("createTracker", () => {
    it("creates a new active tracker row and upserts it", async () => {
      vi.spyOn(databaseService, "findIndividualTrackersByUserId").mockResolvedValue([]);
      const upsertSpy: MockInstance<DatabaseService["upsertIndividualTracker"]> = vi
        .spyOn(databaseService, "upsertIndividualTracker")
        .mockResolvedValue();

      const tracker = await service.createTracker({ userId: "user-1", gamertag: "Foo", xuid: "xuid-1" });

      expect(tracker.UserId).toBe("user-1");
      expect(tracker.Gamertag).toBe("Foo");
      expect(tracker.Xuid).toBe("xuid-1");
      expect(tracker.Status).toBe("active");
      expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ Xuid: "xuid-1", Status: "active" }));
    });

    it("throws TrackerLimitReachedError when the user is at the limit with a new gamertag", async () => {
      const existing = Array.from({ length: MAX_TRACKERS_PER_USER }, (_value, index) =>
        aFakeIndividualTrackersRow({
          TrackerId: `t${index.toString()}`,
          UserId: "user-1",
          Xuid: `xuid-${index.toString()}`,
        }),
      );
      vi.spyOn(databaseService, "findIndividualTrackersByUserId").mockResolvedValue(existing);
      const upsertSpy: MockInstance<DatabaseService["upsertIndividualTracker"]> = vi
        .spyOn(databaseService, "upsertIndividualTracker")
        .mockResolvedValue();

      await expect(service.createTracker({ userId: "user-1", gamertag: "New", xuid: "xuid-new" })).rejects.toThrow(
        TrackerLimitReachedError,
      );
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it("re-uses the existing tracker id when the gamertag is already tracked at the limit", async () => {
      const existing = Array.from({ length: MAX_TRACKERS_PER_USER }, (_value, index) =>
        aFakeIndividualTrackersRow({
          TrackerId: `t${index.toString()}`,
          UserId: "user-1",
          Xuid: `xuid-${index.toString()}`,
        }),
      );
      vi.spyOn(databaseService, "findIndividualTrackersByUserId").mockResolvedValue(existing);
      vi.spyOn(databaseService, "upsertIndividualTracker").mockResolvedValue();

      const tracker = await service.createTracker({ userId: "user-1", gamertag: "Foo", xuid: "xuid-1" });

      expect(tracker.TrackerId).toBe("t1");
    });
  });

  describe("getOwnedTracker", () => {
    it("returns the tracker when owned by the user", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1" });
      vi.spyOn(databaseService, "getIndividualTracker").mockResolvedValue(row);

      expect(await service.getOwnedTracker("user-1", "t1")).toEqual(row);
    });

    it("throws TrackerNotFoundError when the tracker is missing", async () => {
      vi.spyOn(databaseService, "getIndividualTracker").mockResolvedValue(null);

      await expect(service.getOwnedTracker("user-1", "t1")).rejects.toThrow(TrackerNotFoundError);
    });

    it("throws TrackerNotFoundError when the tracker belongs to another user", async () => {
      vi.spyOn(databaseService, "getIndividualTracker").mockResolvedValue(
        aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "other" }),
      );

      await expect(service.getOwnedTracker("user-1", "t1")).rejects.toThrow(TrackerNotFoundError);
    });
  });

  describe("markTrackerStopped", () => {
    it("upserts the tracker row with stopped status and not live", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Status: "active", IsLive: 1 });
      const upsertSpy: MockInstance<DatabaseService["upsertIndividualTracker"]> = vi
        .spyOn(databaseService, "upsertIndividualTracker")
        .mockResolvedValue();

      const stopped = await service.markTrackerStopped(row);

      expect(stopped.Status).toBe("stopped");
      expect(stopped.IsLive).toBe(0);
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ TrackerId: "t1", Status: "stopped", IsLive: 0 }),
      );
    });
  });
});
