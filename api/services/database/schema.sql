CREATE TABLE IF NOT EXISTS DiscordAssociations (
  DiscordId TEXT PRIMARY KEY NOT NULL,
  XboxId TEXT NOT NULL,
  AssociationReason CHAR(1) CHECK(AssociationReason IN ('C', 'M', 'U', 'D', 'G', '?')) NOT NULL DEFAULT '?',
  AssociationDate INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
  GamesRetrievable CHAR(1) CHECK(GamesRetrievable IN ('Y', 'N', '?')) NOT NULL DEFAULT '?',
  DiscordDisplayNameSearched TEXT
);

CREATE TABLE IF NOT EXISTS GuildConfig (
    GuildId TEXT PRIMARY KEY,
    StatsReturn CHAR(1) CHECK(StatsReturn IN ('S', 'A')) NOT NULL DEFAULT 'S',
    Medals CHAR(1) CHECK(Medals IN ('Y', 'N')) NOT NULL DEFAULT 'Y',
    NeatQueueInformerPlayerConnections CHAR(1) CHECK(NeatQueueInformerPlayerConnections IN ('Y', 'N')) NOT NULL DEFAULT 'Y',
    NeatQueueInformerLiveTracking CHAR(1) CHECK(NeatQueueInformerLiveTracking IN ('Y', 'N')) NOT NULL DEFAULT 'N',
    NeatQueueInformerLiveTrackingChannelName CHAR(1) CHECK(NeatQueueInformerLiveTrackingChannelName IN ('Y', 'N')) NOT NULL DEFAULT 'N',
    NeatQueueInformerMapsPost CHAR(1) CHECK(NeatQueueInformerMapsPost IN ('A', 'B', 'O')) NOT NULL DEFAULT 'B',
    NeatQueueInformerMapsPlaylist CHAR(1) CHECK(NeatQueueInformerMapsPlaylist IN ('C', 'H')) NOT NULL DEFAULT 'C',
    NeatQueueInformerMapsFormat CHAR(1) CHECK(NeatQueueInformerMapsFormat IN ('H', 'R', 'O', 'S')) NOT NULL DEFAULT 'H',
    NeatQueueInformerMapsCount INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS NeatQueueConfig (
    GuildId TEXT NOT NULL,
    ChannelId TEXT NOT NULL,
    WebhookSecret TEXT NOT NULL,
    ResultsChannelId TEXT NOT NULL,
    PostSeriesMode CHAR(1) CHECK(PostSeriesMode IN ('T', 'M', 'C')) NOT NULL DEFAULT 'T',
    PostSeriesChannelId TEXT,
    PRIMARY KEY (GuildId, ChannelId)
);

CREATE TABLE IF NOT EXISTS UserSessions (
    SessionId TEXT PRIMARY KEY NOT NULL,
    UserId TEXT NOT NULL,
    AccessToken TEXT NOT NULL,
    RefreshToken TEXT,
    ExpiresAt INTEGER NOT NULL,
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    LastRefreshedAt INTEGER,
    AuthMetadataJson TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(AuthMetadataJson))
);

CREATE INDEX IF NOT EXISTS IdxUserSessionsUserId ON UserSessions (UserId);
CREATE INDEX IF NOT EXISTS IdxUserSessionsExpiresAt ON UserSessions (ExpiresAt);

CREATE TABLE IF NOT EXISTS LinkedIdentities (
    IdentityId TEXT PRIMARY KEY NOT NULL,
    UserId TEXT NOT NULL,
    Provider TEXT NOT NULL CHECK (Provider IN ('xbox', 'twitch', 'discord')),
    ProviderUserId TEXT NOT NULL,
    Gamertag TEXT,
    TwitchId TEXT,
    IsActive INTEGER NOT NULL DEFAULT 1 CHECK (IsActive IN (0, 1)),
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (Provider, ProviderUserId)
);

CREATE INDEX IF NOT EXISTS IdxLinkedIdentitiesUserId ON LinkedIdentities (UserId);
CREATE UNIQUE INDEX IF NOT EXISTS UqLinkedIdentitiesActiveXboxPerUser
    ON LinkedIdentities (UserId)
    WHERE Provider = 'xbox' AND IsActive = 1;

CREATE TABLE IF NOT EXISTS IndividualTrackerProfiles (
    ProfileId TEXT PRIMARY KEY NOT NULL,
    UserId TEXT NOT NULL,
    ActiveIdentityId TEXT,
    Name TEXT NOT NULL DEFAULT 'default',
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (ActiveIdentityId) REFERENCES LinkedIdentities(IdentityId),
    UNIQUE (UserId, Name)
);

CREATE INDEX IF NOT EXISTS IdxIndividualTrackerProfilesUserId ON IndividualTrackerProfiles (UserId);

CREATE TABLE IF NOT EXISTS IndividualTrackerGames (
    ProfileId TEXT NOT NULL,
    MatchId TEXT NOT NULL,
    Position INTEGER NOT NULL,
    Included INTEGER NOT NULL DEFAULT 1 CHECK (Included IN (0, 1)),
    AnnotationsJson TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(AnnotationsJson)),
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (ProfileId, MatchId),
    FOREIGN KEY (ProfileId) REFERENCES IndividualTrackerProfiles(ProfileId) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IdxIndividualTrackerGamesProfilePosition ON IndividualTrackerGames (ProfileId, Position);

CREATE TABLE IF NOT EXISTS StreamerViewSettings (
    ProfileId TEXT PRIMARY KEY NOT NULL,
    LayoutOptionsJson TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(LayoutOptionsJson)),
    VisibleSectionsJson TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(VisibleSectionsJson)),
    StyleFlagsJson TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(StyleFlagsJson)),
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (ProfileId) REFERENCES IndividualTrackerProfiles(ProfileId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS IndividualTrackers (
    TrackerId TEXT PRIMARY KEY NOT NULL,
    UserId TEXT NOT NULL,
    Gamertag TEXT NOT NULL,
    Xuid TEXT NOT NULL,
    Status TEXT NOT NULL DEFAULT 'stopped' CHECK (Status IN ('active', 'paused', 'stopped')),
    IsLive INTEGER NOT NULL DEFAULT 0 CHECK (IsLive IN (0, 1)),
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS IdxIndividualTrackersUserId ON IndividualTrackers (UserId);
CREATE INDEX IF NOT EXISTS IdxIndividualTrackersXuid ON IndividualTrackers (Xuid);
CREATE UNIQUE INDEX IF NOT EXISTS UqIndividualTrackersLivePerUser ON IndividualTrackers (UserId) WHERE IsLive = 1;