import { describe, it, expect, beforeEach, vi } from "vitest";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { aFakeEnvWith, fakeD1Response, FakePreparedStatement } from "../../../base/fakes/env.fake";
import { SESSION_COOKIE_MAX_AGE_SECONDS } from "../../auth/session-manager";
import { DatabaseService } from "../database";
import {
  aFakeDiscordAssociationsRow,
  aFakeGuildConfigRow,
  aFakeNeatQueueConfigRow,
  aFakeUserSessionsRow,
  aFakeUserCredentialsRow,
  aFakeLinkedIdentitiesRow,
  aFakeIndividualTrackerProfilesRow,
  aFakeIndividualTrackerGamesRow,
  aFakeStreamerViewSettingsRow,
  aFakeIndividualTrackersRow,
  aFakeLeaderboardConfigRow,
  aFakeLeaderboardSeriesRow,
  aFakeLeaderboardSeriesPlayersRow,
  aFakeLeaderboardGamesRow,
  aFakeLeaderboardGamePlayersRow,
  aFakeLeaderboardPostRow,
  aFakeMatchKillMatrixRow,
} from "../fakes/database.fake";
import type { GuildConfigRow } from "../types/guild_config";
import { StatsReturnType, MapsPostType, MapsPlaylistType, MapsFormatType } from "../types/guild_config";
import type { NeatQueueConfigRow } from "../types/neat_queue_config";
import { NeatQueuePostSeriesDisplayMode } from "../types/neat_queue_config";
import type { UserSessionsRow } from "../types/user_sessions";
import type { LinkedIdentitiesRow } from "../types/linked_identities";
import type { IndividualTrackerProfilesRow } from "../types/individual_tracker_profiles";
import type { IndividualTrackerGamesRow } from "../types/individual_tracker_games";
import type { StreamerViewSettingsRow } from "../types/streamer_view_settings";
import type { MatchKillMatrixRow } from "../types/match_kill_matrix";

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

    it("returns empty array when no Discord IDs are provided", async () => {
      const prepareSpy = vi.spyOn(env.DB, "prepare");

      const discordAssociations = await databaseService.getDiscordAssociations([]);

      expect(discordAssociations).toEqual([]);
      expect(prepareSpy).not.toHaveBeenCalled();
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

    it("returns empty array when no Xbox IDs are provided", async () => {
      const prepareSpy = vi.spyOn(env.DB, "prepare");

      const discordAssociations = await databaseService.getDiscordAssociationsByXboxId([]);

      expect(discordAssociations).toEqual([]);
      expect(prepareSpy).not.toHaveBeenCalled();
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

    it("falls back to HCS Current for legacy Lucid Evo configuration", async () => {
      const guildId = "guild-legacy-lucid";
      const legacyConfig = {
        ...aFakeGuildConfigRow({ GuildId: guildId }),
        NeatQueueInformerMapsPlaylist: "L" as const,
      };
      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(legacyConfig);

      const config = await databaseService.getGuildConfig(guildId);

      expect(config.NeatQueueInformerMapsPlaylist).toBe(MapsPlaylistType.HCS_CURRENT);
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

  describe("getAllNeatQueueConfigs()", () => {
    it("returns every NeatQueueConfig row", async () => {
      const config1 = aFakeNeatQueueConfigRow({ GuildId: "guild-1", ChannelId: "channel-1" });
      const config2 = aFakeNeatQueueConfigRow({ GuildId: "guild-2", ChannelId: "channel-2" });

      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [config1, config2] });

      const results = await databaseService.getAllNeatQueueConfigs();

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM NeatQueueConfig");
      expect(results).toEqual([config1, config2]);
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

  describe("Leaderboard persistence", () => {
    it("returns default leaderboard config when not found", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(null);

      const result = await databaseService.getLeaderboardConfig("guild-123");

      expect(result).not.toBeNull();
      expect(result.GuildId).toBe("guild-123");
      expect(result.EnabledWindowsJson).toBe('["1W","1M","3M","6M","12M"]');
      expect(result.DefaultWindow).toBe(LeaderboardWindow.ThreeMonths);
      expect(result.DefaultMetric).toBe(LeaderboardMetric.SeriesWinRate);
      expect(result.MinGamesPlayed).toBe(5);
      expect(result.UpdatedAt).toEqual(expect.any(Number));
    });

    it("auto-creates leaderboard config when requested", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(null);
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.getLeaderboardConfig("guild-123", true);

      expect(prepareSpy).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT(GuildId) DO NOTHING"));
      expect(runSpy).toHaveBeenCalled();
    });

    it("upserts leaderboard config", async () => {
      const config = aFakeLeaderboardConfigRow({ GuildId: "guild-123" });
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertLeaderboardConfig(config);

      expect(prepareSpy).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO LeaderboardConfig"));
      expect(bindSpy).toHaveBeenCalledWith(
        config.GuildId,
        config.EnabledWindowsJson,
        config.DefaultWindow,
        config.DefaultMetric,
        config.MinGamesPlayed,
        config.UpdatedAt,
      );
      expect(runSpy).toHaveBeenCalled();
    });

    it("upserts leaderboard series", async () => {
      const series = aFakeLeaderboardSeriesRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertLeaderboardSeries(series);

      expect(prepareSpy).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO LeaderboardSeries"));
      expect(prepareSpy).toHaveBeenCalledWith(expect.not.stringContaining("CreatedAt=excluded.CreatedAt"));
      expect(bindSpy).toHaveBeenCalledWith(
        series.GuildId,
        series.QueueNumber,
        series.QueueChannelId,
        series.ResultsChannelId,
        series.StartedAt,
        series.CompletedAt,
        series.WinnerTeamIndex,
        series.SeriesScore,
        series.Source,
        series.CreatedAt,
        series.UpdatedAt,
      );
      expect(runSpy).toHaveBeenCalled();
    });

    it("upserts leaderboard series players and games/game players", async () => {
      const seriesPlayers = [aFakeLeaderboardSeriesPlayersRow()];
      const games = [aFakeLeaderboardGamesRow()];
      const gamePlayers = [aFakeLeaderboardGamePlayersRow()];
      const deleteSeriesPlayersStatement = new FakePreparedStatement();
      const insertSeriesPlayersStatement = new FakePreparedStatement();
      const deleteGamesStatement = new FakePreparedStatement();
      const upsertGamesStatement = new FakePreparedStatement();
      const gamePlayersStatement = new FakePreparedStatement();

      vi.spyOn(deleteSeriesPlayersStatement, "bind").mockReturnThis();
      vi.spyOn(insertSeriesPlayersStatement, "bind").mockReturnThis();
      vi.spyOn(deleteGamesStatement, "bind").mockReturnThis();
      vi.spyOn(upsertGamesStatement, "bind").mockReturnThis();
      vi.spyOn(gamePlayersStatement, "bind").mockReturnThis();

      const prepareSpy = vi
        .spyOn(env.DB, "prepare")
        .mockReturnValueOnce(deleteSeriesPlayersStatement)
        .mockReturnValueOnce(insertSeriesPlayersStatement)
        .mockReturnValueOnce(deleteGamesStatement)
        .mockReturnValueOnce(upsertGamesStatement)
        .mockReturnValueOnce(gamePlayersStatement);
      const batchSpy = vi
        .spyOn(env.DB, "batch")
        .mockResolvedValue([{ ...fakeD1Response, results: [] }])
        .mockResolvedValueOnce([{ ...fakeD1Response, results: [] }])
        .mockResolvedValueOnce([{ ...fakeD1Response, results: [] }]);

      await databaseService.upsertLeaderboardSeriesPlayers(seriesPlayers);
      await databaseService.upsertLeaderboardGames(games);
      await databaseService.upsertLeaderboardGamePlayers(gamePlayers);

      expect(prepareSpy).toHaveBeenNthCalledWith(
        1,
        "DELETE FROM LeaderboardSeriesPlayers WHERE GuildId = ? AND QueueNumber = ? AND XboxXuid NOT IN (?)",
      );
      expect(prepareSpy).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO LeaderboardSeriesPlayers"));
      expect(prepareSpy).toHaveBeenNthCalledWith(
        3,
        "DELETE FROM LeaderboardGames WHERE GuildId = ? AND QueueNumber = ?",
      );
      expect(prepareSpy).toHaveBeenNthCalledWith(4, expect.stringContaining("INSERT INTO LeaderboardGames"));
      expect(prepareSpy).toHaveBeenNthCalledWith(5, expect.stringContaining("HeadshotKills"));
      const gamePlayersInsertQuery = prepareSpy.mock.calls[4]?.[0];
      const countBoundParameters = (sql: string): number => sql.split("?").length - 1;
      if (gamePlayersInsertQuery != null) {
        expect(countBoundParameters(gamePlayersInsertQuery)).toBe(34);
      }
      expect(batchSpy).toHaveBeenNthCalledWith(1, [deleteSeriesPlayersStatement, insertSeriesPlayersStatement]);
      expect(batchSpy).toHaveBeenNthCalledWith(2, [deleteGamesStatement, upsertGamesStatement]);
      expect(batchSpy).toHaveBeenNthCalledWith(3, [gamePlayersStatement]);
    });

    it("chunks leaderboard game player upserts to stay below d1 variable limit", async () => {
      const gamePlayers = Array.from({ length: 40 }, (_, index) =>
        aFakeLeaderboardGamePlayersRow({
          MatchId: `match-${index.toString()}`,
          XboxXuid: `xuid-${index.toString()}`,
        }),
      );
      const chunkStatements = Array.from({ length: 20 }, () => new FakePreparedStatement());
      let prepareCallCount = 0;
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockImplementation(() => {
        const statement = chunkStatements[prepareCallCount];
        prepareCallCount += 1;
        return statement ?? new FakePreparedStatement();
      });
      const bindSpies = chunkStatements.map((statement) => vi.spyOn(statement, "bind").mockReturnThis());
      const batchSpy = vi.spyOn(env.DB, "batch").mockResolvedValue([{ ...fakeD1Response, results: [] }]);

      await databaseService.upsertLeaderboardGamePlayers(gamePlayers);

      expect(prepareSpy).toHaveBeenCalledTimes(20);
      for (const bindSpy of bindSpies) {
        expect(bindSpy).toHaveBeenCalledTimes(1);
      }
      expect(batchSpy).toHaveBeenCalledWith(chunkStatements);
    });

    it("upserts leaderboard series, games, and players in a single batch", async () => {
      const series = aFakeLeaderboardSeriesRow();
      const seriesPlayers = [aFakeLeaderboardSeriesPlayersRow()];
      const games = [aFakeLeaderboardGamesRow()];
      const gamePlayers = [aFakeLeaderboardGamePlayersRow()];
      const existingGamesStmt = new FakePreparedStatement<{ MatchId: string; CreatedAt: number }>();
      const existingGamePlayersStmt = new FakePreparedStatement<{
        MatchId: string;
        XboxXuid: string;
        CreatedAt: number;
      }>();
      const existingSeriesPlayersStmt = new FakePreparedStatement<{ XboxXuid: string; CreatedAt: number }>();
      const gameWonTableInfoStmt = new FakePreparedStatement<{ name: string }>();
      const batchedStatements = Array.from({ length: 6 }, () => new FakePreparedStatement());
      const prepareSpy = vi
        .spyOn(env.DB, "prepare")
        .mockReturnValueOnce(gameWonTableInfoStmt)
        .mockReturnValueOnce(existingGamesStmt)
        .mockReturnValueOnce(existingGamePlayersStmt)
        .mockReturnValueOnce(existingSeriesPlayersStmt);

      for (const statement of batchedStatements) {
        prepareSpy.mockReturnValueOnce(statement);
      }

      const batchSpy = vi.spyOn(env.DB, "batch").mockResolvedValue([{ ...fakeD1Response, results: [] }]);
      vi.spyOn(existingGamesStmt, "bind").mockReturnThis();
      vi.spyOn(existingGamePlayersStmt, "bind").mockReturnThis();
      vi.spyOn(existingSeriesPlayersStmt, "bind").mockReturnThis();
      vi.spyOn(existingGamesStmt, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
      vi.spyOn(existingGamePlayersStmt, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
      vi.spyOn(existingSeriesPlayersStmt, "all").mockResolvedValue({ ...fakeD1Response, results: [] });

      for (const statement of batchedStatements) {
        vi.spyOn(statement, "bind").mockReturnThis();
      }

      await databaseService.upsertLeaderboardSeriesDataBatch({
        series,
        games,
        gamePlayers,
        seriesPlayers,
      });

      expect(prepareSpy).toHaveBeenNthCalledWith(
        1,
        "SELECT MatchId, CreatedAt FROM LeaderboardGames WHERE GuildId = ? AND QueueNumber = ?",
      );
      expect(prepareSpy).toHaveBeenNthCalledWith(
        2,
        "SELECT MatchId, XboxXuid, CreatedAt FROM LeaderboardGamePlayers WHERE GuildId = ? AND QueueNumber = ?",
      );
      expect(prepareSpy).toHaveBeenNthCalledWith(
        3,
        "SELECT XboxXuid, CreatedAt FROM LeaderboardSeriesPlayers WHERE GuildId = ? AND QueueNumber = ?",
      );
      expect(prepareSpy).toHaveBeenNthCalledWith(
        6,
        "DELETE FROM LeaderboardGames WHERE GuildId = ? AND QueueNumber = ?",
      );
      const preparedQueries = prepareSpy.mock.calls
        .map(([query]) => query)
        .filter((query): query is string => typeof query === "string");
      const gamePlayerInsertQueries = preparedQueries.filter((query) =>
        query.includes("INSERT INTO LeaderboardGamePlayers"),
      );
      const countBoundParameters = (sql: string): number => sql.split("?").length - 1;
      expect(gamePlayerInsertQueries).toHaveLength(1);
      expect(countBoundParameters(gamePlayerInsertQueries[0] ?? "")).toBe(34);
      expect(batchSpy).toHaveBeenCalledTimes(1);
      expect(batchSpy).toHaveBeenCalledWith(batchedStatements);
    });

    it("chunks series-player upserts to stay under D1 variable limits", async () => {
      const series = aFakeLeaderboardSeriesRow();
      const seriesPlayers = Array.from({ length: 80 }, (_, index) =>
        aFakeLeaderboardSeriesPlayersRow({
          XboxXuid: `xuid-${index.toString()}`,
          DiscordUserId: `discord-${index.toString()}`,
        }),
      );
      const games = [aFakeLeaderboardGamesRow()];
      const gamePlayers = [aFakeLeaderboardGamePlayersRow()];

      const existingGamesStmt = new FakePreparedStatement<{ MatchId: string; CreatedAt: number }>();
      const existingGamePlayersStmt = new FakePreparedStatement<{
        MatchId: string;
        XboxXuid: string;
        CreatedAt: number;
      }>();
      const existingSeriesPlayersStmt = new FakePreparedStatement<{ XboxXuid: string; CreatedAt: number }>();

      const prepareSpy = vi
        .spyOn(env.DB, "prepare")
        .mockReturnValueOnce(existingGamesStmt)
        .mockReturnValueOnce(existingGamePlayersStmt)
        .mockReturnValueOnce(existingSeriesPlayersStmt)
        .mockImplementation(() => new FakePreparedStatement());

      vi.spyOn(existingGamesStmt, "bind").mockReturnThis();
      vi.spyOn(existingGamePlayersStmt, "bind").mockReturnThis();
      vi.spyOn(existingSeriesPlayersStmt, "bind").mockReturnThis();
      vi.spyOn(existingGamesStmt, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
      vi.spyOn(existingGamePlayersStmt, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
      vi.spyOn(existingSeriesPlayersStmt, "all").mockResolvedValue({ ...fakeD1Response, results: [] });

      const batchSpy = vi.spyOn(env.DB, "batch").mockResolvedValue([{ ...fakeD1Response, results: [] }]);

      await databaseService.upsertLeaderboardSeriesDataBatch({
        series,
        games,
        gamePlayers,
        seriesPlayers,
      });

      const preparedQueries = prepareSpy.mock.calls
        .map(([query]) => query)
        .filter((query): query is string => typeof query === "string");
      const seriesPlayerInsertStatements = preparedQueries.filter((query) =>
        query.includes("INSERT INTO LeaderboardSeriesPlayers"),
      );

      expect(batchSpy).toHaveBeenCalledTimes(1);
      expect(seriesPlayerInsertStatements.length).toBeGreaterThan(1);
    });

    it("chunks batch inserts for match-complete payload sizes", async () => {
      const series = aFakeLeaderboardSeriesRow();
      const seriesPlayers = Array.from({ length: 8 }, (_, index) =>
        aFakeLeaderboardSeriesPlayersRow({
          XboxXuid: `series-xuid-${index.toString()}`,
          DiscordUserId: `series-discord-${index.toString()}`,
        }),
      );
      const games = Array.from({ length: 2 }, (_, index) =>
        aFakeLeaderboardGamesRow({
          MatchId: `match-${index.toString()}`,
        }),
      );
      const gamePlayers = Array.from({ length: 16 }, (_, index) =>
        aFakeLeaderboardGamePlayersRow({
          MatchId: `match-${Math.floor(index / 8).toString()}`,
          XboxXuid: `game-xuid-${index.toString()}`,
          DiscordUserId: `game-discord-${index.toString()}`,
        }),
      );

      const existingGamesStmt = new FakePreparedStatement<{ MatchId: string; CreatedAt: number }>();
      const existingGamePlayersStmt = new FakePreparedStatement<{
        MatchId: string;
        XboxXuid: string;
        CreatedAt: number;
      }>();
      const existingSeriesPlayersStmt = new FakePreparedStatement<{ XboxXuid: string; CreatedAt: number }>();

      const prepareSpy = vi
        .spyOn(env.DB, "prepare")
        .mockReturnValueOnce(existingGamesStmt)
        .mockReturnValueOnce(existingGamePlayersStmt)
        .mockReturnValueOnce(existingSeriesPlayersStmt)
        .mockImplementation(() => new FakePreparedStatement());

      vi.spyOn(existingGamesStmt, "bind").mockReturnThis();
      vi.spyOn(existingGamePlayersStmt, "bind").mockReturnThis();
      vi.spyOn(existingSeriesPlayersStmt, "bind").mockReturnThis();
      vi.spyOn(existingGamesStmt, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
      vi.spyOn(existingGamePlayersStmt, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
      vi.spyOn(existingSeriesPlayersStmt, "all").mockResolvedValue({ ...fakeD1Response, results: [] });

      await databaseService.upsertLeaderboardSeriesDataBatch({
        series,
        games,
        gamePlayers,
        seriesPlayers,
      });

      const preparedQueries = prepareSpy.mock.calls
        .map(([query]) => query)
        .filter((query): query is string => typeof query === "string");

      const gamePlayerInsertStatements = preparedQueries.filter((query) =>
        query.includes("INSERT INTO LeaderboardGamePlayers"),
      );
      const seriesPlayerInsertStatements = preparedQueries.filter((query) =>
        query.includes("INSERT INTO LeaderboardSeriesPlayers"),
      );
      const d1MaxBoundParametersPerStatement = 100;
      const countBoundParameters = (sql: string): number => sql.split("?").length - 1;

      expect(gamePlayerInsertStatements.length).toBeGreaterThan(1);
      expect(seriesPlayerInsertStatements.length).toBeGreaterThan(1);
      for (const query of gamePlayerInsertStatements) {
        expect(countBoundParameters(query)).toBeLessThanOrEqual(d1MaxBoundParametersPerStatement);
      }
      for (const query of seriesPlayerInsertStatements) {
        expect(countBoundParameters(query)).toBeLessThanOrEqual(d1MaxBoundParametersPerStatement);
      }
    });

    it("does not overwrite created timestamps in leaderboard upserts", async () => {
      const series = aFakeLeaderboardSeriesRow();
      const seriesPlayers = [aFakeLeaderboardSeriesPlayersRow()];
      const games = [aFakeLeaderboardGamesRow()];
      const gamePlayers = [aFakeLeaderboardGamePlayersRow()];
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertLeaderboardSeries(series);
      await databaseService.upsertLeaderboardSeriesPlayers(seriesPlayers);
      await databaseService.upsertLeaderboardGames(games);
      await databaseService.upsertLeaderboardGamePlayers(gamePlayers);

      const preparedQueries = prepareSpy.mock.calls
        .map(([query]) => query)
        .filter((query) => typeof query === "string");
      for (const query of preparedQueries) {
        expect(query).not.toContain("CreatedAt=excluded.CreatedAt");
      }
    });

    it("does nothing for empty leaderboard player/game upserts", async () => {
      const prepareSpy = vi.spyOn(env.DB, "prepare");

      await databaseService.upsertLeaderboardSeriesPlayers([]);
      await databaseService.upsertLeaderboardGames([]);
      await databaseService.upsertLeaderboardGamePlayers([]);

      expect(prepareSpy).not.toHaveBeenCalled();
    });

    it("throws when series players contain multiple guild/queue combinations", async () => {
      const players = [
        aFakeLeaderboardSeriesPlayersRow({ GuildId: "guild-1", QueueNumber: 100 }),
        aFakeLeaderboardSeriesPlayersRow({ GuildId: "guild-2", QueueNumber: 200, XboxXuid: "xuid-2" }),
      ];

      await expect(databaseService.upsertLeaderboardSeriesPlayers(players)).rejects.toThrow(
        "Expected leaderboard series players to belong to a single guild and queue",
      );
    });

    it("deletes leaderboard data by guild and queue", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteLeaderboardDataForGuild("guild-123");
      await databaseService.deleteLeaderboardDataForQueueChannel("guild-123", "queue-789");

      expect(prepareSpy).toHaveBeenNthCalledWith(1, "DELETE FROM LeaderboardSeries WHERE GuildId = ?");
      expect(prepareSpy).toHaveBeenNthCalledWith(
        2,
        "DELETE FROM LeaderboardSeries WHERE GuildId = ? AND QueueChannelId = ?",
      );
      expect(bindSpy).toHaveBeenNthCalledWith(1, "guild-123");
      expect(bindSpy).toHaveBeenNthCalledWith(2, "guild-123", "queue-789");
      expect(runSpy).toHaveBeenCalledTimes(2);
    });

    it("deletes expired leaderboard data and unlinked kill matrices in one batch", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const batchSpy = vi.spyOn(env.DB, "batch");

      await databaseService.deleteExpiredLeaderboardData({
        leaderboardRetentionBoundary: 1_000,
        orphanedKillMatrixRetentionBoundary: 2_000,
      });

      expect(prepareSpy).toHaveBeenNthCalledWith(1, expect.stringContaining("DELETE FROM MatchKillMatrix"));
      expect(prepareSpy).toHaveBeenNthCalledWith(2, "DELETE FROM LeaderboardSeries WHERE CompletedAt < ?");
      expect(prepareSpy).toHaveBeenNthCalledWith(3, expect.stringContaining("NOT EXISTS"));
      expect(bindSpy).toHaveBeenNthCalledWith(1, 1_000);
      expect(bindSpy).toHaveBeenNthCalledWith(2, 1_000);
      expect(bindSpy).toHaveBeenNthCalledWith(3, 2_000);
      expect(batchSpy).toHaveBeenCalledOnce();
    });

    it("upserts a leaderboard post registration", async () => {
      const post = aFakeLeaderboardPostRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertLeaderboardPost(post);

      expect(prepareSpy).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO LeaderboardPosts"));
      expect(bindSpy).toHaveBeenCalledWith(post.ChannelId, post.MessageId, post.GuildId, post.QueueChannelId);
      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it("finds guild-wide and matching queue leaderboard posts for refresh", async () => {
      const guildWidePost = aFakeLeaderboardPostRow();
      const queuePost = aFakeLeaderboardPostRow({
        ChannelId: "leaderboard-channel-2",
        MessageId: "leaderboard-message-2",
        QueueChannelId: "queue-channel-1",
      });
      const fakePreparedStatement = new FakePreparedStatement<typeof guildWidePost>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({
        ...fakeD1Response,
        results: [guildWidePost, queuePost],
      });

      const posts = await databaseService.findLeaderboardPostsForRefresh("guild-1", "queue-channel-1");

      expect(prepareSpy).toHaveBeenCalledWith(
        "SELECT * FROM LeaderboardPosts WHERE GuildId = ? AND (QueueChannelId IS NULL OR QueueChannelId = ?)",
      );
      expect(bindSpy).toHaveBeenCalledWith("guild-1", "queue-channel-1");
      expect(posts).toEqual([guildWidePost, queuePost]);
    });

    it("finds every leaderboard post for a guild reset", async () => {
      const post = aFakeLeaderboardPostRow();
      const fakePreparedStatement = new FakePreparedStatement<typeof post>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [post] });

      const posts = await databaseService.findLeaderboardPostsForGuildRefresh("guild-1");

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM LeaderboardPosts WHERE GuildId = ?");
      expect(bindSpy).toHaveBeenCalledWith("guild-1");
      expect(posts).toEqual([post]);
    });

    it("gets every leaderboard post for reaping", async () => {
      const post = aFakeLeaderboardPostRow();
      const fakePreparedStatement = new FakePreparedStatement<typeof post>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [post] });

      const posts = await databaseService.getAllLeaderboardPosts();

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM LeaderboardPosts");
      expect(posts).toEqual([post]);
    });

    it("upserts and reads a scoped leaderboard reset marker", async () => {
      const marker = {
        GuildId: "guild-123",
        QueueChannelId: "queue-123",
        ResetAt: 1_723_600_000,
        CreatedAt: 1_723_600_000,
        UpdatedAt: 1_723_600_000,
      };
      const statement = new FakePreparedStatement<typeof marker>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(statement);
      const bindSpy = vi.spyOn(statement, "bind");
      vi.spyOn(statement, "first").mockResolvedValue(marker);

      await databaseService.upsertLeaderboardResetMarker(marker);
      const result = await databaseService.getLeaderboardResetMarker("guild-123", "queue-123");

      expect(prepareSpy.mock.calls[0]?.[0]).toContain("INSERT INTO LeaderboardResetMarkers");
      expect(bindSpy).toHaveBeenCalledWith("guild-123", "queue-123", 1_723_600_000, 1_723_600_000, 1_723_600_000);
      expect(result).toEqual(marker);
    });

    it("upserts and reads a server-wide leaderboard reset marker", async () => {
      const marker = {
        GuildId: "guild-123",
        QueueChannelId: null,
        ResetAt: 1_723_600_000,
        CreatedAt: 1_723_600_000,
        UpdatedAt: 1_723_600_000,
      };
      const statement = new FakePreparedStatement<typeof marker>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(statement);
      const bindSpy = vi.spyOn(statement, "bind");
      vi.spyOn(statement, "first").mockResolvedValue(marker);

      await databaseService.upsertLeaderboardResetMarker(marker);
      const result = await databaseService.getLeaderboardResetMarker("guild-123", null);

      expect(prepareSpy.mock.calls[0]?.[0]).toContain("INSERT INTO LeaderboardResetMarkers");
      expect(bindSpy).toHaveBeenCalledWith("guild-123", "", 1_723_600_000, 1_723_600_000, 1_723_600_000);
      expect(result).toEqual(marker);
    });

    it("aggregates headshot kills and ranks all deaths metrics lowest first", async () => {
      const countStatement = new FakePreparedStatement<{ Total: number }>();
      const rowsStatement = new FakePreparedStatement();
      const prepareSpy = vi
        .spyOn(env.DB, "prepare")
        .mockReturnValueOnce(countStatement)
        .mockReturnValueOnce(rowsStatement)
        .mockReturnValueOnce(countStatement)
        .mockReturnValueOnce(rowsStatement)
        .mockReturnValueOnce(countStatement)
        .mockReturnValueOnce(rowsStatement)
        .mockReturnValueOnce(countStatement)
        .mockReturnValueOnce(rowsStatement);
      vi.spyOn(countStatement, "bind").mockReturnThis();
      vi.spyOn(rowsStatement, "bind").mockReturnThis();
      vi.spyOn(countStatement, "first").mockResolvedValue({ Total: 0 });
      vi.spyOn(rowsStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [] });

      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 0,
        limit: 10,
        offset: 0,
        metric: LeaderboardMetric.HeadshotKills,
      });
      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 0,
        limit: 10,
        offset: 0,
        metric: LeaderboardMetric.Deaths,
      });
      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 0,
        limit: 10,
        offset: 0,
        metric: LeaderboardMetric.AvgDeathsPerSeries,
      });
      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 0,
        limit: 10,
        offset: 0,
        metric: LeaderboardMetric.AvgDeathsPerGame,
      });

      expect(prepareSpy.mock.calls[0]?.[0]).toContain("SUM(gp.HeadshotKills) AS MetricValue");
      expect(prepareSpy.mock.calls[3]?.[0]).toContain("ORDER BY agg.MetricValue ASC");
      expect(prepareSpy.mock.calls[5]?.[0]).toContain("ORDER BY agg.MetricValue ASC");
      expect(prepareSpy.mock.calls[7]?.[0]).toContain("ORDER BY agg.MetricValue ASC");
    });

    it.each([
      [LeaderboardMetric.PersonalScore, "SUM(gp.PersonalScore)", "DESC"],
      [LeaderboardMetric.MedalPoints, "SUM(gp.MedalPoints)", "DESC"],
      [LeaderboardMetric.MythicMedals, "SUM(gp.MythicMedalCount)", "DESC"],
      [LeaderboardMetric.ObjectiveTime, "SUM(gp.ObjectiveTimeSeconds)", "DESC"],
      [LeaderboardMetric.AvgObjectiveTimePerGame, "AVG(gp.ObjectiveTimeSeconds)", "DESC"],
      [LeaderboardMetric.ObjectiveTeamContribution, "AVG(gp.ObjectiveTeamContribution)", "DESC"],
      [LeaderboardMetric.ObjectiveGameContribution, "AVG(gp.ObjectiveGameContribution)", "DESC"],
      [LeaderboardMetric.Kills, "SUM(gp.Kills)", "DESC"],
      [LeaderboardMetric.Deaths, "SUM(gp.Deaths)", "ASC"],
      [LeaderboardMetric.Assists, "SUM(gp.Assists)", "DESC"],
      [LeaderboardMetric.HeadshotKills, "SUM(gp.HeadshotKills)", "DESC"],
      [LeaderboardMetric.ShotsHit, "SUM(gp.ShotsHit)", "DESC"],
      [LeaderboardMetric.ShotsFired, "SUM(gp.ShotsFired)", "DESC"],
      [LeaderboardMetric.Kda, "AVG(gp.Kda)", "DESC"],
      [LeaderboardMetric.Accuracy, "AVG(gp.Accuracy)", "DESC"],
      [LeaderboardMetric.DamageDealt, "SUM(gp.DamageDealt)", "DESC"],
      [LeaderboardMetric.DamageTaken, "SUM(gp.DamageTaken)", "DESC"],
      [
        LeaderboardMetric.DamageRatio,
        "CASE WHEN SUM(gp.DamageTaken) = 0 THEN CASE WHEN SUM(gp.DamageDealt) = 0 THEN 0 ELSE 1.7976931348623157e308 END ELSE CAST(SUM(gp.DamageDealt) AS REAL) / SUM(gp.DamageTaken) END",
        "DESC",
      ],
      [LeaderboardMetric.AvgLifeSeconds, "AVG(gp.AvgLifeSeconds)", "DESC"],
      [LeaderboardMetric.AvgDamagePerLife, "AVG(gp.AvgDamagePerLife)", "DESC"],
      [LeaderboardMetric.AvgPersonalScorePerGame, "AVG(gp.PersonalScore)", "DESC"],
      [LeaderboardMetric.AvgKillsPerGame, "AVG(gp.Kills)", "DESC"],
      [LeaderboardMetric.AvgDeathsPerGame, "AVG(gp.Deaths)", "ASC"],
      [LeaderboardMetric.AvgAssistsPerGame, "AVG(gp.Assists)", "DESC"],
      [LeaderboardMetric.AvgHeadshotKillsPerGame, "AVG(gp.HeadshotKills)", "DESC"],
      [LeaderboardMetric.AvgShotsHitPerGame, "AVG(gp.ShotsHit)", "DESC"],
      [LeaderboardMetric.AvgShotsFiredPerGame, "AVG(gp.ShotsFired)", "DESC"],
      [LeaderboardMetric.AvgDamageDealtPerGame, "AVG(gp.DamageDealt)", "DESC"],
      [LeaderboardMetric.AvgDamageTakenPerGame, "AVG(gp.DamageTaken)", "DESC"],
    ] as const)("builds the expected SQL and sort direction for %s", async (metric, expectedSql, direction) => {
      const queries: string[] = [];
      vi.spyOn(env.DB, "prepare").mockImplementation((query) => {
        queries.push(query);
        const statement = new FakePreparedStatement();
        if (query.startsWith("SELECT COUNT(*)")) {
          vi.spyOn(statement, "first").mockResolvedValue({ Total: 0 });
        } else {
          vi.spyOn(statement, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
        }
        return statement;
      });

      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 0,
        limit: 10,
        offset: 0,
        metric,
      });

      const rankingQuery = queries.find((query) => query.includes("ORDER BY agg.MetricValue"));
      expect(rankingQuery).toContain(expectedSql);
      expect(rankingQuery).toContain(`ORDER BY agg.MetricValue ${direction}`);
    });

    it("counts only applicable objective games for objective metric eligibility", async () => {
      const queries: string[] = [];
      vi.spyOn(env.DB, "prepare").mockImplementation((query) => {
        queries.push(query);
        const statement = new FakePreparedStatement();
        if (query.startsWith("SELECT COUNT(*)")) {
          vi.spyOn(statement, "first").mockResolvedValue({ Total: 0 });
        } else {
          vi.spyOn(statement, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
        }
        return statement;
      });

      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 5,
        limit: 10,
        offset: 0,
        metric: LeaderboardMetric.ObjectiveTime,
      });

      const rankingQuery = queries.find((query) => query.includes("ORDER BY agg.MetricValue"));
      expect(rankingQuery).toContain("COUNT(gp.ObjectiveTimeSeconds) AS ObjectiveGamesPlayed");
      expect(rankingQuery).toContain("HAVING COUNT(gp.ObjectiveTimeSeconds) >= ?");
    });

    it("clamps objective metric minimum games to one when configured to zero", async () => {
      const countStatement = new FakePreparedStatement<{ Total: number }>();
      const rowsStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValueOnce(countStatement).mockReturnValueOnce(rowsStatement);
      const countBindSpy = vi.spyOn(countStatement, "bind").mockReturnThis();
      vi.spyOn(rowsStatement, "bind").mockReturnThis();
      vi.spyOn(countStatement, "first").mockResolvedValue({ Total: 0 });
      vi.spyOn(rowsStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [] });

      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 123_456,
        minGamesPlayed: 0,
        limit: 25,
        offset: 5,
        metric: LeaderboardMetric.ObjectiveTime,
      });

      const [countBindings] = countBindSpy.mock.calls;
      expect(countBindings).toContain(1);
    });

    it("keeps non-objective metric minimum games unchanged", async () => {
      const countStatement = new FakePreparedStatement<{ Total: number }>();
      const rowsStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValueOnce(countStatement).mockReturnValueOnce(rowsStatement);
      const countBindSpy = vi.spyOn(countStatement, "bind").mockReturnThis();
      vi.spyOn(rowsStatement, "bind").mockReturnThis();
      vi.spyOn(countStatement, "first").mockResolvedValue({ Total: 0 });
      vi.spyOn(rowsStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [] });

      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 123_456,
        minGamesPlayed: 0,
        limit: 25,
        offset: 5,
        metric: LeaderboardMetric.Kills,
      });

      const [countBindings] = countBindSpy.mock.calls;
      expect(countBindings).toContain(0);
    });

    it("uses valid contribution denominators for contribution game counts", async () => {
      const queries: string[] = [];
      vi.spyOn(env.DB, "prepare").mockImplementation((query) => {
        queries.push(query);
        const statement = new FakePreparedStatement();
        if (query.startsWith("SELECT COUNT(*)")) {
          vi.spyOn(statement, "first").mockResolvedValue({ Total: 0 });
        } else {
          vi.spyOn(statement, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
        }
        return statement;
      });

      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 5,
        limit: 10,
        offset: 0,
        metric: LeaderboardMetric.ObjectiveTeamContribution,
      });

      const rankingQuery = queries.find((query) => query.includes("ORDER BY agg.MetricValue"));
      expect(rankingQuery).toContain("COUNT(gp.ObjectiveTeamContribution) AS ObjectiveGamesPlayed");
      expect(rankingQuery).toContain("HAVING COUNT(gp.ObjectiveTeamContribution) >= ?");
    });

    it.each([
      [LeaderboardMetric.AvgPersonalScorePerSeries, "PersonalScore"],
      [LeaderboardMetric.AvgKillsPerSeries, "Kills"],
      [LeaderboardMetric.AvgDeathsPerSeries, "Deaths"],
      [LeaderboardMetric.AvgAssistsPerSeries, "Assists"],
      [LeaderboardMetric.AvgHeadshotKillsPerSeries, "HeadshotKills"],
      [LeaderboardMetric.AvgShotsHitPerSeries, "ShotsHit"],
      [LeaderboardMetric.AvgShotsFiredPerSeries, "ShotsFired"],
      [LeaderboardMetric.AvgDamageDealtPerSeries, "DamageDealt"],
      [LeaderboardMetric.AvgDamageTakenPerSeries, "DamageTaken"],
    ] as const)("aggregates %s by series before averaging", async (metric, column) => {
      const queries: string[] = [];
      vi.spyOn(env.DB, "prepare").mockImplementation((query) => {
        queries.push(query);
        const statement = new FakePreparedStatement();
        if (query.startsWith("SELECT COUNT(*)")) {
          vi.spyOn(statement, "first").mockResolvedValue({ Total: 0 });
        } else {
          vi.spyOn(statement, "all").mockResolvedValue({ ...fakeD1Response, results: [] });
        }
        return statement;
      });

      await databaseService.getLeaderboardStatMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 0,
        limit: 10,
        offset: 0,
        metric,
      });

      const rankingQuery = queries.find((query) => query.includes("ORDER BY agg.MetricValue"));
      expect(rankingQuery).toContain(`SUM(gpSeries.${column}) AS MetricValue`);
      expect(rankingQuery).toContain("GROUP BY gpSeries.QueueNumber");
      expect(rankingQuery).toContain("AVG(perSeries.MetricValue)");
    });

    it("aligns game-win window filtering with series completion window", async () => {
      const countStatement = new FakePreparedStatement<{ Total: number }>();
      const rowsStatement = new FakePreparedStatement();
      const prepareSpy = vi
        .spyOn(env.DB, "prepare")
        .mockReturnValueOnce(countStatement)
        .mockReturnValueOnce(rowsStatement);
      vi.spyOn(countStatement, "bind").mockReturnThis();
      vi.spyOn(rowsStatement, "bind").mockReturnThis();
      vi.spyOn(countStatement, "first").mockResolvedValue({ Total: 0 });
      vi.spyOn(rowsStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [] });

      await databaseService.getLeaderboardOutcomeMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 0,
        limit: 10,
        offset: 0,
        metric: LeaderboardMetric.GamesWinRate,
      });

      expect(prepareSpy.mock.calls[0]?.[0]).toContain("sGames.CompletedAt >= ?");
      expect(prepareSpy.mock.calls[0]?.[0]).toContain("(? IS NULL OR sGames.QueueChannelId = ?)");
    });

    it.each([
      [LeaderboardMetric.SeriesPlayed, "stats.SeriesPlayed"],
      [LeaderboardMetric.SeriesWins, "stats.SeriesWins"],
      [LeaderboardMetric.GamesPlayed, "stats.GamesPlayed"],
      [LeaderboardMetric.GameWins, "stats.GameWins"],
      [
        LeaderboardMetric.SeriesWinRate,
        "CASE WHEN stats.SeriesPlayed = 0 THEN 0 ELSE CAST(stats.SeriesWins AS REAL) / stats.SeriesPlayed END",
      ],
      [
        LeaderboardMetric.GamesWinRate,
        "CASE WHEN stats.GamesPlayed = 0 THEN 0 ELSE CAST(stats.GameWins AS REAL) / stats.GamesPlayed END",
      ],
    ] as const)("builds the expected outcome SQL for %s", async (metric, expectedSql) => {
      const countStatement = new FakePreparedStatement<{ Total: number }>();
      const rowsStatement = new FakePreparedStatement();
      const prepareSpy = vi
        .spyOn(env.DB, "prepare")
        .mockReturnValueOnce(countStatement)
        .mockReturnValueOnce(rowsStatement);
      vi.spyOn(countStatement, "bind").mockReturnThis();
      vi.spyOn(rowsStatement, "bind").mockReturnThis();
      vi.spyOn(countStatement, "first").mockResolvedValue({ Total: 0 });
      vi.spyOn(rowsStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [] });

      await databaseService.getLeaderboardOutcomeMetricRankings({
        guildId: "guild-1",
        queueChannelId: null,
        startEpochSeconds: 0,
        minGamesPlayed: 0,
        limit: 10,
        offset: 0,
        metric,
      });

      const rankingQuery = prepareSpy.mock.calls[1]?.[0];
      expect(rankingQuery).toContain(expectedSql);
      expect(rankingQuery).toContain("sGames.CompletedAt >= ?");
      expect(rankingQuery).toContain("s.CompletedAt >= ?");
    });

    it("deletes a leaderboard post registration by Discord message identity", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteLeaderboardPost("leaderboard-channel-1", "leaderboard-message-1");

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM LeaderboardPosts WHERE ChannelId = ? AND MessageId = ?");
      expect(bindSpy).toHaveBeenCalledWith("leaderboard-channel-1", "leaderboard-message-1");
      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it("deletes leaderboard series by guild and queue number", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteLeaderboardSeriesByQueueNumber("guild-123", 789);

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM LeaderboardSeries WHERE GuildId = ? AND QueueNumber = ?");
      expect(bindSpy).toHaveBeenCalledWith("guild-123", 789);
      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it("gets leaderboard series by guild and queue number", async () => {
      const series = aFakeLeaderboardSeriesRow();
      const fakePreparedStatement = new FakePreparedStatement<typeof series>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const firstSpy = vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(series);

      const result = await databaseService.getLeaderboardSeriesByQueueNumber("guild-123", 789);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM LeaderboardSeries WHERE GuildId = ? AND QueueNumber = ?");
      expect(bindSpy).toHaveBeenCalledWith("guild-123", 789);
      expect(firstSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(series);
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
    it("deletes sessions older than the server-side session max age", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteExpiredUserSessions(12345);

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM UserSessions WHERE CreatedAt <= ?");
      expect(bindSpy).toHaveBeenCalledWith(12345 - SESSION_COOKIE_MAX_AGE_SECONDS);
      expect(runSpy).toHaveBeenCalled();
    });
  });

  describe("getUserCredentials()", () => {
    it("returns user credentials by user id", async () => {
      const credentials = aFakeUserCredentialsRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(credentials);

      const result = await databaseService.getUserCredentials(credentials.UserId);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM UserCredentials WHERE UserId = ?");
      expect(bindSpy).toHaveBeenCalledWith(credentials.UserId);
      expect(result).toEqual(credentials);
    });

    it("returns null when no credentials exist for the user", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(null);

      const result = await databaseService.getUserCredentials("unknown-user");

      expect(result).toBeNull();
    });
  });

  describe("upsertUserCredentials()", () => {
    it("upserts user credentials", async () => {
      const credentials = aFakeUserCredentialsRow();
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertUserCredentials(credentials);

      expect(prepareSpy).toHaveBeenCalledWith(
        `
      INSERT INTO UserCredentials (UserId, RefreshToken, UpdatedAt) VALUES (?, ?, ?)
      ON CONFLICT(UserId) DO UPDATE SET RefreshToken=excluded.RefreshToken, UpdatedAt=excluded.UpdatedAt
    `,
      );
      expect(bindSpy).toHaveBeenCalledWith(credentials.UserId, credentials.RefreshToken, credentials.UpdatedAt);
      expect(runSpy).toHaveBeenCalled();
    });

    it("round-trips the upserted credentials via get", async () => {
      const credentials = aFakeUserCredentialsRow({ RefreshToken: "encrypted-1", UpdatedAt: 1000 });
      const upsertStatement = new FakePreparedStatement();
      const getStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValueOnce(upsertStatement).mockReturnValueOnce(getStatement);
      vi.spyOn(upsertStatement, "bind").mockReturnThis();
      vi.spyOn(getStatement, "bind").mockReturnThis();
      vi.spyOn(getStatement, "first").mockResolvedValue(credentials);

      await databaseService.upsertUserCredentials(credentials);
      const result = await databaseService.getUserCredentials(credentials.UserId);

      expect(result).toEqual(credentials);
    });

    it("updates the token and UpdatedAt on conflict", async () => {
      const updated = aFakeUserCredentialsRow({ RefreshToken: "encrypted-2", UpdatedAt: 2000 });
      const fakePreparedStatement = new FakePreparedStatement();
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);

      await databaseService.upsertUserCredentials(updated);

      expect(bindSpy).toHaveBeenCalledWith(updated.UserId, "encrypted-2", 2000);
    });
  });

  describe("deleteUserCredentials()", () => {
    it("deletes user credentials by user id", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteUserCredentials("user-1");

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM UserCredentials WHERE UserId = ?");
      expect(bindSpy).toHaveBeenCalledWith("user-1");
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

  describe("findActiveXboxIdentityByGamertag()", () => {
    it("returns the active xbox identity matching the gamertag", async () => {
      const identity: LinkedIdentitiesRow = aFakeLinkedIdentitiesRow({ Gamertag: "OwnerGamertag" });
      const fakePreparedStatement = new FakePreparedStatement<LinkedIdentitiesRow>();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(identity);

      const result = await databaseService.findActiveXboxIdentityByGamertag("OwnerGamertag");

      expect(prepareSpy).toHaveBeenCalledWith(
        "SELECT * FROM LinkedIdentities WHERE Provider = 'xbox' AND IsActive = 1 AND Gamertag = ? ORDER BY UpdatedAt DESC",
      );
      expect(bindSpy).toHaveBeenCalledWith("OwnerGamertag");
      expect(result).toEqual(identity);
    });

    it("returns null when no active xbox identity matches (inactive or non-xbox filtered by the query)", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      vi.spyOn(fakePreparedStatement, "bind").mockReturnThis();
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(null);

      const result = await databaseService.findActiveXboxIdentityByGamertag("Nobody");

      expect(result).toBeNull();
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

      expect(prepareSpy).toHaveBeenCalledWith(
        `
      INSERT INTO LinkedIdentities (IdentityId, UserId, Provider, ProviderUserId, Gamertag, TwitchId, IsActive, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(Provider, ProviderUserId) DO UPDATE SET UserId=excluded.UserId, Gamertag=excluded.Gamertag, TwitchId=excluded.TwitchId, IsActive=excluded.IsActive, CreatedAt=excluded.CreatedAt, UpdatedAt=excluded.UpdatedAt
    `,
      );
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
      const deleteStatement = new FakePreparedStatement();
      const insertStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare");
      prepareSpy.mockReturnValueOnce(deleteStatement).mockReturnValueOnce(insertStatement);
      const deleteBindSpy = vi.spyOn(deleteStatement, "bind");
      const insertBindSpy = vi.spyOn(insertStatement, "bind");
      const batchSpy = vi.spyOn(env.DB, "batch").mockResolvedValue([{ ...fakeD1Response, results: [] }]);

      await databaseService.replaceIndividualTrackerGames("profile-1", [game]);

      expect(prepareSpy).toHaveBeenNthCalledWith(1, "DELETE FROM IndividualTrackerGames WHERE ProfileId = ?");
      expect(prepareSpy).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO IndividualTrackerGames"));
      expect(deleteBindSpy).toHaveBeenCalledWith("profile-1");
      expect(insertBindSpy).toHaveBeenCalledWith(
        "profile-1",
        game.MatchId,
        game.Position,
        game.Included,
        game.AnnotationsJson,
        game.CreatedAt,
        game.UpdatedAt,
      );
      expect(batchSpy).toHaveBeenCalledWith([deleteStatement, insertStatement]);
    });

    describe("replaceMatchKillMatrix()", () => {
      it("replaces rows atomically using one batch", async () => {
        const row = aFakeMatchKillMatrixRow();
        const deleteStatement = new FakePreparedStatement();
        const insertStatement = new FakePreparedStatement();
        const prepareSpy = vi.spyOn(env.DB, "prepare");
        prepareSpy.mockReturnValueOnce(deleteStatement).mockReturnValueOnce(insertStatement);
        const deleteBindSpy = vi.spyOn(deleteStatement, "bind");
        const insertBindSpy = vi.spyOn(insertStatement, "bind");
        const batchSpy = vi.spyOn(env.DB, "batch").mockResolvedValue([{ ...fakeD1Response, results: [] }]);

        await databaseService.replaceMatchKillMatrix("match-123", [row]);

        expect(prepareSpy).toHaveBeenNthCalledWith(1, "DELETE FROM MatchKillMatrix WHERE MatchId = ?");
        expect(prepareSpy).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO MatchKillMatrix"));
        expect(deleteBindSpy).toHaveBeenCalledWith("match-123");
        expect(insertBindSpy).toHaveBeenCalledWith(
          "match-123",
          row.KillerXuid,
          row.VictimXuid,
          row.Count,
          row.Perfects,
          row.CreatedAt,
          row.UpdatedAt,
        );
        expect(batchSpy).toHaveBeenCalledWith([deleteStatement, insertStatement]);
      });

      it("only deletes rows when replacement list is empty", async () => {
        const deleteStatement = new FakePreparedStatement();
        const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(deleteStatement);
        const runSpy = vi.spyOn(deleteStatement, "run");
        const batchSpy = vi.spyOn(env.DB, "batch");

        await databaseService.replaceMatchKillMatrix("match-123", []);

        expect(prepareSpy).toHaveBeenCalledTimes(1);
        expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM MatchKillMatrix WHERE MatchId = ?");
        expect(runSpy).toHaveBeenCalled();
        expect(batchSpy).not.toHaveBeenCalled();
      });
    });

    describe("upsertMatchKillMatrix()", () => {
      it("upserts rows with the expected sql and bindings", async () => {
        const row = aFakeMatchKillMatrixRow();
        const preparedStatement = new FakePreparedStatement();
        const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(preparedStatement);
        const bindSpy = vi.spyOn(preparedStatement, "bind");
        const runSpy = vi.spyOn(preparedStatement, "run");

        await databaseService.upsertMatchKillMatrix([row]);

        expect(prepareSpy).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO MatchKillMatrix"));
        expect(bindSpy).toHaveBeenCalledWith(
          row.MatchId,
          row.KillerXuid,
          row.VictimXuid,
          row.Count,
          row.Perfects,
          row.CreatedAt,
          row.UpdatedAt,
        );
        expect(runSpy).toHaveBeenCalledOnce();
      });

      it("chunks inserts when row count exceeds D1 variable limits", async () => {
        const rows = Array.from({ length: 15 }, (_value, index) =>
          aFakeMatchKillMatrixRow({
            MatchId: `match-${index.toString()}`,
            KillerXuid: `killer-${index.toString()}`,
            VictimXuid: `victim-${index.toString()}`,
          }),
        );
        const preparedStatement = new FakePreparedStatement();
        const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(preparedStatement);
        const bindSpy = vi.spyOn(preparedStatement, "bind");
        const runSpy = vi.spyOn(preparedStatement, "run");

        await databaseService.upsertMatchKillMatrix(rows);

        expect(prepareSpy).toHaveBeenCalledTimes(2);
        expect(bindSpy).toHaveBeenCalledTimes(2);
        expect(runSpy).toHaveBeenCalledTimes(2);

        const [firstBindArgs, secondBindArgs] = bindSpy.mock.calls;
        expect(firstBindArgs).toHaveLength(98);
        expect(secondBindArgs).toHaveLength(7);
      });
    });

    describe("getMatchKillMatrix()", () => {
      it("queries match kill matrix rows by match id", async () => {
        const row = aFakeMatchKillMatrixRow();
        const preparedStatement = new FakePreparedStatement<MatchKillMatrixRow>();
        const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(preparedStatement);
        const bindSpy = vi.spyOn(preparedStatement, "bind").mockReturnThis();
        const allSpy = vi.spyOn(preparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [row] });

        const result = await databaseService.getMatchKillMatrix("match-123");

        expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM MatchKillMatrix WHERE MatchId = ?");
        expect(bindSpy).toHaveBeenCalledWith("match-123");
        expect(allSpy).toHaveBeenCalledOnce();
        expect(result).toEqual([row]);
      });
    });

    it("uses the method profile id for inserted rows", async () => {
      const game = aFakeIndividualTrackerGamesRow({ ProfileId: "other-profile" });
      const deleteStatement = new FakePreparedStatement();
      const insertStatement = new FakePreparedStatement();
      vi.spyOn(env.DB, "prepare").mockReturnValueOnce(deleteStatement).mockReturnValueOnce(insertStatement);
      const insertBindSpy = vi.spyOn(insertStatement, "bind");
      vi.spyOn(env.DB, "batch").mockResolvedValue([{ ...fakeD1Response, results: [] }]);

      await databaseService.replaceIndividualTrackerGames("profile-1", [game]);

      expect(insertBindSpy).toHaveBeenCalledWith(
        "profile-1",
        game.MatchId,
        game.Position,
        game.Included,
        game.AnnotationsJson,
        game.CreatedAt,
        game.UpdatedAt,
      );
    });

    it("only deletes rows when replacement list is empty", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const runSpy = vi.spyOn(fakePreparedStatement, "run");
      const batchSpy = vi.spyOn(env.DB, "batch");

      await databaseService.replaceIndividualTrackerGames("profile-1", []);

      expect(prepareSpy).toHaveBeenCalledTimes(1);
      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM IndividualTrackerGames WHERE ProfileId = ?");
      expect(runSpy).toHaveBeenCalled();
      expect(batchSpy).not.toHaveBeenCalled();
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

  describe("IndividualTrackers", () => {
    it("finds individual trackers by user id", async () => {
      const tracker = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1" });
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [tracker] });

      const result = await databaseService.findIndividualTrackersByUserId("user-1");

      expect(prepareSpy).toHaveBeenCalledWith(
        "SELECT * FROM IndividualTrackers WHERE UserId = ? ORDER BY CreatedAt ASC",
      );
      expect(bindSpy).toHaveBeenCalledWith("user-1");
      expect(result).toEqual([tracker]);
    });

    it("gets an individual tracker by id", async () => {
      const tracker = aFakeIndividualTrackersRow({ TrackerId: "t1" });
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(tracker);

      const result = await databaseService.getIndividualTracker("t1");

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM IndividualTrackers WHERE TrackerId = ?");
      expect(bindSpy).toHaveBeenCalledWith("t1");
      expect(result).toEqual(tracker);
    });

    it("finds individual trackers by xuids", async () => {
      const tracker = aFakeIndividualTrackersRow({ Xuid: "111" });
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "all").mockResolvedValue({ ...fakeD1Response, results: [tracker] });

      const result = await databaseService.findIndividualTrackersByXuids(["111", "222"]);

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM IndividualTrackers WHERE Xuid IN (?,?)");
      expect(bindSpy).toHaveBeenCalledWith("111", "222");
      expect(result).toEqual([tracker]);
    });

    it("returns an empty array without querying when no xuids are given", async () => {
      const prepareSpy = vi.spyOn(env.DB, "prepare");

      const result = await databaseService.findIndividualTrackersByXuids([]);

      expect(prepareSpy).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("finds the live individual tracker for a user", async () => {
      const tracker = aFakeIndividualTrackersRow({ UserId: "user-1", IsLive: 1 });
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      vi.spyOn(fakePreparedStatement, "first").mockResolvedValue(tracker);

      const result = await databaseService.findLiveIndividualTrackerByUserId("user-1");

      expect(prepareSpy).toHaveBeenCalledWith("SELECT * FROM IndividualTrackers WHERE UserId = ? AND IsLive = 1");
      expect(bindSpy).toHaveBeenCalledWith("user-1");
      expect(result).toEqual(tracker);
    });

    it("upserts an individual tracker", async () => {
      const tracker = aFakeIndividualTrackersRow({ TrackerId: "t1", UserId: "user-1", Gamertag: "GT", Xuid: "111" });
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.upsertIndividualTracker(tracker);

      expect(prepareSpy).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO IndividualTrackers"));
      expect(bindSpy).toHaveBeenCalledWith(
        tracker.TrackerId,
        tracker.UserId,
        tracker.Gamertag,
        tracker.Xuid,
        tracker.Status,
        tracker.IsLive,
        tracker.CreatedAt,
        tracker.UpdatedAt,
      );
      expect(runSpy).toHaveBeenCalled();
    });

    it("deletes an individual tracker", async () => {
      const fakePreparedStatement = new FakePreparedStatement();
      const prepareSpy = vi.spyOn(env.DB, "prepare").mockReturnValue(fakePreparedStatement);
      const bindSpy = vi.spyOn(fakePreparedStatement, "bind");
      const runSpy = vi.spyOn(fakePreparedStatement, "run");

      await databaseService.deleteIndividualTracker("t1");

      expect(prepareSpy).toHaveBeenCalledWith("DELETE FROM IndividualTrackers WHERE TrackerId = ?");
      expect(bindSpy).toHaveBeenCalledWith("t1");
      expect(runSpy).toHaveBeenCalled();
    });

    it("sets one tracker live and clears the others in a batch", async () => {
      const clearStatement = new FakePreparedStatement();
      const setStatement = new FakePreparedStatement();
      const prepareSpy = vi
        .spyOn(env.DB, "prepare")
        .mockReturnValueOnce(clearStatement)
        .mockReturnValueOnce(setStatement);
      const clearBindSpy = vi.spyOn(clearStatement, "bind");
      const setBindSpy = vi.spyOn(setStatement, "bind");
      const batchSpy = vi.spyOn(env.DB, "batch").mockResolvedValue([{ ...fakeD1Response, results: [] }]);

      await databaseService.setLiveIndividualTracker("user-1", "t1");

      expect(prepareSpy).toHaveBeenNthCalledWith(
        1,
        "UPDATE IndividualTrackers SET IsLive = 0, UpdatedAt = ? WHERE UserId = ? AND IsLive = 1 AND TrackerId != ?",
      );
      expect(prepareSpy).toHaveBeenNthCalledWith(
        2,
        "UPDATE IndividualTrackers SET IsLive = 1, UpdatedAt = ? WHERE TrackerId = ? AND UserId = ?",
      );
      expect(clearBindSpy).toHaveBeenCalledWith(expect.any(Number), "user-1", "t1");
      expect(setBindSpy).toHaveBeenCalledWith(expect.any(Number), "t1", "user-1");
      expect(batchSpy).toHaveBeenCalledWith([clearStatement, setStatement]);
    });
  });
});
