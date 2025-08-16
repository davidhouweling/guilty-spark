import { instrumentD1WithSentry } from "@sentry/cloudflare";
import { Preconditions } from "../../base/preconditions.mjs";
import type { DiscordAssociationsRow } from "./types/discord_associations.mjs";
import type { GuildConfigRow } from "./types/guild_config.mjs";
import { StatsReturnType, MapsPostType, MapsPlaylistType, MapsFormatType } from "./types/guild_config.mjs";
import type { NeatQueueConfigRow, NeatQueuePostSeriesDisplayMode } from "./types/neat_queue_config.mjs";

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
    };

    if (autoCreate) {
      const insertStmt = this.DB.prepare(
        "INSERT INTO GuildConfig (GuildId, StatsReturn, Medals, NeatQueueInformerPlayerConnections, NeatQueueInformerMapsPost, NeatQueueInformerMapsPlaylist, NeatQueueInformerMapsFormat, NeatQueueInformerMapsCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        defaultConfig.GuildId,
        defaultConfig.StatsReturn,
        defaultConfig.Medals,
        defaultConfig.NeatQueueInformerPlayerConnections,
        defaultConfig.NeatQueueInformerMapsPost,
        defaultConfig.NeatQueueInformerMapsPlaylist,
        defaultConfig.NeatQueueInformerMapsFormat,
        defaultConfig.NeatQueueInformerMapsCount,
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
}
