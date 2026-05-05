import { describe, it, expect, beforeEach, vi } from "vitest";
import { aFakeEnvWith, fakeD1Response, FakePreparedStatement } from "../../../base/fakes/env.fake";
import { DatabaseService } from "../database";
import {
  aFakeDiscordAssociationsRow,
  aFakeUserSessionsRow,
  aFakeLinkedIdentitiesRow,
  aFakeIndividualTrackerActiveSessionsRow,
  aFakeIndividualTrackerProfilesRow,
  aFakeIndividualTrackerSessionsRow,
  aFakeIndividualTrackerGamesRow,
  aFakeStreamerViewSettingsRow,
} from "../fakes/database.fake";
import type { GuildConfigRow } from "../types/guild_config";
import { StatsReturnType, MapsPostType, MapsPlaylistType, MapsFormatType } from "../types/guild_config";
import type { NeatQueueConfigRow } from "../types/neat_queue_config";
import { NeatQueuePostSeriesDisplayMode } from "../types/neat_queue_config";
import type { UserSessionsRow } from "../types/user_sessions";
import type { LinkedIdentitiesRow } from "../types/linked_identities";
import type { IndividualTrackerProfilesRow } from "../types/individual_tracker_profiles";
import type { IndividualTrackerGamesRow } from "../types/individual_tracker_games";
import type { IndividualTrackerActiveSessionsRow } from "../types/individual_tracker_active_sessions";
import type { IndividualTrackerSessionsRow } from "../types/individual_tracker_sessions";
import type { StreamerViewSettingsRow } from "../types/streamer_view_settings";

describe("Database Service", () => {
  let env: Env;
  let databaseService: DatabaseService;

  beforeEach(() => {
    env = aFakeEnvWith();
    databaseService = new DatabaseService({ env });
  });

  describe("getDiscordAssociations()", () => {
    it("gets Discord associations from the database", async () => {
      const association1 = aFakeDiscordAssociationsRow({ DiscordId: "discordId1", XboxId: "xboxId1" });
      const association2 = aFakeDiscordAssociationsRow({ DiscordId: "discordId2", XboxId: "xboxId2" });

      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const allSpy = vi
        .spyOn(fakePreparedStatement, "all")
        .mockResolvedValue({ ...fakeD1Response, results: [association1, association2] });

      const discordAssociations = await databaseService.getDiscordAssociations(["discordId", "discordId2"]);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM DiscordAssociations WHERE DiscordId IN (?,?)");
      expect(bindSpy).toHaveBeenCalledWith("discordId", "discordId2");
      expect(allSpy).toHaveBeenCalled();

      expect(discordAssociations).toEqual([association1, association2]);
    });
  });

  describe("getDiscordAssociationsByXboxId()", () => {
    it("gets Discord associations from the database by Xbox IDs", async () => {
      const association1 = aFakeDiscordAssociationsRow({ DiscordId: "discordId1", XboxId: "xboxId1" });
      const association2 = aFakeDiscordAssociationsRow({ DiscordId: "discordId2", XboxId: "xboxId2" });

      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const allSpy = vi
        .spyOn(fakePreparedStatement, "all")
        .mockResolvedValue({ ...fakeD1Response, results: [association1, association2] });

      const discordAssociations = await databaseService.getDiscordAssociationsByXboxId(["xboxId1", "xboxId2"]);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM DiscordAssociations WHERE XboxId IN (?,?)");
      expect(bindSpy).toHaveBeenCalledWith("xboxId1", "xboxId2");
      expect(allSpy).toHaveBeenCalled();

      expect(discordAssociations).toEqual([association1, association2]);
    });
  });

  describe("upsertDiscordAssociations()", () => {
    it("upserts Discord associations in the database", async () => {
      const association1 = aFakeDiscordAssociationsRow({
        DiscordId: "discordId1",
        XboxId: "xboxId1",
        AssociationDate: new Date("2025-01-01T06:00:00.000Z").getTime(),
      });
      const association2 = aFakeDiscordAssociationsRow({
        DiscordId: "discordId2",
        XboxId: "xboxId2",
        AssociationDate: new Date("2025-01-01T07:00:00.000Z").getTime(),
      });

      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertDiscordAssociations([association1, association2]);

      const query = `
      INSERT INTO DiscordAssociations (DiscordId, XboxId, AssociationReason, AssociationDate, GamesRetrievable, DiscordDisplayNameSearched) VALUES (?, ?, ?, ?, ?, ?),(?, ?, ?, ?, ?, ?)
      ON CONFLICT(DiscordId) DO UPDATE SET XboxId=excluded.XboxId, AssociationReason=excluded.AssociationReason, AssociationDate=excluded.AssociationDate, GamesRetrievable=excluded.GamesRetrievable, DiscordDisplayNameSearched=excluded.DiscordDisplayNameSearched
    `;
      expect(prepareSpy).toHaveBeenCalledWith(query);
      expect(bindSpy).toHaveBeenCalledWith(
        association1.DiscordId,
        association1.XboxId,
        association1.AssociationReason,
        association1.AssociationDate,
        association1.GamesRetrievable,
        association1.DiscordDisplayNameSearched,
        association2.DiscordId,
        association2.XboxId,
        association2.AssociationReason,
        association2.AssociationDate,
        association2.GamesRetrievable,
        association2.DiscordDisplayNameSearched,
      );
      expect(runSpy).toHaveBeenCalled();
    });

    it("does nothing when empty array is provided", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);

      await databaseService.upsertDiscordAssociations([]);

      expect(prepareSpy).not.toHaveBeenCalled();
    });
  });

  describe("deleteDiscordAssociations()", () => {
    it("deletes Discord associations from the database", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteDiscordAssociations(["discordId", "discordId2"]);

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM DiscordAssociations WHERE DiscordId IN (?,?)");
      expect(bindSpy).toHaveBeenCalledWith("discordId", "discordId2");
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("getGuildConfig()", () => {
    const fakeD1Meta = {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 0,
      last_row_id: 0,
      changes: 0,
      last_insert_rowid: 0,
      changed_db: false,
    };

    it("returns default GuildConfig with NeatQueueInformerPlayerConnections when not found", async () => {
      const guildId = "guild-123";
      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(null);
      vi.spyOn(fakePreparedStatement, "run").mockResolvedValue({ results: [], success: true, meta: fakeD1Meta });

      const config = await databaseService.getGuildConfig(guildId);

      expect(config).toEqual({
        GuildId: guildId,
        StatsReturn: StatsReturnType.SERIES_ONLY,
        Medals: "Y",
        NeatQueueInformerPlayerConnections: "Y",
        NeatQueueInformerMapsPost: MapsPostType.BUTTON,
        NeatQueueInformerMapsPlaylist: MapsPlaylistType.HCS_CURRENT,
        NeatQueueInformerMapsFormat: MapsFormatType.HCS,
        NeatQueueInformerMapsCount: 5,
        NeatQueueInformerLiveTracking: "N",
        NeatQueueInformerLiveTrackingChannelName: "N",
      });
    });

    it("auto-creates GuildConfig with NeatQueueInformerPlayerConnections when requested", async () => {
      const guildId = "guild-456";
      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(null);
      const runSpy = vi
        .spyOn(fakePreparedStatement, "run")
        .mockResolvedValue({ results: [], success: true, meta: fakeD1Meta });

      const config = await databaseService.getGuildConfig(guildId, true);

      expect(runSpy).toHaveBeenCalled();
      expect(config.NeatQueueInformerPlayerConnections).toBe("Y");
    });
  });

  describe("updateGuildConfig()", () => {
    const fakeD1Meta = {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 0,
      last_row_id: 0,
      changes: 0,
      last_insert_rowid: 0,
      changed_db: false,
    };

    it("updates NeatQueueInformerPlayerConnections only", async () => {
      const guildId = "guild-123";
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      const runSpy = vi
        .spyOn(fakePreparedStatement, "run")
        .mockResolvedValue({ results: [], success: true, meta: fakeD1Meta });

      await databaseService.updateGuildConfig(guildId, { NeatQueueInformerPlayerConnections: "N" });

      expect(prepareSpy).toHaveBeenCalledWith(
        "UPDATE GuildConfig SET NeatQueueInformerPlayerConnections = ? WHERE GuildId = ?",
      );
      expect(bindSpy).toHaveBeenCalledWith("N", guildId);
      expect(runSpy).toHaveBeenCalled();
    });

    it("updates StatsReturn only", async () => {
      const guildId = "guild-123";
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      const runSpy = vi
        .spyOn(fakePreparedStatement, "run")
        .mockResolvedValue({ results: [], success: true, meta: fakeD1Meta });

      await databaseService.updateGuildConfig(guildId, { StatsReturn: StatsReturnType.SERIES_ONLY });

      expect(prepareSpy).toHaveBeenCalledWith("UPDATE GuildConfig SET StatsReturn = ? WHERE GuildId = ?");
      expect(bindSpy).toHaveBeenCalledWith(StatsReturnType.SERIES_ONLY, guildId);
      expect(runSpy).toHaveBeenCalled();
    });

    it("updates Medals only", async () => {
      const guildId = "guild-123";
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      const runSpy = vi
        .spyOn(fakePreparedStatement, "run")
        .mockResolvedValue({ results: [], success: true, meta: fakeD1Meta });

      await databaseService.updateGuildConfig(guildId, { Medals: "N" });

      expect(prepareSpy).toHaveBeenCalledWith("UPDATE GuildConfig SET Medals = ? WHERE GuildId = ?");
      expect(bindSpy).toHaveBeenCalledWith("N", guildId);
      expect(runSpy).toHaveBeenCalled();
    });

    it("updates multiple fields", async () => {
      const guildId = "guild-123";
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      const runSpy = vi
        .spyOn(fakePreparedStatement, "run")
        .mockResolvedValue({ results: [], success: true, meta: fakeD1Meta });

      await databaseService.updateGuildConfig(guildId, {
        StatsReturn: StatsReturnType.SERIES_ONLY,
        Medals: "N",
        NeatQueueInformerPlayerConnections: "N",
      });

      expect(prepareSpy).toHaveBeenCalledWith(
        "UPDATE GuildConfig SET StatsReturn = ?, Medals = ?, NeatQueueInformerPlayerConnections = ? WHERE GuildId = ?",
      );
      expect(bindSpy).toHaveBeenCalledWith(StatsReturnType.SERIES_ONLY, "N", "N", guildId);
      expect(runSpy).toHaveBeenCalled();
    });

    it("does nothing if no updates provided", async () => {
      const guildId = "guild-123";
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.updateGuildConfig(guildId, {});

      expect(prepareSpy).not.toHaveBeenCalled();
      expect(bindSpy).not.toHaveBeenCalled();
      expect(runSpy).not.toHaveBeenCalled();
    });

    it("updates the guildConfigCache after DB update", async () => {
      const fakeGetPreparedStatement = new FakePreparedStatement<GuildConfigRow>();
      const guildId = "guild-789";
      const initialConfig: GuildConfigRow = {
        GuildId: guildId,
        StatsReturn: StatsReturnType.SERIES_ONLY,
        Medals: "Y",
        NeatQueueInformerPlayerConnections: "Y",
        NeatQueueInformerMapsPost: MapsPostType.BUTTON,
        NeatQueueInformerMapsPlaylist: MapsPlaylistType.HCS_CURRENT,
        NeatQueueInformerMapsFormat: MapsFormatType.HCS,
        NeatQueueInformerMapsCount: 5,
        NeatQueueInformerLiveTracking: "N",
        NeatQueueInformerLiveTrackingChannelName: "N",
      };
      vi.spyOn(fakeGetPreparedStatement, "first").mockResolvedValue(initialConfig);
      await databaseService.getGuildConfig(guildId);

      // Setup spies for update
      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "run").mockResolvedValue({ results: [], success: true, meta: fakeD1Meta });

      await databaseService.updateGuildConfig(guildId, { Medals: "N", NeatQueueInformerPlayerConnections: "N" });

      // Use public API to get updated config
      const updatedConfig = await databaseService.getGuildConfig(guildId);
      expect(updatedConfig).toEqual({
        GuildId: guildId,
        StatsReturn: StatsReturnType.SERIES_ONLY,
        Medals: "N",
        NeatQueueInformerPlayerConnections: "N",
        NeatQueueInformerMapsPost: MapsPostType.BUTTON,
        NeatQueueInformerMapsPlaylist: MapsPlaylistType.HCS_CURRENT,
        NeatQueueInformerMapsFormat: MapsFormatType.HCS,
        NeatQueueInformerMapsCount: 5,
        NeatQueueInformerLiveTracking: "N",
        NeatQueueInformerLiveTrackingChannelName: "N",
      });
    });
  });

  describe("getNeatQueueConfig()", () => {
    it("returns NeatQueueConfig when found", async () => {
      const config = {
        GuildId: "guild-123",
        ChannelId: "channel-456",
        WebhookSecret: "secret-hash",
        ResultsChannelId: "results-789",
        PostSeriesMode: "THREAD",
        PostSeriesChannelId: null,
      };

      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(config);

      const result = await databaseService.getNeatQueueConfig("guild-123", "channel-456");

      expect(result).toEqual(config);
    });

    it("throws error when NeatQueueConfig not found", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(null);

      await expect(databaseService.getNeatQueueConfig("guild-123", "channel-456")).rejects.toThrow(
        "No NeatQueueConfig found for GuildId: guild-123 and ChannelId: channel-456",
      );
    });
  });

  describe("findNeatQueueConfig()", () => {
    it("finds NeatQueueConfig by partial match", async () => {
      const config1 = {
        GuildId: "guild-123",
        ChannelId: "channel-456",
        WebhookSecret: "secret-hash",
        ResultsChannelId: "results-789",
        PostSeriesMode: "THREAD",
        PostSeriesChannelId: null,
      };

      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [config1] });

      const results = await databaseService.findNeatQueueConfig({ GuildId: "guild-123" });

      expect(results).toEqual([config1]);
    });

    it("returns empty array when no conditions provided", async () => {
      const results = await databaseService.findNeatQueueConfig({});

      expect(results).toEqual([]);
    });
  });

  describe("upsertNeatQueueConfig()", () => {
    it("upserts NeatQueueConfig", async () => {
      const config: NeatQueueConfigRow = {
        GuildId: "guild-123",
        ChannelId: "channel-456",
        WebhookSecret: "secret-hash",
        ResultsChannelId: "results-789",
        PostSeriesMode: NeatQueuePostSeriesDisplayMode.THREAD,
        PostSeriesChannelId: null,
      };

      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertNeatQueueConfig(config);

      expect(prepareSpy).toHaveBeenCalled();
      expect(bindSpy).toHaveBeenCalledWith(
        config.GuildId,
        config.ChannelId,
        config.WebhookSecret,
        config.ResultsChannelId,
        config.PostSeriesMode,
        config.PostSeriesChannelId,
      );
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("deleteNeatQueueConfig()", () => {
    it("deletes NeatQueueConfig", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteNeatQueueConfig("guild-123", "channel-456");

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM NeatQueueConfig WHERE GuildId = ? AND ChannelId = ?");
      expect(bindSpy).toHaveBeenCalledWith("guild-123", "channel-456");
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("getUserSession()", () => {
    it("gets a user session by session id", async () => {
      const session: UserSessionsRow = aFakeUserSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement<UserSessionsRow>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(session);

      const result = await databaseService.getUserSession(session.SessionId);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM UserSessions WHERE SessionId = ?");
      expect(bindSpy).toHaveBeenCalledWith(session.SessionId);
      expect(result).toEqual(session);
    });
  });

  describe("upsertUserSession()", () => {
    it("upserts user session", async () => {
      const session = aFakeUserSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertUserSession(session);

      expect(prepareSpy).toHaveBeenCalled();
      expect(bindSpy).toHaveBeenCalledWith(
        session.SessionId,
        session.UserId,
        session.AccessToken,
        session.RefreshToken,
        session.ExpiresAt,
        session.CreatedAt,
        session.LastRefreshedAt,
        session.AuthMetadataJson,
      );
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("deleteUserSession()", () => {
    it("deletes user session by session id", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteUserSession("session-1");

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM UserSessions WHERE SessionId = ?");
      expect(bindSpy).toHaveBeenCalledWith("session-1");
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("deleteExpiredUserSessions()", () => {
    it("deletes expired sessions using epoch seconds", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteExpiredUserSessions(12345);

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM UserSessions WHERE ExpiresAt <= ?");
      expect(bindSpy).toHaveBeenCalledWith(12345);
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("findIndividualTrackerActiveSession()", () => {
    it("returns the active tracker session for a user", async () => {
      const session: IndividualTrackerActiveSessionsRow = aFakeIndividualTrackerActiveSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement<IndividualTrackerActiveSessionsRow>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(session);

      const result = await databaseService.findIndividualTrackerActiveSession(session.UserId);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM IndividualTrackerActiveSessions WHERE UserId = ?");
      expect(bindSpy).toHaveBeenCalledWith(session.UserId);
      expect(result).toEqual(session);
    });
  });

  describe("findIndividualTrackerActiveSessionByXuid()", () => {
    it("returns the active tracker session for an active xbox identity", async () => {
      const session: IndividualTrackerActiveSessionsRow = aFakeIndividualTrackerActiveSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement<IndividualTrackerActiveSessionsRow>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(session);

      const result = await databaseService.findIndividualTrackerActiveSessionByXuid("2533274844642438");

      expect(prepareSpy).toHaveBeenCalledWith(`
      SELECT sessions.*
      FROM IndividualTrackerActiveSessions sessions
      INNER JOIN LinkedIdentities identities
        ON identities.UserId = sessions.UserId
      WHERE identities.Provider = 'xbox'
        AND identities.ProviderUserId = ?
        AND identities.IsActive = 1
      LIMIT 1
    `);
      expect(bindSpy).toHaveBeenCalledWith("2533274844642438");
      expect(result).toEqual(session);
    });
  });

  describe("findIndividualTrackerSessionsByUserId()", () => {
    it("returns tracker sessions for a user", async () => {
      const session: IndividualTrackerSessionsRow = aFakeIndividualTrackerSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement<IndividualTrackerSessionsRow>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [session] });

      const result = await databaseService.findIndividualTrackerSessionsByUserId(session.UserId);

      expect(prepareSpy).toHaveBeenCalledWith(
        "SELECT * FROM IndividualTrackerSessions WHERE UserId = ? ORDER BY UpdatedAt DESC",
      );
      expect(bindSpy).toHaveBeenCalledWith(session.UserId);
      expect(result).toEqual([session]);
    });
  });

  describe("findIndividualTrackerSessionsByXuids()", () => {
    it("returns tracker sessions for matching xuids", async () => {
      const session: IndividualTrackerSessionsRow = aFakeIndividualTrackerSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement<IndividualTrackerSessionsRow>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [session] });

      const result = await databaseService.findIndividualTrackerSessionsByXuids([session.Xuid]);

      expect(prepareSpy).toHaveBeenCalledWith(
        "SELECT * FROM IndividualTrackerSessions WHERE Xuid IN (?) ORDER BY UpdatedAt DESC",
      );
      expect(bindSpy).toHaveBeenCalledWith(session.Xuid);
      expect(result).toEqual([session]);
    });

    it("returns an empty array when no xuids are provided", async () => {
      const prepareSpy = vi.spyOn(env.DB, "prepare");

      const result = await databaseService.findIndividualTrackerSessionsByXuids([]);

      expect(prepareSpy).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe("upsertIndividualTrackerActiveSession()", () => {
    it("upserts the active tracker session for a user", async () => {
      const session = aFakeIndividualTrackerActiveSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertIndividualTrackerActiveSession(session.UserId, session.TrackerId);

      expect(prepareSpy).toHaveBeenCalled();
      expect(bindSpy).toHaveBeenCalledWith(session.UserId, session.TrackerId);
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("upsertIndividualTrackerSession()", () => {
    it("upserts tracker session metadata including xuid", async () => {
      const session = aFakeIndividualTrackerSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertIndividualTrackerSession(
        session.UserId,
        session.TrackerId,
        session.Xuid,
        session.Gamertag,
      );

      expect(prepareSpy).toHaveBeenCalled();
      expect(bindSpy).toHaveBeenCalledWith(session.UserId, session.TrackerId, session.Xuid, session.Gamertag);
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("deleteIndividualTrackerSession()", () => {
    it("deletes tracker session metadata", async () => {
      const session = aFakeIndividualTrackerSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteIndividualTrackerSession(session.UserId, session.TrackerId);

      expect(prepareSpy).toHaveBeenCalledWith(
        "DELETE FROM IndividualTrackerSessions WHERE UserId = ? AND TrackerId = ?",
      );
      expect(bindSpy).toHaveBeenCalledWith(session.UserId, session.TrackerId);
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("deleteIndividualTrackerActiveSession()", () => {
    it("deletes the active tracker session for a user", async () => {
      const session = aFakeIndividualTrackerActiveSessionsRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteIndividualTrackerActiveSession(session.UserId);

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM IndividualTrackerActiveSessions WHERE UserId = ?");
      expect(bindSpy).toHaveBeenCalledWith(session.UserId);
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("findLinkedIdentitiesByUserId()", () => {
    it("returns linked identities for a user", async () => {
      const identity: LinkedIdentitiesRow = aFakeLinkedIdentitiesRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [identity] });

      const results = await databaseService.findLinkedIdentitiesByUserId("user-1");

      expect(prepareSpy).toHaveBeenCalledWith(
        "SELECT * FROM LinkedIdentities WHERE UserId = ? ORDER BY CreatedAt DESC",
      );
      expect(bindSpy).toHaveBeenCalledWith("user-1");
      expect(results).toEqual([identity]);
    });
  });

  describe("getLinkedIdentityByProvider()", () => {
    it("returns linked identity by provider and provider user id", async () => {
      const identity: LinkedIdentitiesRow = aFakeLinkedIdentitiesRow();
      const fakePreparedStatement = new FakePreparedStatement<LinkedIdentitiesRow>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(identity);

      const result = await databaseService.getLinkedIdentityByProvider("xbox", "xbox-user-1");

      expect(prepareSpy).toHaveBeenCalledWith(
        "SELECT * FROM LinkedIdentities WHERE Provider = ? AND ProviderUserId = ?",
      );
      expect(bindSpy).toHaveBeenCalledWith("xbox", "xbox-user-1");
      expect(result).toEqual(identity);
    });
  });

  describe("upsertLinkedIdentity()", () => {
    it("upserts linked identity", async () => {
      const identity = aFakeLinkedIdentitiesRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertLinkedIdentity(identity);

      expect(prepareSpy).toHaveBeenCalled();
      expect(bindSpy).toHaveBeenCalledWith(
        identity.IdentityId,
        identity.UserId,
        identity.Provider,
        identity.ProviderUserId,
        identity.Gamertag,
        identity.TwitchId,
        identity.IsActive,
        identity.CreatedAt,
        identity.UpdatedAt,
      );
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("createIndividualTrackerProfile()", () => {
    it("creates individual tracker profile", async () => {
      const profile = aFakeIndividualTrackerProfilesRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.createIndividualTrackerProfile(profile);

      expect(prepareSpy).toHaveBeenCalledWith(
        "INSERT INTO IndividualTrackerProfiles (ProfileId, UserId, ActiveIdentityId, Name, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      );
      expect(bindSpy).toHaveBeenCalledWith(
        profile.ProfileId,
        profile.UserId,
        profile.ActiveIdentityId,
        profile.Name,
        profile.CreatedAt,
        profile.UpdatedAt,
      );
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("getIndividualTrackerProfile()", () => {
    it("returns individual tracker profile by profile id", async () => {
      const profile: IndividualTrackerProfilesRow = aFakeIndividualTrackerProfilesRow();
      const fakePreparedStatement = new FakePreparedStatement<IndividualTrackerProfilesRow>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(profile);

      const result = await databaseService.getIndividualTrackerProfile(profile.ProfileId);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM IndividualTrackerProfiles WHERE ProfileId = ?");
      expect(bindSpy).toHaveBeenCalledWith(profile.ProfileId);
      expect(result).toEqual(profile);
    });
  });

  describe("findIndividualTrackerProfilesByUserId()", () => {
    it("returns individual tracker profiles by user id", async () => {
      const profile: IndividualTrackerProfilesRow = aFakeIndividualTrackerProfilesRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [profile] });

      const results = await databaseService.findIndividualTrackerProfilesByUserId(profile.UserId);

      expect(prepareSpy).toHaveBeenCalledWith(
        "SELECT * FROM IndividualTrackerProfiles WHERE UserId = ? ORDER BY CreatedAt ASC",
      );
      expect(bindSpy).toHaveBeenCalledWith(profile.UserId);
      expect(results).toEqual([profile]);
    });
  });

  describe("updateIndividualTrackerProfile()", () => {
    it("updates selected fields for individual tracker profile", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.updateIndividualTrackerProfile("profile-1", {
        Name: "updated",
        UpdatedAt: 12345,
      });

      expect(prepareSpy).toHaveBeenCalledWith(
        "UPDATE IndividualTrackerProfiles SET Name = ?, UpdatedAt = ? WHERE ProfileId = ?",
      );
      expect(bindSpy).toHaveBeenCalledWith("updated", 12345, "profile-1");
      expect(runSpy).toHaveBeenCalled();
    });

    it("does nothing when no updates are provided", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);

      await databaseService.updateIndividualTrackerProfile("profile-1", {});

      expect(prepareSpy).not.toHaveBeenCalled();
    });
  });

  describe("getIndividualTrackerGames()", () => {
    it("returns games ordered by position", async () => {
      const game: IndividualTrackerGamesRow = aFakeIndividualTrackerGamesRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [game] });

      const results = await databaseService.getIndividualTrackerGames("profile-1");

      expect(prepareSpy).toHaveBeenCalledWith(
        "SELECT * FROM IndividualTrackerGames WHERE ProfileId = ? ORDER BY Position ASC",
      );
      expect(bindSpy).toHaveBeenCalledWith("profile-1");
      expect(results).toEqual([game]);
    });
  });

  describe("replaceIndividualTrackerGames()", () => {
    it("replaces games by deleting existing rows then inserting new rows", async () => {
      const game = aFakeIndividualTrackerGamesRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.replaceIndividualTrackerGames("profile-1", [game]);

      expect(prepareSpy).toHaveBeenNthCalledWith(1, "DELETE FROM IndividualTrackerGames WHERE ProfileId = ?");
      expect(bindSpy).toHaveBeenCalledWith("profile-1");
      expect(runSpy).toHaveBeenCalled();
      expect(prepareSpy).toHaveBeenCalledTimes(2);
    });

    it("only deletes rows when replacement list is empty", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);

      await databaseService.replaceIndividualTrackerGames("profile-1", []);

      expect(prepareSpy).toHaveBeenCalledTimes(1);
      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM IndividualTrackerGames WHERE ProfileId = ?");
    });
  });

  describe("getStreamerViewSettings()", () => {
    it("returns streamer view settings by profile id", async () => {
      const settings: StreamerViewSettingsRow = aFakeStreamerViewSettingsRow();
      const fakePreparedStatement = new FakePreparedStatement<StreamerViewSettingsRow>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(settings);

      const result = await databaseService.getStreamerViewSettings(settings.ProfileId);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM StreamerViewSettings WHERE ProfileId = ?");
      expect(bindSpy).toHaveBeenCalledWith(settings.ProfileId);
      expect(result).toEqual(settings);
    });
  });

  describe("upsertStreamerViewSettings()", () => {
    it("upserts streamer view settings", async () => {
      const settings = aFakeStreamerViewSettingsRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertStreamerViewSettings(settings);

      expect(prepareSpy).toHaveBeenCalled();
      expect(bindSpy).toHaveBeenCalledWith(
        settings.ProfileId,
        settings.LayoutOptionsJson,
        settings.VisibleSectionsJson,
        settings.StyleFlagsJson,
        settings.UpdatedAt,
      );
      expect(runSpy).toHaveBeenCalled();
    });
  });
});
