import { describe, it, expect, beforeEach, vi } from "vitest";
import { aFakeEnvWith, fakeD1Response, FakePreparedStatement } from "../../../base/fakes/env.fake.mjs";
import { DatabaseService } from "../database.mjs";
import { aFakeDiscordAssociationsRow } from "../fakes/database.fake.mjs";
import type { GuildConfigRow } from "../types/guild_config.mjs";
import { StatsReturnType, MapsPostType, MapsPlaylistType, MapsFormatType } from "../types/guild_config.mjs";

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
      });
    });
  });
});
