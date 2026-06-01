import { instrumentD1WithSentry } from "@sentry/cloudflare";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { SESSION_COOKIE_MAX_AGE_SECONDS } from "../auth/session-manager";
import type { DiscordAssociationsRow } from "./types/discord_associations";
import type { GuildConfigRow } from "./types/guild_config";
import { StatsReturnType, MapsPostType, MapsPlaylistType, MapsFormatType } from "./types/guild_config";
import type { NeatQueueConfigRow, NeatQueuePostSeriesDisplayMode } from "./types/neat_queue_config";
import type { UserSessionsRow } from "./types/user_sessions";
import type { UserCredentialsRow } from "./types/user_credentials";
import type { LinkedIdentitiesRow, IdentityProvider } from "./types/linked_identities";
import type { IndividualTrackerProfilesRow } from "./types/individual_tracker_profiles";
import type { IndividualTrackerGamesRow } from "./types/individual_tracker_games";
import type { StreamerViewSettingsRow } from "./types/streamer_view_settings";
import type { IndividualTrackersRow } from "./types/individual_trackers";

export interface DatabaseServiceOpts {
  env: Env;
}

export class DatabaseService {
  private readonly DB: D1Database;
  private readonly guildConfigCache = new Map<string, GuildConfigRow>();

  constructor({ env }: DatabaseServiceOpts) {
    this.DB = env.MODE === "production" ? (instrumentD1WithSentry(env.DB) as D1Database) : env.DB;
  }

  async getDiscordAssociations(discordIds: string[]): Promise<DiscordAssociationsRow[]> {
    const placeholders = discordIds.map(() => "?").join(",");
    const query = `SELECT * FROM DiscordAssociations WHERE DiscordId IN (${placeholders})`;
    const stmt = this.DB.prepare(query).bind(...discordIds);
    const response = await stmt.all<DiscordAssociationsRow>();
    return response.results;
  }

  async getDiscordAssociationsByXboxId(xboxIds: string[]): Promise<DiscordAssociationsRow[]> {
    const placeholders = xboxIds.map(() => "?").join(",");
    const query = `SELECT * FROM DiscordAssociations WHERE XboxId IN (${placeholders})`;
    const stmt = this.DB.prepare(query).bind(...xboxIds);
    const response = await stmt.all<DiscordAssociationsRow>();
    return response.results;
  }

  async upsertDiscordAssociations(associations: DiscordAssociationsRow[]): Promise<void> {
    if (associations.length === 0) {
      return;
    }

    const placeholders = associations.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
    const query = `
      INSERT INTO DiscordAssociations (DiscordId, XboxId, AssociationReason, AssociationDate, GamesRetrievable, DiscordDisplayNameSearched) VALUES ${placeholders}
      ON CONFLICT(DiscordId) DO UPDATE SET XboxId=excluded.XboxId, AssociationReason=excluded.AssociationReason, AssociationDate=excluded.AssociationDate, GamesRetrievable=excluded.GamesRetrievable, DiscordDisplayNameSearched=excluded.DiscordDisplayNameSearched
    `;
    const bindings = associations.flatMap((association) => [
      association.DiscordId,
      association.XboxId,
      association.AssociationReason,
      association.AssociationDate,
      association.GamesRetrievable,
      association.DiscordDisplayNameSearched,
    ]);

    const stmt = this.DB.prepare(query).bind(...bindings);
    await stmt.run();
  }

  async deleteDiscordAssociations(discordIds: string[]): Promise<void> {
    const placeholders = discordIds.map(() => "?").join(",");
    const query = `DELETE FROM DiscordAssociations WHERE DiscordId IN (${placeholders})`;
    const stmt = this.DB.prepare(query).bind(...discordIds);
    await stmt.run();
  }

  async getGuildConfig(guildId: string, autoCreate = false): Promise<GuildConfigRow> {
    if (this.guildConfigCache.has(guildId)) {
      return Preconditions.checkExists(this.guildConfigCache.get(guildId));
    }

    const query = "SELECT * FROM GuildConfig WHERE GuildId = ?";
    const stmt = this.DB.prepare(query).bind(guildId);
    const result = await stmt.first<GuildConfigRow>();

    if (result) {
      this.guildConfigCache.set(guildId, result);
      return result;
    }

    const defaultConfig: GuildConfigRow = {
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

    if (autoCreate) {
      const insertStmt = this.DB.prepare(
        "INSERT INTO GuildConfig (GuildId, StatsReturn, Medals, NeatQueueInformerPlayerConnections, NeatQueueInformerMapsPost, NeatQueueInformerMapsPlaylist, NeatQueueInformerMapsFormat, NeatQueueInformerMapsCount, NeatQueueInformerLiveTracking, NeatQueueInformerLiveTrackingChannelName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        defaultConfig.GuildId,
        defaultConfig.StatsReturn,
        defaultConfig.Medals,
        defaultConfig.NeatQueueInformerPlayerConnections,
        defaultConfig.NeatQueueInformerMapsPost,
        defaultConfig.NeatQueueInformerMapsPlaylist,
        defaultConfig.NeatQueueInformerMapsFormat,
        defaultConfig.NeatQueueInformerMapsCount,
        defaultConfig.NeatQueueInformerLiveTracking,
        defaultConfig.NeatQueueInformerLiveTrackingChannelName,
      );

      await insertStmt.run();
    }

    this.guildConfigCache.set(guildId, defaultConfig);
    return defaultConfig;
  }

  async updateGuildConfig(guildId: string, updates: Partial<Omit<GuildConfigRow, "GuildId">>): Promise<void> {
    const setStatements: string[] = [];
    const values: (StatsReturnType | string | number | null)[] = [];

    type UpdatableKeys = keyof Omit<GuildConfigRow, "GuildId">;
    const createUpdateKeysArray = <T extends readonly UpdatableKeys[]>(
      keys: T &
        (UpdatableKeys extends T[number] ? unknown : "Missing keys") &
        (T[number] extends UpdatableKeys ? unknown : "Extra keys"),
    ): T => keys;

    const updateKeys = createUpdateKeysArray([
      "StatsReturn",
      "Medals",
      "NeatQueueInformerPlayerConnections",
      "NeatQueueInformerMapsPost",
      "NeatQueueInformerMapsPlaylist",
      "NeatQueueInformerMapsFormat",
      "NeatQueueInformerMapsCount",
      "NeatQueueInformerLiveTracking",
      "NeatQueueInformerLiveTrackingChannelName",
    ] as const);

    for (const key of updateKeys) {
      if (updates[key] !== undefined) {
        setStatements.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (setStatements.length === 0) {
      return;
    }

    values.push(guildId);

    const query = `UPDATE GuildConfig SET ${setStatements.join(", ")} WHERE GuildId = ?`;
    const stmt = this.DB.prepare(query).bind(...values);
    await stmt.run();

    const cachedConfig = this.guildConfigCache.get(guildId);
    if (cachedConfig) {
      const updatedConfig: GuildConfigRow = {
        ...cachedConfig,
        ...updates,
        GuildId: guildId,
      };
      this.guildConfigCache.set(guildId, updatedConfig);
    }
  }

  async getNeatQueueConfig(guildId: string, channelId: string): Promise<NeatQueueConfigRow> {
    const query = "SELECT * FROM NeatQueueConfig WHERE GuildId = ? AND ChannelId = ?";
    const stmt = this.DB.prepare(query).bind(guildId, channelId);
    const result = await stmt.first<NeatQueueConfigRow>();

    if (!result) {
      throw new Error(`No NeatQueueConfig found for GuildId: ${guildId} and ChannelId: ${channelId}`);
    }

    return result;
  }

  async findNeatQueueConfig(req: Partial<NeatQueueConfigRow>): Promise<NeatQueueConfigRow[]> {
    const whereConditions: string[] = [];
    const values: (NeatQueuePostSeriesDisplayMode | string | null)[] = [];

    const keys = Object.keys(req) as (keyof NeatQueueConfigRow)[];
    for (const key of keys) {
      if (req[key] !== undefined) {
        whereConditions.push(`${key} = ?`);
        values.push(req[key]);
      }
    }

    if (whereConditions.length === 0) {
      return [];
    }

    const query = `SELECT * FROM NeatQueueConfig WHERE ${whereConditions.join(" AND ")}`;
    const stmt = this.DB.prepare(query).bind(...values);
    const { results } = await stmt.all<NeatQueueConfigRow>();

    return results;
  }

  async upsertNeatQueueConfig(config: NeatQueueConfigRow): Promise<void> {
    const query = `
      INSERT INTO NeatQueueConfig (GuildId, ChannelId, WebhookSecret, ResultsChannelId, PostSeriesMode, PostSeriesChannelId) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(GuildId, ChannelId) DO UPDATE SET WebhookSecret=excluded.WebhookSecret, ResultsChannelId=excluded.ResultsChannelId, PostSeriesMode=excluded.PostSeriesMode, PostSeriesChannelId=excluded.PostSeriesChannelId
    `;
    const bindings = [
      config.GuildId,
      config.ChannelId,
      config.WebhookSecret,
      config.ResultsChannelId,
      config.PostSeriesMode,
      config.PostSeriesChannelId,
    ];
    const stmt = this.DB.prepare(query).bind(...bindings);
    await stmt.run();
  }

  async deleteNeatQueueConfig(guildId: string, channelId: string): Promise<void> {
    const query = "DELETE FROM NeatQueueConfig WHERE GuildId = ? AND ChannelId = ?";
    const stmt = this.DB.prepare(query).bind(guildId, channelId);
    await stmt.run();
  }

  async getUserSession(sessionId: string): Promise<UserSessionsRow | null> {
    const query = "SELECT * FROM UserSessions WHERE SessionId = ?";
    const stmt = this.DB.prepare(query).bind(sessionId);
    return await stmt.first<UserSessionsRow>();
  }

  async upsertUserSession(session: UserSessionsRow): Promise<void> {
    const query = `
      INSERT INTO UserSessions (SessionId, UserId, AccessToken, RefreshToken, ExpiresAt, CreatedAt, LastRefreshedAt, AuthMetadataJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(SessionId) DO UPDATE SET UserId=excluded.UserId, AccessToken=excluded.AccessToken, RefreshToken=excluded.RefreshToken, ExpiresAt=excluded.ExpiresAt, CreatedAt=excluded.CreatedAt, LastRefreshedAt=excluded.LastRefreshedAt, AuthMetadataJson=excluded.AuthMetadataJson
    `;
    const stmt = this.DB.prepare(query).bind(
      session.SessionId,
      session.UserId,
      session.AccessToken,
      session.RefreshToken,
      session.ExpiresAt,
      session.CreatedAt,
      session.LastRefreshedAt,
      session.AuthMetadataJson,
    );
    await stmt.run();
  }

  async updateSessionAuthMetadata(sessionId: string, authMetadataJson: string): Promise<void> {
    const query = "UPDATE UserSessions SET AuthMetadataJson = ? WHERE SessionId = ?";
    const stmt = this.DB.prepare(query).bind(authMetadataJson, sessionId);
    await stmt.run();
  }

  async deleteUserSession(sessionId: string): Promise<void> {
    const query = "DELETE FROM UserSessions WHERE SessionId = ?";
    const stmt = this.DB.prepare(query).bind(sessionId);
    await stmt.run();
  }

  async deleteExpiredUserSessions(nowEpochSeconds: number): Promise<void> {
    const sessionExpiryCutoffEpochSeconds = nowEpochSeconds - SESSION_COOKIE_MAX_AGE_SECONDS;
    const query = "DELETE FROM UserSessions WHERE CreatedAt <= ?";
    const stmt = this.DB.prepare(query).bind(sessionExpiryCutoffEpochSeconds);
    await stmt.run();
  }

  async getUserCredentials(userId: string): Promise<UserCredentialsRow | null> {
    const query = "SELECT * FROM UserCredentials WHERE UserId = ?";
    const stmt = this.DB.prepare(query).bind(userId);
    return await stmt.first<UserCredentialsRow>();
  }

  async upsertUserCredentials(row: UserCredentialsRow): Promise<void> {
    const query = `
      INSERT INTO UserCredentials (UserId, RefreshToken, UpdatedAt) VALUES (?, ?, ?)
      ON CONFLICT(UserId) DO UPDATE SET RefreshToken=excluded.RefreshToken, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(row.UserId, row.RefreshToken, row.UpdatedAt);
    await stmt.run();
  }

  async deleteUserCredentials(userId: string): Promise<void> {
    const query = "DELETE FROM UserCredentials WHERE UserId = ?";
    const stmt = this.DB.prepare(query).bind(userId);
    await stmt.run();
  }

  async findLinkedIdentitiesByUserId(userId: string): Promise<LinkedIdentitiesRow[]> {
    const query = "SELECT * FROM LinkedIdentities WHERE UserId = ? ORDER BY CreatedAt DESC";
    const stmt = this.DB.prepare(query).bind(userId);
    const response = await stmt.all<LinkedIdentitiesRow>();
    return response.results;
  }

  async getLinkedIdentityByProvider(
    provider: IdentityProvider,
    providerUserId: string,
  ): Promise<LinkedIdentitiesRow | null> {
    const query = "SELECT * FROM LinkedIdentities WHERE Provider = ? AND ProviderUserId = ?";
    const stmt = this.DB.prepare(query).bind(provider, providerUserId);
    return await stmt.first<LinkedIdentitiesRow>();
  }

  async upsertLinkedIdentity(identity: LinkedIdentitiesRow): Promise<void> {
    const query = `
      INSERT INTO LinkedIdentities (IdentityId, UserId, Provider, ProviderUserId, Gamertag, TwitchId, IsActive, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(Provider, ProviderUserId) DO UPDATE SET UserId=excluded.UserId, Gamertag=excluded.Gamertag, TwitchId=excluded.TwitchId, IsActive=excluded.IsActive, CreatedAt=excluded.CreatedAt, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
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
    await stmt.run();
  }

  async createIndividualTrackerProfile(profile: IndividualTrackerProfilesRow): Promise<void> {
    const query =
      "INSERT INTO IndividualTrackerProfiles (ProfileId, UserId, ActiveIdentityId, Name, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?)";
    const stmt = this.DB.prepare(query).bind(
      profile.ProfileId,
      profile.UserId,
      profile.ActiveIdentityId,
      profile.Name,
      profile.CreatedAt,
      profile.UpdatedAt,
    );
    await stmt.run();
  }

  async getIndividualTrackerProfile(profileId: string): Promise<IndividualTrackerProfilesRow | null> {
    const query = "SELECT * FROM IndividualTrackerProfiles WHERE ProfileId = ?";
    const stmt = this.DB.prepare(query).bind(profileId);
    return await stmt.first<IndividualTrackerProfilesRow>();
  }

  async findIndividualTrackerProfilesByUserId(userId: string): Promise<IndividualTrackerProfilesRow[]> {
    const query = "SELECT * FROM IndividualTrackerProfiles WHERE UserId = ? ORDER BY CreatedAt ASC";
    const stmt = this.DB.prepare(query).bind(userId);
    const response = await stmt.all<IndividualTrackerProfilesRow>();
    return response.results;
  }

  async updateIndividualTrackerProfile(
    profileId: string,
    updates: Partial<Pick<IndividualTrackerProfilesRow, "ActiveIdentityId" | "Name" | "UpdatedAt">>,
  ): Promise<void> {
    const setStatements: string[] = [];
    const values: (string | number | null)[] = [];

    type UpdatableKeys = keyof Pick<IndividualTrackerProfilesRow, "ActiveIdentityId" | "Name" | "UpdatedAt">;
    const updateKeys: UpdatableKeys[] = ["ActiveIdentityId", "Name", "UpdatedAt"];

    for (const key of updateKeys) {
      if (updates[key] !== undefined) {
        setStatements.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (setStatements.length === 0) {
      return;
    }

    values.push(profileId);

    const query = `UPDATE IndividualTrackerProfiles SET ${setStatements.join(", ")} WHERE ProfileId = ?`;
    const stmt = this.DB.prepare(query).bind(...values);
    await stmt.run();
  }

  async getIndividualTrackerGames(profileId: string): Promise<IndividualTrackerGamesRow[]> {
    const query = "SELECT * FROM IndividualTrackerGames WHERE ProfileId = ? ORDER BY Position ASC";
    const stmt = this.DB.prepare(query).bind(profileId);
    const response = await stmt.all<IndividualTrackerGamesRow>();
    return response.results;
  }

  async replaceIndividualTrackerGames(profileId: string, games: IndividualTrackerGamesRow[]): Promise<void> {
    const deleteStmt = this.DB.prepare("DELETE FROM IndividualTrackerGames WHERE ProfileId = ?").bind(profileId);

    if (games.length === 0) {
      await deleteStmt.run();
      return;
    }

    const placeholders = games.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
    const query = `
      INSERT INTO IndividualTrackerGames (ProfileId, MatchId, Position, Included, AnnotationsJson, CreatedAt, UpdatedAt)
      VALUES ${placeholders}
    `;
    const values = games.flatMap((game) => [
      profileId,
      game.MatchId,
      game.Position,
      game.Included,
      game.AnnotationsJson,
      game.CreatedAt,
      game.UpdatedAt,
    ]);
    const insertStmt = this.DB.prepare(query).bind(...values);
    await this.DB.batch([deleteStmt, insertStmt]);
  }

  async getStreamerViewSettings(profileId: string): Promise<StreamerViewSettingsRow | null> {
    const query = "SELECT * FROM StreamerViewSettings WHERE ProfileId = ?";
    const stmt = this.DB.prepare(query).bind(profileId);
    return await stmt.first<StreamerViewSettingsRow>();
  }

  async upsertStreamerViewSettings(settings: StreamerViewSettingsRow): Promise<void> {
    const query = `
      INSERT INTO StreamerViewSettings (ProfileId, LayoutOptionsJson, VisibleSectionsJson, StyleFlagsJson, UpdatedAt) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(ProfileId) DO UPDATE SET LayoutOptionsJson=excluded.LayoutOptionsJson, VisibleSectionsJson=excluded.VisibleSectionsJson, StyleFlagsJson=excluded.StyleFlagsJson, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
      settings.ProfileId,
      settings.LayoutOptionsJson,
      settings.VisibleSectionsJson,
      settings.StyleFlagsJson,
      settings.UpdatedAt,
    );
    await stmt.run();
  }

  async findIndividualTrackersByUserId(userId: string): Promise<IndividualTrackersRow[]> {
    const query = "SELECT * FROM IndividualTrackers WHERE UserId = ? ORDER BY CreatedAt ASC";
    const stmt = this.DB.prepare(query).bind(userId);
    const response = await stmt.all<IndividualTrackersRow>();
    return response.results;
  }

  async getIndividualTracker(trackerId: string): Promise<IndividualTrackersRow | null> {
    const query = "SELECT * FROM IndividualTrackers WHERE TrackerId = ?";
    const stmt = this.DB.prepare(query).bind(trackerId);
    return await stmt.first<IndividualTrackersRow>();
  }

  async findIndividualTrackersByXuids(xuids: string[]): Promise<IndividualTrackersRow[]> {
    if (xuids.length === 0) {
      return [];
    }
    const placeholders = xuids.map(() => "?").join(",");
    const query = `SELECT * FROM IndividualTrackers WHERE Xuid IN (${placeholders})`;
    const stmt = this.DB.prepare(query).bind(...xuids);
    const response = await stmt.all<IndividualTrackersRow>();
    return response.results;
  }

  async findLiveIndividualTrackerByUserId(userId: string): Promise<IndividualTrackersRow | null> {
    const query = "SELECT * FROM IndividualTrackers WHERE UserId = ? AND IsLive = 1";
    const stmt = this.DB.prepare(query).bind(userId);
    return await stmt.first<IndividualTrackersRow>();
  }

  async upsertIndividualTracker(tracker: IndividualTrackersRow): Promise<void> {
    const query = `
      INSERT INTO IndividualTrackers (TrackerId, UserId, Gamertag, Xuid, Status, IsLive, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(TrackerId) DO UPDATE SET Gamertag=excluded.Gamertag, Xuid=excluded.Xuid, Status=excluded.Status, IsLive=excluded.IsLive, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
      tracker.TrackerId,
      tracker.UserId,
      tracker.Gamertag,
      tracker.Xuid,
      tracker.Status,
      tracker.IsLive,
      tracker.CreatedAt,
      tracker.UpdatedAt,
    );
    await stmt.run();
  }

  async deleteIndividualTracker(trackerId: string): Promise<void> {
    const stmt = this.DB.prepare("DELETE FROM IndividualTrackers WHERE TrackerId = ?").bind(trackerId);
    await stmt.run();
  }

  async setLiveIndividualTracker(userId: string, trackerId: string): Promise<void> {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const clearStmt = this.DB.prepare(
      "UPDATE IndividualTrackers SET IsLive = 0, UpdatedAt = ? WHERE UserId = ? AND IsLive = 1 AND TrackerId != ?",
    ).bind(nowEpoch, userId, trackerId);
    const setStmt = this.DB.prepare(
      "UPDATE IndividualTrackers SET IsLive = 1, UpdatedAt = ? WHERE TrackerId = ? AND UserId = ?",
    ).bind(nowEpoch, trackerId, userId);
    await this.DB.batch([clearStmt, setStmt]);
  }
}
