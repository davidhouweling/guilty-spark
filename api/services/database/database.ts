import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { LeaderboardWindow, LeaderboardMetric } from "@guilty-spark/shared/halo/leaderboard";
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
import type { LeaderboardSeriesRow } from "./types/leaderboard_series";
import type { LeaderboardSeriesPlayersRow } from "./types/leaderboard_series_players";
import type { LeaderboardGamesRow } from "./types/leaderboard_games";
import type { LeaderboardGamePlayersRow } from "./types/leaderboard_game_players";
import type { LeaderboardRankingRow } from "./types/leaderboard_ranking_row";
import type { LeaderboardConfigRow } from "./types/leaderboard_config";
import type { LeaderboardPostRow } from "./types/leaderboard_post";
import type { LeaderboardResetMarkerRow } from "./types/leaderboard_reset_marker";

const DEFAULT_LEADERBOARD_ENABLED_WINDOWS_JSON = '["1W","1M","3M","6M","12M"]';
const SQLITE_MAX_VARIABLES = 999;
// D1 accepts at most 100 bound parameters per statement, so batch upserts must chunk below this cap.
const D1_SAFE_MAX_VARIABLES_PER_STATEMENT = 100;

function getPerSeriesAverageSql(column: string, outerAlias: string): string {
  return `(SELECT AVG(perSeries.MetricValue) FROM (
    SELECT SUM(gpSeries.${column}) AS MetricValue
    FROM LeaderboardGamePlayers gpSeries
    INNER JOIN LeaderboardGames gSeries
      ON gSeries.GuildId = gpSeries.GuildId
      AND gSeries.QueueNumber = gpSeries.QueueNumber
      AND gSeries.MatchId = gpSeries.MatchId
    WHERE gpSeries.GuildId = ${outerAlias}.GuildId
      AND gpSeries.XboxXuid = ${outerAlias}.XboxXuid
      AND gSeries.EndedAt >= ?
      AND (? IS NULL OR gpSeries.QueueChannelId = ?)
    GROUP BY gpSeries.QueueNumber
  ) perSeries)`;
}

function isAscendingMetric(metric: LeaderboardMetric): boolean {
  return (
    metric === LeaderboardMetric.Deaths ||
    metric === LeaderboardMetric.AvgDeathsPerSeries ||
    metric === LeaderboardMetric.AvgDeathsPerGame
  );
}

interface LeaderboardRankingsQuery {
  guildId: string;
  queueChannelId: string | null;
  startEpochSeconds: number;
  minGamesPlayed: number;
  limit: number;
  offset: number;
}

export interface DatabaseServiceOpts {
  env: Env;
}

export class DatabaseService {
  private readonly DB: D1Database;
  private readonly guildConfigCache = new Map<string, GuildConfigRow>();
  private leaderboardGameWonMigrationPromise: Promise<void> | null = null;

  constructor({ env }: DatabaseServiceOpts) {
    this.DB = env.DB;
  }

  private async ensureLeaderboardGameWonColumn(): Promise<void> {
    this.leaderboardGameWonMigrationPromise ??= this.ensureLeaderboardGameWonColumnAsync();

    await this.leaderboardGameWonMigrationPromise;
  }

  private async ensureLeaderboardGameWonColumnAsync(): Promise<void> {
    const tableInfoStmt = this.DB.prepare("PRAGMA table_info(LeaderboardGamePlayers)");
    const tableInfo = await tableInfoStmt.all<{ name: string }>();

    if (tableInfo.results.length === 0) {
      return;
    }

    for (const column of tableInfo.results) {
      if (column.name === "GameWon") {
        return;
      }
    }

    try {
      await this.DB.prepare(
        "ALTER TABLE LeaderboardGamePlayers ADD COLUMN GameWon INTEGER NOT NULL DEFAULT 0 CHECK (GameWon IN (0, 1))",
      ).run();
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("duplicate column name: GameWon")) {
        return;
      }

      throw error;
    }
  }

  async getDiscordAssociations(discordIds: string[]): Promise<DiscordAssociationsRow[]> {
    if (discordIds.length === 0) {
      return [];
    }

    const placeholders = discordIds.map(() => "?").join(",");
    const query = `SELECT * FROM DiscordAssociations WHERE DiscordId IN (${placeholders})`;
    const stmt = this.DB.prepare(query).bind(...discordIds);
    const response = await stmt.all<DiscordAssociationsRow>();
    return response.results;
  }

  async getDiscordAssociationsByXboxId(xboxIds: string[]): Promise<DiscordAssociationsRow[]> {
    if (xboxIds.length === 0) {
      return [];
    }

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

  async getAllNeatQueueConfigs(): Promise<NeatQueueConfigRow[]> {
    const query = "SELECT * FROM NeatQueueConfig";
    const stmt = this.DB.prepare(query);
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

  async getLeaderboardConfig(guildId: string, autoCreate = false): Promise<LeaderboardConfigRow> {
    const query = "SELECT * FROM LeaderboardConfig WHERE GuildId = ?";
    const stmt = this.DB.prepare(query).bind(guildId);
    const result = await stmt.first<LeaderboardConfigRow>();

    if (result != null) {
      return result;
    }

    const defaultConfig: LeaderboardConfigRow = {
      GuildId: guildId,
      EnabledWindowsJson: DEFAULT_LEADERBOARD_ENABLED_WINDOWS_JSON,
      DefaultWindow: LeaderboardWindow.ThreeMonths,
      DefaultMetric: LeaderboardMetric.SeriesWinRate,
      MinGamesPlayed: 5,
      UpdatedAt: Math.floor(Date.now() / 1000),
    };

    if (autoCreate) {
      const insertStmt = this.DB.prepare(
        "INSERT INTO LeaderboardConfig (GuildId, EnabledWindowsJson, DefaultWindow, DefaultMetric, MinGamesPlayed, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(GuildId) DO NOTHING",
      ).bind(
        defaultConfig.GuildId,
        defaultConfig.EnabledWindowsJson,
        defaultConfig.DefaultWindow,
        defaultConfig.DefaultMetric,
        defaultConfig.MinGamesPlayed,
        defaultConfig.UpdatedAt,
      );

      await insertStmt.run();
    }

    return defaultConfig;
  }

  async upsertLeaderboardConfig(config: LeaderboardConfigRow): Promise<void> {
    const query = `
      INSERT INTO LeaderboardConfig (GuildId, EnabledWindowsJson, DefaultWindow, DefaultMetric, MinGamesPlayed, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(GuildId) DO UPDATE SET EnabledWindowsJson=excluded.EnabledWindowsJson, DefaultWindow=excluded.DefaultWindow, DefaultMetric=excluded.DefaultMetric, MinGamesPlayed=excluded.MinGamesPlayed, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
      config.GuildId,
      config.EnabledWindowsJson,
      config.DefaultWindow,
      config.DefaultMetric,
      config.MinGamesPlayed,
      config.UpdatedAt,
    );
    await stmt.run();
  }

  async upsertLeaderboardPost(post: LeaderboardPostRow): Promise<void> {
    const query = `
      INSERT INTO LeaderboardPosts (ChannelId, MessageId, GuildId, QueueChannelId)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ChannelId, MessageId) DO UPDATE SET GuildId=excluded.GuildId, QueueChannelId=excluded.QueueChannelId
    `;
    const stmt = this.DB.prepare(query).bind(post.ChannelId, post.MessageId, post.GuildId, post.QueueChannelId);
    await stmt.run();
  }

  async getLeaderboardResetMarker(
    guildId: string,
    queueChannelId: string | null,
  ): Promise<LeaderboardResetMarkerRow | null> {
    const stmt = this.DB.prepare(
      "SELECT GuildId, NULLIF(QueueChannelId, '') AS QueueChannelId, ResetAt, CreatedAt, UpdatedAt FROM LeaderboardResetMarkers WHERE GuildId = ? AND QueueChannelId = ?",
    ).bind(guildId, queueChannelId ?? "");
    return await stmt.first<LeaderboardResetMarkerRow>();
  }

  async upsertLeaderboardResetMarker(marker: LeaderboardResetMarkerRow): Promise<void> {
    const stmt = this.DB.prepare(
      `INSERT INTO LeaderboardResetMarkers (GuildId, QueueChannelId, ResetAt, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(GuildId, QueueChannelId) DO UPDATE SET ResetAt=excluded.ResetAt, UpdatedAt=excluded.UpdatedAt`,
    ).bind(marker.GuildId, marker.QueueChannelId ?? "", marker.ResetAt, marker.CreatedAt, marker.UpdatedAt);
    await stmt.run();
  }

  async findLeaderboardPostsForRefresh(guildId: string, queueChannelId: string): Promise<LeaderboardPostRow[]> {
    const query = "SELECT * FROM LeaderboardPosts WHERE GuildId = ? AND (QueueChannelId IS NULL OR QueueChannelId = ?)";
    const stmt = this.DB.prepare(query).bind(guildId, queueChannelId);
    const response = await stmt.all<LeaderboardPostRow>();
    return response.results;
  }

  async getAllLeaderboardPosts(): Promise<LeaderboardPostRow[]> {
    const stmt = this.DB.prepare("SELECT * FROM LeaderboardPosts");
    const response = await stmt.all<LeaderboardPostRow>();
    return response.results;
  }

  async deleteLeaderboardPost(channelId: string, messageId: string): Promise<void> {
    const query = "DELETE FROM LeaderboardPosts WHERE ChannelId = ? AND MessageId = ?";
    const stmt = this.DB.prepare(query).bind(channelId, messageId);
    await stmt.run();
  }

  async upsertLeaderboardSeries(series: LeaderboardSeriesRow): Promise<void> {
    const query = `
      INSERT INTO LeaderboardSeries (GuildId, QueueNumber, QueueChannelId, ResultsChannelId, StartedAt, CompletedAt, WinnerTeamIndex, SeriesScore, Source, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(GuildId, QueueNumber) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, ResultsChannelId=excluded.ResultsChannelId, StartedAt=excluded.StartedAt, CompletedAt=excluded.CompletedAt, WinnerTeamIndex=excluded.WinnerTeamIndex, SeriesScore=excluded.SeriesScore, Source=excluded.Source, UpdatedAt=excluded.UpdatedAt
    `;
    const stmt = this.DB.prepare(query).bind(
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
    await stmt.run();
  }

  async upsertLeaderboardSeriesPlayers(players: LeaderboardSeriesPlayersRow[]): Promise<void> {
    if (players.length === 0) {
      return;
    }

    const firstPlayer = Preconditions.checkExists(players[0]);
    for (const player of players) {
      const isSameSeries = player.GuildId === firstPlayer.GuildId && player.QueueNumber === firstPlayer.QueueNumber;
      if (!isSameSeries) {
        throw new Error("Expected leaderboard series players to belong to a single guild and queue");
      }
    }

    const playerXuids = [...new Set(players.map((player) => player.XboxXuid))];
    const deletePlaceholders = playerXuids.map(() => "?").join(",");
    const deleteStmt = this.DB.prepare(
      `DELETE FROM LeaderboardSeriesPlayers WHERE GuildId = ? AND QueueNumber = ? AND XboxXuid NOT IN (${deletePlaceholders})`,
    ).bind(firstPlayer.GuildId, firstPlayer.QueueNumber, ...playerXuids);

    const placeholders = players.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const query = `
      INSERT INTO LeaderboardSeriesPlayers (GuildId, QueueNumber, QueueChannelId, XboxXuid, DiscordUserId, GamertagSnapshot, TeamId, PresentAtBeginningCount, SubstituteInCount, SubstituteOutCount, GamesPlayedCount, SeriesWon, CreatedAt)
      VALUES ${placeholders}
      ON CONFLICT(GuildId, QueueNumber, XboxXuid) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, DiscordUserId=excluded.DiscordUserId, GamertagSnapshot=excluded.GamertagSnapshot, TeamId=excluded.TeamId, PresentAtBeginningCount=excluded.PresentAtBeginningCount, SubstituteInCount=excluded.SubstituteInCount, SubstituteOutCount=excluded.SubstituteOutCount, GamesPlayedCount=excluded.GamesPlayedCount, SeriesWon=excluded.SeriesWon
    `;
    const values = players.flatMap((player) => [
      player.GuildId,
      player.QueueNumber,
      player.QueueChannelId,
      player.XboxXuid,
      player.DiscordUserId,
      player.GamertagSnapshot,
      player.TeamId,
      player.PresentAtBeginningCount,
      player.SubstituteInCount,
      player.SubstituteOutCount,
      player.GamesPlayedCount,
      player.SeriesWon,
      player.CreatedAt,
    ]);
    const insertStmt = this.DB.prepare(query).bind(...values);
    await this.DB.batch([deleteStmt, insertStmt]);
  }

  async upsertLeaderboardGames(games: LeaderboardGamesRow[]): Promise<void> {
    if (games.length === 0) {
      return;
    }

    const statements: D1PreparedStatement[] = [];
    const queueNumbersByGuild = new Map<string, Set<number>>();
    for (const game of games) {
      const queueNumbers = queueNumbersByGuild.get(game.GuildId);
      if (queueNumbers == null) {
        queueNumbersByGuild.set(game.GuildId, new Set([game.QueueNumber]));
      } else {
        queueNumbers.add(game.QueueNumber);
      }
    }

    for (const [guildId, queueNumbers] of queueNumbersByGuild) {
      for (const queueNumber of queueNumbers) {
        const deleteStmt = this.DB.prepare("DELETE FROM LeaderboardGames WHERE GuildId = ? AND QueueNumber = ?").bind(
          guildId,
          queueNumber,
        );
        statements.push(deleteStmt);
      }
    }

    const placeholders = games.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const query = `
      INSERT INTO LeaderboardGames (MatchId, GuildId, QueueNumber, QueueChannelId, GameIndexInSeries, GameVariantCategory, ModeName, MapName, MapAssetId, MapVersionId, Team0Score, Team1Score, StartedAt, EndedAt, CreatedAt)
      VALUES ${placeholders}
      ON CONFLICT(GuildId, QueueNumber, MatchId) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, GameIndexInSeries=excluded.GameIndexInSeries, GameVariantCategory=excluded.GameVariantCategory, ModeName=excluded.ModeName, MapName=excluded.MapName, MapAssetId=excluded.MapAssetId, MapVersionId=excluded.MapVersionId, Team0Score=excluded.Team0Score, Team1Score=excluded.Team1Score, StartedAt=excluded.StartedAt, EndedAt=excluded.EndedAt
    `;
    const values = games.flatMap((game) => [
      game.MatchId,
      game.GuildId,
      game.QueueNumber,
      game.QueueChannelId,
      game.GameIndexInSeries,
      game.GameVariantCategory,
      game.ModeName,
      game.MapName,
      game.MapAssetId,
      game.MapVersionId,
      game.Team0Score,
      game.Team1Score,
      game.StartedAt,
      game.EndedAt,
      game.CreatedAt,
    ]);
    const stmt = this.DB.prepare(query).bind(...values);
    statements.push(stmt);
    await this.DB.batch(statements);
  }

  async upsertLeaderboardGamePlayers(players: LeaderboardGamePlayersRow[]): Promise<void> {
    if (players.length === 0) {
      return;
    }

    await this.ensureLeaderboardGameWonColumn();

    const variablesPerRow = 28;
    const statementVariableLimit = Math.min(SQLITE_MAX_VARIABLES, D1_SAFE_MAX_VARIABLES_PER_STATEMENT);
    const maxRowsPerStatement = Math.max(1, Math.floor(statementVariableLimit / variablesPerRow));
    const statements: D1PreparedStatement[] = [];

    for (let start = 0; start < players.length; start += maxRowsPerStatement) {
      const chunk = players.slice(start, start + maxRowsPerStatement);
      const rowPlaceholders = `(${Array.from({ length: variablesPerRow }, () => "?").join(", ")})`;
      const placeholders = chunk.map(() => rowPlaceholders).join(",");
      const query = `
        INSERT INTO LeaderboardGamePlayers (MatchId, GuildId, QueueNumber, QueueChannelId, XboxXuid, DiscordUserId, GamertagSnapshot, TeamId, PresentAtBeginning, GameWon, RankInMatch, PersonalScore, Kills, Deaths, Assists, HeadshotKills, Kda, Accuracy, ShotsHit, ShotsFired, DamageDealt, DamageTaken, DamageRatio, AvgLifeSeconds, AvgDamagePerLife, ObjectiveStatsJson, MedalsJson, CreatedAt)
        VALUES ${placeholders}
        ON CONFLICT(GuildId, QueueNumber, MatchId, XboxXuid) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, DiscordUserId=excluded.DiscordUserId, GamertagSnapshot=excluded.GamertagSnapshot, TeamId=excluded.TeamId, PresentAtBeginning=excluded.PresentAtBeginning, GameWon=excluded.GameWon, RankInMatch=excluded.RankInMatch, PersonalScore=excluded.PersonalScore, Kills=excluded.Kills, Deaths=excluded.Deaths, Assists=excluded.Assists, HeadshotKills=excluded.HeadshotKills, Kda=excluded.Kda, Accuracy=excluded.Accuracy, ShotsHit=excluded.ShotsHit, ShotsFired=excluded.ShotsFired, DamageDealt=excluded.DamageDealt, DamageTaken=excluded.DamageTaken, DamageRatio=excluded.DamageRatio, AvgLifeSeconds=excluded.AvgLifeSeconds, AvgDamagePerLife=excluded.AvgDamagePerLife, ObjectiveStatsJson=excluded.ObjectiveStatsJson, MedalsJson=excluded.MedalsJson
      `;
      const values = chunk.flatMap((player) => [
        player.MatchId,
        player.GuildId,
        player.QueueNumber,
        player.QueueChannelId,
        player.XboxXuid,
        player.DiscordUserId,
        player.GamertagSnapshot,
        player.TeamId,
        player.PresentAtBeginning,
        player.GameWon,
        player.RankInMatch,
        player.PersonalScore,
        player.Kills,
        player.Deaths,
        player.Assists,
        player.HeadshotKills,
        player.Kda,
        player.Accuracy,
        player.ShotsHit,
        player.ShotsFired,
        player.DamageDealt,
        player.DamageTaken,
        player.DamageRatio,
        player.AvgLifeSeconds,
        player.AvgDamagePerLife,
        player.ObjectiveStatsJson,
        player.MedalsJson,
        player.CreatedAt,
      ]);
      const stmt = this.DB.prepare(query).bind(...values);
      statements.push(stmt);
    }

    await this.DB.batch(statements);
  }

  async upsertLeaderboardSeriesDataBatch({
    series,
    games,
    gamePlayers,
    seriesPlayers,
  }: {
    series: LeaderboardSeriesRow;
    games: LeaderboardGamesRow[];
    gamePlayers: LeaderboardGamePlayersRow[];
    seriesPlayers: LeaderboardSeriesPlayersRow[];
  }): Promise<void> {
    await this.ensureLeaderboardGameWonColumn();

    const existingGameCreatedAt = await this.getLeaderboardGameCreatedAtByMatchId(series.GuildId, series.QueueNumber);
    const existingGamePlayerCreatedAt = await this.getLeaderboardGamePlayerCreatedAtByKey(
      series.GuildId,
      series.QueueNumber,
    );
    const existingSeriesPlayerCreatedAt = await this.getLeaderboardSeriesPlayerCreatedAtByXuid(
      series.GuildId,
      series.QueueNumber,
    );
    const normalizedGames = games.map((game) => ({
      ...game,
      CreatedAt: existingGameCreatedAt.get(game.MatchId) ?? game.CreatedAt,
    }));
    const normalizedGamePlayers = gamePlayers.map((player) => ({
      ...player,
      CreatedAt: existingGamePlayerCreatedAt.get(`${player.MatchId}:${player.XboxXuid}`) ?? player.CreatedAt,
    }));
    const normalizedSeriesPlayers = seriesPlayers.map((player) => ({
      ...player,
      CreatedAt: existingSeriesPlayerCreatedAt.get(player.XboxXuid) ?? player.CreatedAt,
    }));
    const statementVariableLimit = Math.min(SQLITE_MAX_VARIABLES, D1_SAFE_MAX_VARIABLES_PER_STATEMENT);

    const statements: D1PreparedStatement[] = [];
    const upsertSeriesStmt = this.DB.prepare(
      `
      INSERT INTO LeaderboardSeries (GuildId, QueueNumber, QueueChannelId, ResultsChannelId, StartedAt, CompletedAt, WinnerTeamIndex, SeriesScore, Source, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(GuildId, QueueNumber) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, ResultsChannelId=excluded.ResultsChannelId, StartedAt=excluded.StartedAt, CompletedAt=excluded.CompletedAt, WinnerTeamIndex=excluded.WinnerTeamIndex, SeriesScore=excluded.SeriesScore, Source=excluded.Source, UpdatedAt=excluded.UpdatedAt
      `,
    ).bind(
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
    statements.push(upsertSeriesStmt);

    const deleteSeriesPlayersStmt = this.DB.prepare(
      "DELETE FROM LeaderboardSeriesPlayers WHERE GuildId = ? AND QueueNumber = ?",
    ).bind(series.GuildId, series.QueueNumber);
    statements.push(deleteSeriesPlayersStmt);

    const deleteGamesStmt = this.DB.prepare("DELETE FROM LeaderboardGames WHERE GuildId = ? AND QueueNumber = ?").bind(
      series.GuildId,
      series.QueueNumber,
    );
    statements.push(deleteGamesStmt);

    if (normalizedGames.length > 0) {
      const variablesPerRow = 15;
      const maxRowsPerStatement = Math.max(1, Math.floor(statementVariableLimit / variablesPerRow));

      for (let start = 0; start < normalizedGames.length; start += maxRowsPerStatement) {
        const chunk = normalizedGames.slice(start, start + maxRowsPerStatement);
        const gamesPlaceholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
        const upsertGamesStmt = this.DB.prepare(
          `
      INSERT INTO LeaderboardGames (MatchId, GuildId, QueueNumber, QueueChannelId, GameIndexInSeries, GameVariantCategory, ModeName, MapName, MapAssetId, MapVersionId, Team0Score, Team1Score, StartedAt, EndedAt, CreatedAt)
      VALUES ${gamesPlaceholders}
      ON CONFLICT(GuildId, QueueNumber, MatchId) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, GameIndexInSeries=excluded.GameIndexInSeries, GameVariantCategory=excluded.GameVariantCategory, ModeName=excluded.ModeName, MapName=excluded.MapName, MapAssetId=excluded.MapAssetId, MapVersionId=excluded.MapVersionId, Team0Score=excluded.Team0Score, Team1Score=excluded.Team1Score, StartedAt=excluded.StartedAt, EndedAt=excluded.EndedAt
    `,
        ).bind(
          ...chunk.flatMap((game) => [
            game.MatchId,
            game.GuildId,
            game.QueueNumber,
            game.QueueChannelId,
            game.GameIndexInSeries,
            game.GameVariantCategory,
            game.ModeName,
            game.MapName,
            game.MapAssetId,
            game.MapVersionId,
            game.Team0Score,
            game.Team1Score,
            game.StartedAt,
            game.EndedAt,
            game.CreatedAt,
          ]),
        );
        statements.push(upsertGamesStmt);
      }
    }

    if (normalizedGamePlayers.length > 0) {
      const variablesPerRow = 28;
      const maxRowsPerStatement = Math.max(1, Math.floor(statementVariableLimit / variablesPerRow));

      for (let start = 0; start < normalizedGamePlayers.length; start += maxRowsPerStatement) {
        const chunk = normalizedGamePlayers.slice(start, start + maxRowsPerStatement);
        const rowPlaceholders = `(${Array.from({ length: variablesPerRow }, () => "?").join(", ")})`;
        const placeholders = chunk.map(() => rowPlaceholders).join(",");
        const stmt = this.DB.prepare(
          `
        INSERT INTO LeaderboardGamePlayers (MatchId, GuildId, QueueNumber, QueueChannelId, XboxXuid, DiscordUserId, GamertagSnapshot, TeamId, PresentAtBeginning, GameWon, RankInMatch, PersonalScore, Kills, Deaths, Assists, HeadshotKills, Kda, Accuracy, ShotsHit, ShotsFired, DamageDealt, DamageTaken, DamageRatio, AvgLifeSeconds, AvgDamagePerLife, ObjectiveStatsJson, MedalsJson, CreatedAt)
        VALUES ${placeholders}
        ON CONFLICT(GuildId, QueueNumber, MatchId, XboxXuid) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, DiscordUserId=excluded.DiscordUserId, GamertagSnapshot=excluded.GamertagSnapshot, TeamId=excluded.TeamId, PresentAtBeginning=excluded.PresentAtBeginning, GameWon=excluded.GameWon, RankInMatch=excluded.RankInMatch, PersonalScore=excluded.PersonalScore, Kills=excluded.Kills, Deaths=excluded.Deaths, Assists=excluded.Assists, HeadshotKills=excluded.HeadshotKills, Kda=excluded.Kda, Accuracy=excluded.Accuracy, ShotsHit=excluded.ShotsHit, ShotsFired=excluded.ShotsFired, DamageDealt=excluded.DamageDealt, DamageTaken=excluded.DamageTaken, DamageRatio=excluded.DamageRatio, AvgLifeSeconds=excluded.AvgLifeSeconds, AvgDamagePerLife=excluded.AvgDamagePerLife, ObjectiveStatsJson=excluded.ObjectiveStatsJson, MedalsJson=excluded.MedalsJson
      `,
        ).bind(
          ...chunk.flatMap((player) => [
            player.MatchId,
            player.GuildId,
            player.QueueNumber,
            player.QueueChannelId,
            player.XboxXuid,
            player.DiscordUserId,
            player.GamertagSnapshot,
            player.TeamId,
            player.PresentAtBeginning,
            player.GameWon,
            player.RankInMatch,
            player.PersonalScore,
            player.Kills,
            player.Deaths,
            player.Assists,
            player.HeadshotKills,
            player.Kda,
            player.Accuracy,
            player.ShotsHit,
            player.ShotsFired,
            player.DamageDealt,
            player.DamageTaken,
            player.DamageRatio,
            player.AvgLifeSeconds,
            player.AvgDamagePerLife,
            player.ObjectiveStatsJson,
            player.MedalsJson,
            player.CreatedAt,
          ]),
        );
        statements.push(stmt);
      }
    }

    if (normalizedSeriesPlayers.length > 0) {
      const variablesPerRow = 13;
      const maxRowsPerStatement = Math.max(1, Math.floor(statementVariableLimit / variablesPerRow));

      for (let start = 0; start < normalizedSeriesPlayers.length; start += maxRowsPerStatement) {
        const chunk = normalizedSeriesPlayers.slice(start, start + maxRowsPerStatement);
        const seriesPlayersPlaceholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
        const upsertSeriesPlayersStmt = this.DB.prepare(
          `
      INSERT INTO LeaderboardSeriesPlayers (GuildId, QueueNumber, QueueChannelId, XboxXuid, DiscordUserId, GamertagSnapshot, TeamId, PresentAtBeginningCount, SubstituteInCount, SubstituteOutCount, GamesPlayedCount, SeriesWon, CreatedAt)
      VALUES ${seriesPlayersPlaceholders}
      ON CONFLICT(GuildId, QueueNumber, XboxXuid) DO UPDATE SET QueueChannelId=excluded.QueueChannelId, DiscordUserId=excluded.DiscordUserId, GamertagSnapshot=excluded.GamertagSnapshot, TeamId=excluded.TeamId, PresentAtBeginningCount=excluded.PresentAtBeginningCount, SubstituteInCount=excluded.SubstituteInCount, SubstituteOutCount=excluded.SubstituteOutCount, GamesPlayedCount=excluded.GamesPlayedCount, SeriesWon=excluded.SeriesWon
    `,
        ).bind(
          ...chunk.flatMap((player) => [
            player.GuildId,
            player.QueueNumber,
            player.QueueChannelId,
            player.XboxXuid,
            player.DiscordUserId,
            player.GamertagSnapshot,
            player.TeamId,
            player.PresentAtBeginningCount,
            player.SubstituteInCount,
            player.SubstituteOutCount,
            player.GamesPlayedCount,
            player.SeriesWon,
            player.CreatedAt,
          ]),
        );
        statements.push(upsertSeriesPlayersStmt);
      }
    }

    await this.DB.batch(statements);
  }

  private async getLeaderboardGameCreatedAtByMatchId(
    guildId: string,
    queueNumber: number,
  ): Promise<Map<string, number>> {
    const stmt = this.DB.prepare(
      "SELECT MatchId, CreatedAt FROM LeaderboardGames WHERE GuildId = ? AND QueueNumber = ?",
    ).bind(guildId, queueNumber);
    const response = await stmt.all<{ MatchId: string; CreatedAt: number }>();
    const rows = response.results;
    return new Map(rows.map((row) => [row.MatchId, row.CreatedAt]));
  }

  private async getLeaderboardGamePlayerCreatedAtByKey(
    guildId: string,
    queueNumber: number,
  ): Promise<Map<string, number>> {
    const stmt = this.DB.prepare(
      "SELECT MatchId, XboxXuid, CreatedAt FROM LeaderboardGamePlayers WHERE GuildId = ? AND QueueNumber = ?",
    ).bind(guildId, queueNumber);
    const response = await stmt.all<{ MatchId: string; XboxXuid: string; CreatedAt: number }>();
    const rows = response.results;
    return new Map(rows.map((row) => [`${row.MatchId}:${row.XboxXuid}`, row.CreatedAt]));
  }

  private async getLeaderboardSeriesPlayerCreatedAtByXuid(
    guildId: string,
    queueNumber: number,
  ): Promise<Map<string, number>> {
    const stmt = this.DB.prepare(
      "SELECT XboxXuid, CreatedAt FROM LeaderboardSeriesPlayers WHERE GuildId = ? AND QueueNumber = ?",
    ).bind(guildId, queueNumber);
    const response = await stmt.all<{ XboxXuid: string; CreatedAt: number }>();
    const rows = response.results;
    return new Map(rows.map((row) => [row.XboxXuid, row.CreatedAt]));
  }

  async deleteLeaderboardDataForGuild(guildId: string): Promise<void> {
    const query = "DELETE FROM LeaderboardSeries WHERE GuildId = ?";
    const stmt = this.DB.prepare(query).bind(guildId);
    await stmt.run();
  }

  async deleteLeaderboardDataForQueueChannel(guildId: string, queueChannelId: string): Promise<void> {
    const query = "DELETE FROM LeaderboardSeries WHERE GuildId = ? AND QueueChannelId = ?";
    const stmt = this.DB.prepare(query).bind(guildId, queueChannelId);
    await stmt.run();
  }

  async deleteLeaderboardSeriesByQueueNumber(guildId: string, queueNumber: number): Promise<void> {
    const query = "DELETE FROM LeaderboardSeries WHERE GuildId = ? AND QueueNumber = ?";
    const stmt = this.DB.prepare(query).bind(guildId, queueNumber);
    await stmt.run();
  }

  async getLeaderboardSeriesByQueueNumber(guildId: string, queueNumber: number): Promise<LeaderboardSeriesRow | null> {
    const query = "SELECT * FROM LeaderboardSeries WHERE GuildId = ? AND QueueNumber = ?";
    const stmt = this.DB.prepare(query).bind(guildId, queueNumber);
    return await stmt.first<LeaderboardSeriesRow>();
  }

  async getLeaderboardSeriesWinRateRankings({
    guildId,
    queueChannelId,
    startEpochSeconds,
    minGamesPlayed,
    limit,
    offset,
  }: LeaderboardRankingsQuery): Promise<{ total: number; rows: LeaderboardRankingRow[] }> {
    const aggregateSql = `
      SELECT
        stats.XboxXuid AS XboxXuid,
        identity.DiscordUserId AS DiscordUserId,
        identity.GamertagSnapshot AS Gamertag,
        stats.SeriesPlayed AS SeriesPlayed,
        stats.SeriesWins AS SeriesWins,
        stats.GamesPlayed AS GamesPlayed,
        CAST(stats.SeriesWins AS REAL) / stats.SeriesPlayed AS MetricValue
      FROM (
        SELECT
          sp.XboxXuid AS XboxXuid,
          COUNT(*) AS SeriesPlayed,
          SUM(sp.SeriesWon) AS SeriesWins,
          SUM(sp.GamesPlayedCount) AS GamesPlayed
        FROM LeaderboardSeriesPlayers sp
        INNER JOIN LeaderboardSeries s
          ON s.GuildId = sp.GuildId
          AND s.QueueNumber = sp.QueueNumber
        WHERE s.GuildId = ?
          AND s.CompletedAt >= ?
          AND (? IS NULL OR s.QueueChannelId = ?)
        GROUP BY sp.XboxXuid
        HAVING SUM(sp.GamesPlayedCount) >= ?
      ) stats
      INNER JOIN (
        SELECT ranked.XboxXuid, ranked.DiscordUserId, ranked.GamertagSnapshot
        FROM (
          SELECT
            sp.XboxXuid AS XboxXuid,
            sp.DiscordUserId AS DiscordUserId,
            sp.GamertagSnapshot AS GamertagSnapshot,
            ROW_NUMBER() OVER (
              PARTITION BY sp.XboxXuid
              ORDER BY s.CompletedAt DESC, sp.CreatedAt DESC
            ) AS RowNumber
          FROM LeaderboardSeriesPlayers sp
          INNER JOIN LeaderboardSeries s
            ON s.GuildId = sp.GuildId
            AND s.QueueNumber = sp.QueueNumber
          WHERE s.GuildId = ?
            AND s.CompletedAt >= ?
            AND (? IS NULL OR s.QueueChannelId = ?)
        ) ranked
        WHERE ranked.RowNumber = 1
      ) identity
        ON identity.XboxXuid = stats.XboxXuid
    `;

    const bindings = [
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      minGamesPlayed,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
    ] as const;

    const countStmt = this.DB.prepare(`SELECT COUNT(*) AS Total FROM (${aggregateSql}) agg`).bind(...bindings);
    const countRow = await countStmt.first<{ Total: number }>();

    const rowsStmt = this.DB.prepare(
      `
        SELECT * FROM (${aggregateSql}) agg
        ORDER BY agg.MetricValue DESC, agg.SeriesWins DESC, agg.GamesPlayed DESC, agg.Gamertag ASC
        LIMIT ? OFFSET ?
      `,
    ).bind(...bindings, limit, offset);
    const rowsResponse = await rowsStmt.all<LeaderboardRankingRow>();

    return {
      total: countRow?.Total ?? 0,
      rows: rowsResponse.results,
    };
  }

  async getLeaderboardStatMetricRankings({
    guildId,
    queueChannelId,
    startEpochSeconds,
    minGamesPlayed,
    limit,
    offset,
    metric,
  }: LeaderboardRankingsQuery & {
    metric: Exclude<
      LeaderboardMetric,
      | LeaderboardMetric.SeriesPlayed
      | LeaderboardMetric.SeriesWins
      | LeaderboardMetric.SeriesWinRate
      | LeaderboardMetric.GamesPlayed
      | LeaderboardMetric.GameWins
      | LeaderboardMetric.GamesWinRate
    >;
  }): Promise<{
    total: number;
    rows: LeaderboardRankingRow[];
  }> {
    await this.ensureLeaderboardGameWonColumn();

    let metricSql: string;
    let metricBindings: readonly (string | number | null)[] = [];
    switch (metric) {
      case LeaderboardMetric.Kills: {
        metricSql = "SUM(gp.Kills)";
        break;
      }
      case LeaderboardMetric.Deaths: {
        metricSql = "SUM(gp.Deaths)";
        break;
      }
      case LeaderboardMetric.Assists: {
        metricSql = "SUM(gp.Assists)";
        break;
      }
      case LeaderboardMetric.HeadshotKills: {
        metricSql = "SUM(gp.HeadshotKills)";
        break;
      }
      case LeaderboardMetric.ShotsHit: {
        metricSql = "SUM(gp.ShotsHit)";
        break;
      }
      case LeaderboardMetric.ShotsFired: {
        metricSql = "SUM(gp.ShotsFired)";
        break;
      }
      case LeaderboardMetric.Kda: {
        metricSql = "AVG(gp.Kda)";
        break;
      }
      case LeaderboardMetric.Accuracy: {
        metricSql = "AVG(gp.Accuracy)";
        break;
      }
      case LeaderboardMetric.DamageDealt: {
        metricSql = "SUM(gp.DamageDealt)";
        break;
      }
      case LeaderboardMetric.DamageTaken: {
        metricSql = "SUM(gp.DamageTaken)";
        break;
      }
      case LeaderboardMetric.DamageRatio: {
        metricSql =
          "CASE WHEN SUM(gp.DamageTaken) = 0 THEN CASE WHEN SUM(gp.DamageDealt) = 0 THEN 0 ELSE 1.7976931348623157e308 END ELSE CAST(SUM(gp.DamageDealt) AS REAL) / SUM(gp.DamageTaken) END";
        break;
      }
      case LeaderboardMetric.AvgLifeSeconds: {
        metricSql = "AVG(gp.AvgLifeSeconds)";
        break;
      }
      case LeaderboardMetric.AvgDamagePerLife: {
        metricSql = "AVG(gp.AvgDamagePerLife)";
        break;
      }
      case LeaderboardMetric.PersonalScore: {
        metricSql = "SUM(gp.PersonalScore)";
        break;
      }
      case LeaderboardMetric.AvgPersonalScorePerSeries: {
        metricSql = getPerSeriesAverageSql("PersonalScore", "gp");
        metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
        break;
      }
      case LeaderboardMetric.AvgPersonalScorePerGame: {
        metricSql = "AVG(gp.PersonalScore)";
        break;
      }
      case LeaderboardMetric.AvgKillsPerSeries: {
        metricSql = getPerSeriesAverageSql("Kills", "gp");
        metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
        break;
      }
      case LeaderboardMetric.AvgKillsPerGame: {
        metricSql = "AVG(gp.Kills)";
        break;
      }
      case LeaderboardMetric.AvgDeathsPerSeries: {
        metricSql = getPerSeriesAverageSql("Deaths", "gp");
        metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
        break;
      }
      case LeaderboardMetric.AvgDeathsPerGame: {
        metricSql = "AVG(gp.Deaths)";
        break;
      }
      case LeaderboardMetric.AvgAssistsPerSeries: {
        metricSql = getPerSeriesAverageSql("Assists", "gp");
        metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
        break;
      }
      case LeaderboardMetric.AvgAssistsPerGame: {
        metricSql = "AVG(gp.Assists)";
        break;
      }
      case LeaderboardMetric.AvgHeadshotKillsPerSeries: {
        metricSql = getPerSeriesAverageSql("HeadshotKills", "gp");
        metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
        break;
      }
      case LeaderboardMetric.AvgHeadshotKillsPerGame: {
        metricSql = "AVG(gp.HeadshotKills)";
        break;
      }
      case LeaderboardMetric.AvgShotsHitPerSeries: {
        metricSql = getPerSeriesAverageSql("ShotsHit", "gp");
        metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
        break;
      }
      case LeaderboardMetric.AvgShotsHitPerGame: {
        metricSql = "AVG(gp.ShotsHit)";
        break;
      }
      case LeaderboardMetric.AvgShotsFiredPerSeries: {
        metricSql = getPerSeriesAverageSql("ShotsFired", "gp");
        metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
        break;
      }
      case LeaderboardMetric.AvgShotsFiredPerGame: {
        metricSql = "AVG(gp.ShotsFired)";
        break;
      }
      case LeaderboardMetric.AvgDamageDealtPerSeries: {
        metricSql = getPerSeriesAverageSql("DamageDealt", "gp");
        metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
        break;
      }
      case LeaderboardMetric.AvgDamageDealtPerGame: {
        metricSql = "AVG(gp.DamageDealt)";
        break;
      }
      case LeaderboardMetric.AvgDamageTakenPerSeries: {
        metricSql = getPerSeriesAverageSql("DamageTaken", "gp");
        metricBindings = [startEpochSeconds, queueChannelId, queueChannelId];
        break;
      }
      case LeaderboardMetric.AvgDamageTakenPerGame: {
        metricSql = "AVG(gp.DamageTaken)";
        break;
      }
      default: {
        throw new UnreachableError(metric);
      }
    }

    const aggregateSql = `
      SELECT
        stats.XboxXuid AS XboxXuid,
        identity.DiscordUserId AS DiscordUserId,
        identity.GamertagSnapshot AS Gamertag,
        COALESCE(seriesStats.SeriesPlayed, stats.SeriesPlayed) AS SeriesPlayed,
        COALESCE(seriesStats.SeriesWins, 0) AS SeriesWins,
        stats.GamesPlayed AS GamesPlayed,
        stats.GameWins AS GameWins,
        stats.MetricValue AS MetricValue
      FROM (
        SELECT
          gp.XboxXuid AS XboxXuid,
          COUNT(DISTINCT gp.QueueNumber) AS SeriesPlayed,
          COUNT(*) AS GamesPlayed,
          SUM(gp.GameWon) AS GameWins,
          ${metricSql} AS MetricValue
        FROM LeaderboardGamePlayers gp
        INNER JOIN LeaderboardGames g
          ON g.GuildId = gp.GuildId
          AND g.QueueNumber = gp.QueueNumber
          AND g.MatchId = gp.MatchId
        WHERE gp.GuildId = ?
          AND g.EndedAt >= ?
          AND (? IS NULL OR gp.QueueChannelId = ?)
        GROUP BY gp.XboxXuid
        HAVING COUNT(*) >= ?
      ) stats
      LEFT JOIN (
        SELECT
          sp.XboxXuid AS XboxXuid,
          COUNT(*) AS SeriesPlayed,
          SUM(sp.SeriesWon) AS SeriesWins
        FROM LeaderboardSeriesPlayers sp
        INNER JOIN LeaderboardSeries s
          ON s.GuildId = sp.GuildId
          AND s.QueueNumber = sp.QueueNumber
        WHERE s.GuildId = ?
          AND s.CompletedAt >= ?
          AND (? IS NULL OR s.QueueChannelId = ?)
        GROUP BY sp.XboxXuid
      ) seriesStats
        ON seriesStats.XboxXuid = stats.XboxXuid
      INNER JOIN (
        SELECT ranked.XboxXuid, ranked.DiscordUserId, ranked.GamertagSnapshot
        FROM (
          SELECT
            gp.XboxXuid AS XboxXuid,
            gp.DiscordUserId AS DiscordUserId,
            gp.GamertagSnapshot AS GamertagSnapshot,
            ROW_NUMBER() OVER (
              PARTITION BY gp.XboxXuid
              ORDER BY g.EndedAt DESC, gp.CreatedAt DESC
            ) AS RowNumber
          FROM LeaderboardGamePlayers gp
          INNER JOIN LeaderboardGames g
            ON g.GuildId = gp.GuildId
            AND g.QueueNumber = gp.QueueNumber
            AND g.MatchId = gp.MatchId
          WHERE gp.GuildId = ?
            AND g.EndedAt >= ?
            AND (? IS NULL OR gp.QueueChannelId = ?)
        ) ranked
        WHERE ranked.RowNumber = 1
      ) identity
        ON identity.XboxXuid = stats.XboxXuid
    `;

    const bindings = [
      ...metricBindings,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      minGamesPlayed,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
    ] as const;

    const countStmt = this.DB.prepare(`SELECT COUNT(*) AS Total FROM (${aggregateSql}) agg`).bind(...bindings);
    const countRow = await countStmt.first<{ Total: number }>();

    const metricSortDirection = isAscendingMetric(metric) ? "ASC" : "DESC";
    const rowsStmt = this.DB.prepare(
      `
        SELECT * FROM (${aggregateSql}) agg
        ORDER BY agg.MetricValue ${metricSortDirection}, agg.GamesPlayed DESC, agg.Gamertag ASC
        LIMIT ? OFFSET ?
      `,
    ).bind(...bindings, limit, offset);
    const rowsResponse = await rowsStmt.all<LeaderboardRankingRow>();

    return {
      total: countRow?.Total ?? 0,
      rows: rowsResponse.results,
    };
  }

  async getLeaderboardOutcomeMetricRankings({
    guildId,
    queueChannelId,
    startEpochSeconds,
    minGamesPlayed,
    limit,
    offset,
    metric,
  }: LeaderboardRankingsQuery & {
    metric:
      | LeaderboardMetric.SeriesPlayed
      | LeaderboardMetric.SeriesWins
      | LeaderboardMetric.GamesPlayed
      | LeaderboardMetric.GameWins
      | LeaderboardMetric.SeriesWinRate
      | LeaderboardMetric.GamesWinRate;
  }): Promise<{ total: number; rows: LeaderboardRankingRow[] }> {
    await this.ensureLeaderboardGameWonColumn();

    const metricSql = ((): string => {
      switch (metric) {
        case LeaderboardMetric.SeriesPlayed: {
          return "stats.SeriesPlayed";
        }
        case LeaderboardMetric.SeriesWins: {
          return "stats.SeriesWins";
        }
        case LeaderboardMetric.GamesPlayed: {
          return "stats.GamesPlayed";
        }
        case LeaderboardMetric.GameWins: {
          return "stats.GameWins";
        }
        case LeaderboardMetric.SeriesWinRate: {
          return "CASE WHEN stats.SeriesPlayed = 0 THEN 0 ELSE CAST(stats.SeriesWins AS REAL) / stats.SeriesPlayed END";
        }
        case LeaderboardMetric.GamesWinRate: {
          return "CASE WHEN stats.GamesPlayed = 0 THEN 0 ELSE CAST(stats.GameWins AS REAL) / stats.GamesPlayed END";
        }
        default: {
          throw new UnreachableError(metric);
        }
      }
    })();

    const aggregateSql = `
      SELECT
        stats.XboxXuid AS XboxXuid,
        identity.DiscordUserId AS DiscordUserId,
        identity.GamertagSnapshot AS Gamertag,
        stats.SeriesPlayed AS SeriesPlayed,
        stats.SeriesWins AS SeriesWins,
        stats.GamesPlayed AS GamesPlayed,
        stats.GameWins AS GameWins,
        ${metricSql} AS MetricValue
      FROM (
        SELECT
          sp.XboxXuid AS XboxXuid,
          COUNT(*) AS SeriesPlayed,
          SUM(sp.SeriesWon) AS SeriesWins,
          SUM(sp.GamesPlayedCount) AS GamesPlayed,
          COALESCE(gameStats.GameWins, 0) AS GameWins
        FROM LeaderboardSeriesPlayers sp
        INNER JOIN LeaderboardSeries s
          ON s.GuildId = sp.GuildId
          AND s.QueueNumber = sp.QueueNumber
        LEFT JOIN (
          SELECT gp.XboxXuid, SUM(gp.GameWon) AS GameWins
          FROM LeaderboardGamePlayers gp
          INNER JOIN LeaderboardSeries sGames
            ON sGames.GuildId = gp.GuildId
            AND sGames.QueueNumber = gp.QueueNumber
          WHERE gp.GuildId = ?
            AND sGames.CompletedAt >= ?
            AND (? IS NULL OR sGames.QueueChannelId = ?)
          GROUP BY gp.XboxXuid
        ) gameStats
          ON gameStats.XboxXuid = sp.XboxXuid
        WHERE s.GuildId = ?
          AND s.CompletedAt >= ?
          AND (? IS NULL OR s.QueueChannelId = ?)
        GROUP BY sp.XboxXuid
        HAVING SUM(sp.GamesPlayedCount) >= ?
      ) stats
      INNER JOIN (
        SELECT ranked.XboxXuid, ranked.DiscordUserId, ranked.GamertagSnapshot
        FROM (
          SELECT
            gp.XboxXuid AS XboxXuid,
            gp.DiscordUserId AS DiscordUserId,
            gp.GamertagSnapshot AS GamertagSnapshot,
            ROW_NUMBER() OVER (
              PARTITION BY gp.XboxXuid
              ORDER BY g.EndedAt DESC, gp.CreatedAt DESC
            ) AS RowNumber
          FROM LeaderboardGamePlayers gp
          INNER JOIN LeaderboardGames g
            ON g.GuildId = gp.GuildId
            AND g.QueueNumber = gp.QueueNumber
            AND g.MatchId = gp.MatchId
          WHERE gp.GuildId = ?
            AND g.EndedAt >= ?
            AND (? IS NULL OR gp.QueueChannelId = ?)
        ) ranked
        WHERE ranked.RowNumber = 1
      ) identity
        ON identity.XboxXuid = stats.XboxXuid
    `;

    const bindings = [
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
      minGamesPlayed,
      guildId,
      startEpochSeconds,
      queueChannelId,
      queueChannelId,
    ] as const;
    const countStmt = this.DB.prepare(`SELECT COUNT(*) AS Total FROM (${aggregateSql}) agg`).bind(...bindings);
    const countRow = await countStmt.first<{ Total: number }>();
    const rowsStmt = this.DB.prepare(
      `SELECT * FROM (${aggregateSql}) agg ORDER BY agg.MetricValue DESC, agg.GamesPlayed DESC, agg.Gamertag ASC LIMIT ? OFFSET ?`,
    ).bind(...bindings, limit, offset);
    const rowsResponse = await rowsStmt.all<LeaderboardRankingRow>();

    return { total: countRow?.Total ?? 0, rows: rowsResponse.results };
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

  async findActiveXboxIdentityByGamertag(gamertag: string): Promise<LinkedIdentitiesRow | null> {
    const query =
      "SELECT * FROM LinkedIdentities WHERE Provider = 'xbox' AND IsActive = 1 AND Gamertag = ? ORDER BY UpdatedAt DESC";
    const stmt = this.DB.prepare(query).bind(gamertag);
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
