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
import type { LinkedIdentitiesRow } from "../types/linked_identities";
import type { IndividualTrackerProfilesRow } from "../types/individual_tracker_profiles";
import type { IndividualTrackerGamesRow } from "../types/individual_tracker_games";
import type { IndividualTrackerActiveSessionsRow } from "../types/individual_tracker_active_sessions";
import type { IndividualTrackerSessionsRow } from "../types/individual_tracker_sessions";
import type { StreamerViewSettingsRow } from "../types/streamer_view_settings";

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
    IdleTimeoutHours: 1,
    AllowContinueAfterLogout: 0,
    CreatedAt: nowEpoch,
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeIndividualTrackerActiveSessionsRow(
  opts: Partial<IndividualTrackerActiveSessionsRow> = {},
): IndividualTrackerActiveSessionsRow {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const defaultOpts: IndividualTrackerActiveSessionsRow = {
    UserId: "user-1",
    TrackerId: "fake-tracker-id",
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeIndividualTrackerSessionsRow(
  opts: Partial<IndividualTrackerSessionsRow> = {},
): IndividualTrackerSessionsRow {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const defaultOpts: IndividualTrackerSessionsRow = {
    UserId: "user-1",
    TrackerId: "fake-tracker-id",
    Xuid: "2533274844642438",
    Gamertag: "FakeGamertag",
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
