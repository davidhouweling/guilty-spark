import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeriesContextPayload } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/nudge";
import {
  aFakeDatabaseServiceWith,
  aFakeIndividualTrackerProfilesRow,
  aFakeIndividualTrackersRow,
  aFakeLinkedIdentitiesRow,
  aFakeStreamerViewSettingsRow,
} from "../../database/fakes/database.fake";
import type { DatabaseService } from "../../database/database";
import { IndividualTrackerService, MAX_TRACKERS_PER_USER } from "../individual-tracker";
import { IdentityNotOwnedError, ProfileNotFoundError, TrackerLimitReachedError, TrackerNotFoundError } from "../errors";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDurableObjectNamespaceWith } from "../../../base/fakes/do.fake";
import {
  aFakeIndividualTrackerDOWith,
  type FakeIndividualTrackerDO,
} from "../../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import type { LogService } from "../../log/types";

describe("IndividualTrackerService", () => {
  let databaseService: DatabaseService;
  let service: IndividualTrackerService;

  beforeEach(() => {
    databaseService = aFakeDatabaseServiceWith();
    service = new IndividualTrackerService({
      env: aFakeEnvWith(),
      logService: aFakeLogServiceWith(),
      databaseService,
    });
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

  describe("markTrackerStatus", () => {
    it("upserts the tracker row with stopped status and not live", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Status: "active", IsLive: 1 });
      const upsertSpy: MockInstance<DatabaseService["upsertIndividualTracker"]> = vi
        .spyOn(databaseService, "upsertIndividualTracker")
        .mockResolvedValue();

      const stopped = await service.markTrackerStatus(row, "stopped");

      expect(stopped.Status).toBe("stopped");
      expect(stopped.IsLive).toBe(0);
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ TrackerId: "t1", Status: "stopped", IsLive: 0 }),
      );
    });

    it("upserts the tracker row with paused status while preserving live", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Status: "active", IsLive: 1 });
      const upsertSpy: MockInstance<DatabaseService["upsertIndividualTracker"]> = vi
        .spyOn(databaseService, "upsertIndividualTracker")
        .mockResolvedValue();

      const paused = await service.markTrackerStatus(row, "paused");

      expect(paused.Status).toBe("paused");
      expect(paused.IsLive).toBe(1);
      expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ TrackerId: "t1", Status: "paused", IsLive: 1 }));
    });

    it("upserts the tracker row with active status when resuming", async () => {
      const row = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Status: "paused", IsLive: 0 });
      const upsertSpy: MockInstance<DatabaseService["upsertIndividualTracker"]> = vi
        .spyOn(databaseService, "upsertIndividualTracker")
        .mockResolvedValue();

      const resumed = await service.markTrackerStatus(row, "active");

      expect(resumed.Status).toBe("active");
      expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ TrackerId: "t1", Status: "active" }));
    });
  });

  describe("getSettings", () => {
    it("returns empty object when no settings row exists", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "user-1" });
      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([profile]);
      vi.spyOn(databaseService, "getStreamerViewSettings").mockResolvedValue(null);

      expect(await service.getSettings("user-1")).toEqual({});
    });

    it("parses and returns settings from the row when one exists", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "user-1" });
      const row = aFakeStreamerViewSettingsRow({
        ProfileId: "p1",
        StyleFlagsJson: JSON.stringify({ colorMode: "player" }),
        VisibleSectionsJson: "{}",
        LayoutOptionsJson: "{}",
      });
      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([profile]);
      vi.spyOn(databaseService, "getStreamerViewSettings").mockResolvedValue(row);

      const result = await service.getSettings("user-1");

      expect(result.styleFlags?.colorMode).toBe("player");
    });

    it("returns empty object when all JSON columns parse to empty objects", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "user-1" });
      const row = aFakeStreamerViewSettingsRow({
        ProfileId: "p1",
        StyleFlagsJson: "{}",
        VisibleSectionsJson: "{}",
        LayoutOptionsJson: "{}",
      });
      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([profile]);
      vi.spyOn(databaseService, "getStreamerViewSettings").mockResolvedValue(row);

      expect(await service.getSettings("user-1")).toEqual({});
    });
  });

  describe("updateSettings", () => {
    it("calls upsertStreamerViewSettings with correct JSON columns and returns the settings", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "user-1" });
      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([profile]);
      const upsertSpy: MockInstance<DatabaseService["upsertStreamerViewSettings"]> = vi
        .spyOn(databaseService, "upsertStreamerViewSettings")
        .mockResolvedValue();

      const settings = { styleFlags: { colorMode: "observer" as const }, layoutOptions: { viewMode: "wide" as const } };
      const result = await service.updateSettings("user-1", settings);

      expect(result).toEqual(settings);
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ProfileId: "p1",
          StyleFlagsJson: JSON.stringify({ colorMode: "observer" }),
          VisibleSectionsJson: JSON.stringify({}),
          LayoutOptionsJson: JSON.stringify({ viewMode: "wide" }),
        }),
      );
    });

    it("serialises missing sub-objects as empty JSON objects", async () => {
      const profile = aFakeIndividualTrackerProfilesRow({ ProfileId: "p1", UserId: "user-1" });
      vi.spyOn(databaseService, "findIndividualTrackerProfilesByUserId").mockResolvedValue([profile]);
      const upsertSpy: MockInstance<DatabaseService["upsertStreamerViewSettings"]> = vi
        .spyOn(databaseService, "upsertStreamerViewSettings")
        .mockResolvedValue();

      await service.updateSettings("user-1", {});

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          StyleFlagsJson: "{}",
          VisibleSectionsJson: "{}",
          LayoutOptionsJson: "{}",
        }),
      );
    });
  });

  describe("setLiveTracker", () => {
    it("throws TrackerNotFoundError when the tracker is not owned", async () => {
      vi.spyOn(databaseService, "getIndividualTracker").mockResolvedValue(null);
      const setLiveSpy: MockInstance<DatabaseService["setLiveIndividualTracker"]> = vi
        .spyOn(databaseService, "setLiveIndividualTracker")
        .mockResolvedValue();

      await expect(service.setLiveTracker("user-1", "t1")).rejects.toThrow(TrackerNotFoundError);
      expect(setLiveSpy).not.toHaveBeenCalled();
    });

    it("sets the tracker live and returns the refreshed row", async () => {
      const owned = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", IsLive: 0 });
      const refreshed = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", IsLive: 1 });
      vi.spyOn(databaseService, "getIndividualTracker").mockResolvedValueOnce(owned).mockResolvedValueOnce(refreshed);
      const setLiveSpy: MockInstance<DatabaseService["setLiveIndividualTracker"]> = vi
        .spyOn(databaseService, "setLiveIndividualTracker")
        .mockResolvedValue();

      const result = await service.setLiveTracker("user-1", "t1");

      expect(result.IsLive).toBe(1);
      expect(setLiveSpy).toHaveBeenCalledWith("user-1", "t1");
    });
  });

  describe("nudgeTrackers", () => {
    let doStub: FakeIndividualTrackerDO;
    let fetchSpy: MockInstance<FakeIndividualTrackerDO["fetch"]>;
    let logService: LogService;
    let nudgeService: IndividualTrackerService;

    beforeEach(() => {
      doStub = aFakeIndividualTrackerDOWith();
      fetchSpy = vi.spyOn(doStub, "fetch");
      logService = aFakeLogServiceWith();
      nudgeService = new IndividualTrackerService({
        env: aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(doStub) }),
        logService,
        databaseService,
      });
    });

    it("POSTs /nudge to the DO stub for each active tracker with the given payload", async () => {
      const tracker = aFakeIndividualTrackersRow({
        TrackerId: "t1",
        UserId: "user-1",
        Xuid: "xuid-1",
        Status: "active",
      });
      vi.spyOn(databaseService, "findIndividualTrackersByXuids").mockResolvedValue([tracker]);
      const payload: SeriesContextPayload = {
        title: "Test Server",
        subtitle: "Queue #1",
        guildIconUrl: null,
        teams: [],
      };

      await nudgeService.nudgeTrackers(["xuid-1"], payload);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://do/nudge");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual(payload);
    });

    it("POSTs /nudge with a null body when payload is null", async () => {
      const tracker = aFakeIndividualTrackerDOWith({ nudgeResponse: { success: true } });
      const localFetchSpy = vi.spyOn(tracker, "fetch");
      const localService = new IndividualTrackerService({
        env: aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(tracker) }),
        logService,
        databaseService,
      });
      vi.spyOn(databaseService, "findIndividualTrackersByXuids").mockResolvedValue([
        aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Status: "active" }),
      ]);

      await localService.nudgeTrackers(["xuid-1"], { type: "ended" });

      const [, init] = localFetchSpy.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ type: "ended" });
    });

    it("skips stopped trackers and nudges active and paused ones", async () => {
      vi.spyOn(databaseService, "findIndividualTrackersByXuids").mockResolvedValue([
        aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Status: "stopped" }),
        aFakeIndividualTrackersRow({ TrackerId: "t2", UserId: "user-1", Status: "active" }),
        aFakeIndividualTrackersRow({ TrackerId: "t3", UserId: "user-1", Status: "paused" }),
      ]);

      await nudgeService.nudgeTrackers(["xuid-1", "xuid-2", "xuid-3"], { type: "ended" });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("does not call the DO when all trackers are stopped", async () => {
      vi.spyOn(databaseService, "findIndividualTrackersByXuids").mockResolvedValue([
        aFakeIndividualTrackersRow({ Status: "stopped" }),
      ]);

      await nudgeService.nudgeTrackers(["xuid-1"], { type: "ended" });

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("swallows a per-tracker fetch error and continues nudging remaining trackers", async () => {
      vi.spyOn(databaseService, "findIndividualTrackersByXuids").mockResolvedValue([
        aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Status: "active" }),
        aFakeIndividualTrackersRow({ TrackerId: "t2", UserId: "user-1", Status: "active" }),
      ]);
      const warnSpy: MockInstance<LogService["warn"]> = vi.spyOn(logService, "warn");
      fetchSpy.mockRejectedValueOnce(new Error("DO unavailable")).mockResolvedValueOnce(new Response("ok"));

      await expect(nudgeService.nudgeTrackers(["xuid-1", "xuid-2"], { type: "ended" })).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("makes no DO calls when given an empty xuid list", async () => {
      const findSpy: MockInstance<DatabaseService["findIndividualTrackersByXuids"]> = vi
        .spyOn(databaseService, "findIndividualTrackersByXuids")
        .mockResolvedValue([]);

      await nudgeService.nudgeTrackers([], { type: "ended" });

      expect(findSpy).toHaveBeenCalledWith([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
