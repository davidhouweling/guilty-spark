import { LeaderboardWindow, LeaderboardMetric } from "@guilty-spark/shared/halo/leaderboard";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { DatabaseServiceOpts } from "../database";
import { DatabaseService } from "../database";
import type { DiscordAssociationsRow } from "../types/discord_associations";
import { AssociationReason, GamesRetrievable } from "../types/discord_associations";
import type { GuildConfigRow } from "../types/guild_config";
import { StatsReturnType, MapsPostType, MapsPlaylistType, MapsFormatType } from "../types/guild_config";
import type { NeatQueueConfigRow } from "../types/neat_queue_config";
import { NeatQueuePostSeriesDisplayMode } from "../types/neat_queue_config";
import type { UserSessionsRow } from "../types/user_sessions";
import type { UserCredentialsRow } from "../types/user_credentials";
import type { LinkedIdentitiesRow } from "../types/linked_identities";
import type { IndividualTrackerProfilesRow } from "../types/individual_tracker_profiles";
import type { IndividualTrackerGamesRow } from "../types/individual_tracker_games";
import type { StreamerViewSettingsRow } from "../types/streamer_view_settings";
import type { IndividualTrackersRow } from "../types/individual_trackers";
import type { LeaderboardConfigRow } from "../types/leaderboard_config";
import type { LeaderboardSeriesRow } from "../types/leaderboard_series";
import type { LeaderboardSeriesPlayersRow } from "../types/leaderboard_series_players";
import type { LeaderboardGamesRow } from "../types/leaderboard_games";
import type { LeaderboardGamePlayersRow } from "../types/leaderboard_game_players";
import type { LeaderboardPostRow } from "../types/leaderboard_post";

export function aFakeDiscordAssociationsRow(opts: Partial<DiscordAssociationsRow> = {}): DiscordAssociationsRow {
  const defaultOpts: DiscordAssociationsRow = {
    DiscordId: "discord_user_01",
    XboxId: "0000000000001",
    AssociationReason: AssociationReason.USERNAME_SEARCH,
    AssociationDate: new Date("2024-09-01T00:00:00.000Z").getTime(),
    GamesRetrievable: GamesRetrievable.YES,
    DiscordDisplayNameSearched: null,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeGuildConfigRow(opts: Partial<GuildConfigRow> = {}): GuildConfigRow {
  const defaultOpts: GuildConfigRow = {
    GuildId: "discord_guild_01",
    Medals: "Y",
    StatsReturn: StatsReturnType.SERIES_ONLY,
    NeatQueueInformerPlayerConnections: "Y",
    NeatQueueInformerMapsPost: MapsPostType.BUTTON,
    NeatQueueInformerMapsPlaylist: MapsPlaylistType.HCS_CURRENT,
    NeatQueueInformerMapsFormat: MapsFormatType.HCS,
    NeatQueueInformerMapsCount: 5,
    NeatQueueInformerLiveTracking: "N",
    NeatQueueInformerLiveTrackingChannelName: "N",
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeNeatQueueConfigRow(opts: Partial<NeatQueueConfigRow> = {}): NeatQueueConfigRow {
  const defaultOpts: NeatQueueConfigRow = {
    GuildId: "guild-1",
    ChannelId: "channel-1",
    WebhookSecret: "hashed-secret",
    ResultsChannelId: "results-channel-1",
    PostSeriesMode: NeatQueuePostSeriesDisplayMode.THREAD,
    PostSeriesChannelId: null,
  };
  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeLeaderboardPostRow(opts: Partial<LeaderboardPostRow> = {}): LeaderboardPostRow {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const defaultOpts: LeaderboardPostRow = {
    ChannelId: "leaderboard-channel-1",
    MessageId: "leaderboard-message-1",
    GuildId: "guild-1",
    QueueChannelId: null,
    Window: LeaderboardWindow.ThreeMonths,
    Metric: LeaderboardMetric.SeriesWinRate,
    MinGamesPlayed: 5,
    Page: 1,
    Locale: "en-US",
    CreatedAt: nowEpoch,
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeDatabaseServiceWith(opts: Partial<DatabaseServiceOpts> = {}): DatabaseService {
  return new DatabaseService({
    env: aFakeEnvWith(),
    ...opts,
  });
}

export function aFakeUserSessionsRow(opts: Partial<UserSessionsRow> = {}): UserSessionsRow {
  const defaultOpts: UserSessionsRow = {
    SessionId: "session-1",
    UserId: "user-1",
    AccessToken: "access-token",
    RefreshToken: "refresh-token",
    ExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    CreatedAt: Math.floor(Date.now() / 1000),
    LastRefreshedAt: null,
    AuthMetadataJson: "{}",
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeUserCredentialsRow(opts: Partial<UserCredentialsRow> = {}): UserCredentialsRow {
  const defaultOpts: UserCredentialsRow = {
    UserId: "user-1",
    RefreshToken: "encrypted-refresh-token",
    UpdatedAt: Math.floor(Date.now() / 1000),
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeLinkedIdentitiesRow(opts: Partial<LinkedIdentitiesRow> = {}): LinkedIdentitiesRow {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const defaultOpts: LinkedIdentitiesRow = {
    IdentityId: "identity-1",
    UserId: "user-1",
    Provider: "xbox",
    ProviderUserId: "xbox-user-1",
    Gamertag: "Gamertag01",
    TwitchId: null,
    IsActive: 1,
    CreatedAt: nowEpoch,
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeIndividualTrackerProfilesRow(
  opts: Partial<IndividualTrackerProfilesRow> = {},
): IndividualTrackerProfilesRow {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const defaultOpts: IndividualTrackerProfilesRow = {
    ProfileId: "profile-1",
    UserId: "user-1",
    ActiveIdentityId: "identity-1",
    Name: "default",
    CreatedAt: nowEpoch,
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeIndividualTrackerGamesRow(
  opts: Partial<IndividualTrackerGamesRow> = {},
): IndividualTrackerGamesRow {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const defaultOpts: IndividualTrackerGamesRow = {
    ProfileId: "profile-1",
    MatchId: "match-1",
    Position: 1,
    Included: 1,
    AnnotationsJson: "{}",
    CreatedAt: nowEpoch,
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeStreamerViewSettingsRow(opts: Partial<StreamerViewSettingsRow> = {}): StreamerViewSettingsRow {
  const defaultOpts: StreamerViewSettingsRow = {
    ProfileId: "profile-1",
    LayoutOptionsJson: "{}",
    VisibleSectionsJson: "[]",
    StyleFlagsJson: "{}",
    UpdatedAt: Math.floor(Date.now() / 1000),
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeIndividualTrackersRow(opts: Partial<IndividualTrackersRow> = {}): IndividualTrackersRow {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const defaultOpts: IndividualTrackersRow = {
    TrackerId: "tracker-1",
    UserId: "user-1",
    Gamertag: "Gamertag01",
    Xuid: "2533274000000001",
    Status: "stopped",
    IsLive: 0,
    CreatedAt: nowEpoch,
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeLeaderboardConfigRow(opts: Partial<LeaderboardConfigRow> = {}): LeaderboardConfigRow {
  const defaultOpts: LeaderboardConfigRow = {
    GuildId: "guild-1",
    EnabledWindowsJson: '["1W","1M","3M","6M","12M"]',
    DefaultWindow: LeaderboardWindow.ThreeMonths,
    DefaultMetric: LeaderboardMetric.SeriesWinRate,
    MinGamesPlayed: 5,
    UpdatedAt: Math.floor(Date.now() / 1000),
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeLeaderboardSeriesRow(opts: Partial<LeaderboardSeriesRow> = {}): LeaderboardSeriesRow {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const defaultOpts: LeaderboardSeriesRow = {
    GuildId: "guild-1",
    QueueNumber: 100,
    QueueChannelId: "queue-channel-1",
    ResultsChannelId: "results-channel-1",
    StartedAt: nowEpoch - 1800,
    CompletedAt: nowEpoch,
    WinnerTeamIndex: 0,
    SeriesScore: "2:1",
    Source: "neatqueue",
    CreatedAt: nowEpoch,
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeLeaderboardSeriesPlayersRow(
  opts: Partial<LeaderboardSeriesPlayersRow> = {},
): LeaderboardSeriesPlayersRow {
  const defaultOpts: LeaderboardSeriesPlayersRow = {
    GuildId: "guild-1",
    QueueNumber: 100,
    QueueChannelId: "queue-channel-1",
    XboxXuid: "2533274000000001",
    DiscordUserId: "discord-user-1",
    GamertagSnapshot: "PlayerOne",
    TeamId: 0,
    PresentAtBeginningCount: 3,
    SubstituteInCount: 0,
    SubstituteOutCount: 0,
    GamesPlayedCount: 3,
    SeriesWon: 1,
    CreatedAt: Math.floor(Date.now() / 1000),
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeLeaderboardGamesRow(opts: Partial<LeaderboardGamesRow> = {}): LeaderboardGamesRow {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const defaultOpts: LeaderboardGamesRow = {
    MatchId: "match-1",
    GuildId: "guild-1",
    QueueNumber: 100,
    QueueChannelId: "queue-channel-1",
    GameIndexInSeries: 0,
    GameVariantCategory: 0,
    ModeName: "Slayer",
    MapName: "Recharge",
    MapAssetId: "map-asset",
    MapVersionId: "map-version",
    Team0Score: 50,
    Team1Score: 45,
    StartedAt: nowEpoch - 900,
    EndedAt: nowEpoch - 300,
    CreatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeLeaderboardGamePlayersRow(
  opts: Partial<LeaderboardGamePlayersRow> = {},
): LeaderboardGamePlayersRow {
  const defaultOpts: LeaderboardGamePlayersRow = {
    MatchId: "match-1",
    GuildId: "guild-1",
    QueueNumber: 100,
    QueueChannelId: "queue-channel-1",
    XboxXuid: "2533274000000001",
    DiscordUserId: "discord-user-1",
    GamertagSnapshot: "PlayerOne",
    TeamId: 0,
    PresentAtBeginning: 1,
    RankInMatch: 1,
    PersonalScore: 2500,
    Kills: 20,
    Deaths: 15,
    Assists: 10,
    Kda: 2,
    Accuracy: 55.5,
    ShotsHit: 300,
    ShotsFired: 540,
    DamageDealt: 12000,
    DamageTaken: 10000,
    DamageRatio: 1.2,
    AvgLifeSeconds: 28,
    AvgDamagePerLife: 800,
    ObjectiveStatsJson: "{}",
    MedalsJson: "[]",
    CreatedAt: Math.floor(Date.now() / 1000),
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}
