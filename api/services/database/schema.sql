CREATE TABLE IF NOT EXISTS DiscordAssociations (
  DiscordId TEXT PRIMARY KEY NOT NULL,
  XboxId TEXT NOT NULL,
  AssociationReason CHAR(1) CHECK(AssociationReason IN ('C', 'M', 'U', 'D', 'G', '?')) NOT NULL DEFAULT '?',
  AssociationDate INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
  GamesRetrievable CHAR(1) CHECK(GamesRetrievable IN ('Y', 'N', '?')) NOT NULL DEFAULT '?',
  DiscordDisplayNameSearched TEXT
);

CREATE INDEX IF NOT EXISTS IdxDiscordAssociationsXboxId ON DiscordAssociations (XboxId);

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

CREATE INDEX IF NOT EXISTS IdxNeatQueueConfigGuildWebhookSecret
    ON NeatQueueConfig (GuildId, WebhookSecret);

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
CREATE INDEX IF NOT EXISTS IdxUserSessionsCreatedAt ON UserSessions (CreatedAt);

CREATE TABLE IF NOT EXISTS UserCredentials (
    UserId TEXT PRIMARY KEY NOT NULL,
    RefreshToken TEXT NOT NULL,
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

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
CREATE INDEX IF NOT EXISTS IdxLinkedIdentitiesUserIdCreatedAt
    ON LinkedIdentities (UserId, CreatedAt DESC);
CREATE INDEX IF NOT EXISTS IdxLinkedIdentitiesActiveXboxGamertagUpdatedAt
    ON LinkedIdentities (Gamertag, UpdatedAt DESC)
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
CREATE INDEX IF NOT EXISTS IdxIndividualTrackerProfilesUserIdCreatedAt
    ON IndividualTrackerProfiles (UserId, CreatedAt ASC);

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
CREATE INDEX IF NOT EXISTS IdxIndividualTrackersUserIdCreatedAt
    ON IndividualTrackers (UserId, CreatedAt ASC);
CREATE UNIQUE INDEX IF NOT EXISTS UqIndividualTrackersLivePerUser ON IndividualTrackers (UserId) WHERE IsLive = 1;

CREATE TABLE IF NOT EXISTS LeaderboardConfig (
    GuildId TEXT PRIMARY KEY NOT NULL,
    EnabledWindowsJson TEXT NOT NULL DEFAULT '["1W","1M","3M","6M","12M"]' CHECK (json_valid(EnabledWindowsJson)),
    DefaultWindow TEXT NOT NULL DEFAULT '3M' CHECK (DefaultWindow IN ('1W', '1M', '3M', '6M', '12M')),
    DefaultMetric TEXT NOT NULL DEFAULT 'SERIES_WIN_RATE' CHECK (DefaultMetric IN ('SERIES_WIN_RATE', 'KILLS', 'DEATHS', 'ASSISTS', 'HEADSHOT_KILLS', 'SHOTS_HIT', 'SHOTS_FIRED', 'KDA', 'ACCURACY', 'DAMAGE_DEALT', 'DAMAGE_TAKEN', 'DAMAGE_RATIO', 'AVG_LIFE_SECONDS', 'AVG_DAMAGE_PER_LIFE', 'PERSONAL_SCORE')),
    MinGamesPlayed INTEGER NOT NULL DEFAULT 5 CHECK (MinGamesPlayed >= 0),
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS LeaderboardPosts (
    GuildId TEXT NOT NULL,
    ChannelId TEXT NOT NULL,
    MessageId TEXT NOT NULL,
    QueueChannelId TEXT,
    PRIMARY KEY (ChannelId, MessageId)
);

CREATE INDEX IF NOT EXISTS IdxLeaderboardPostsGuildQueue
    ON LeaderboardPosts (GuildId, QueueChannelId);

CREATE TABLE IF NOT EXISTS LeaderboardResetMarkers (
    GuildId TEXT NOT NULL,
    QueueChannelId TEXT NOT NULL DEFAULT '',
    ResetAt INTEGER NOT NULL,
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (GuildId, QueueChannelId)
);

CREATE TABLE IF NOT EXISTS LeaderboardSeries (
    GuildId TEXT NOT NULL,
    QueueNumber INTEGER NOT NULL,
    QueueChannelId TEXT NOT NULL,
    ResultsChannelId TEXT,
    StartedAt INTEGER,
    CompletedAt INTEGER NOT NULL,
    WinnerTeamIndex INTEGER NOT NULL,
    SeriesScore TEXT NOT NULL,
    Source TEXT NOT NULL DEFAULT 'neatqueue' CHECK (Source IN ('neatqueue')),
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (GuildId, QueueNumber)
);

CREATE INDEX IF NOT EXISTS IdxLeaderboardSeriesGuildCompletedAt
    ON LeaderboardSeries (GuildId, CompletedAt DESC);
CREATE INDEX IF NOT EXISTS IdxLeaderboardSeriesGuildQueueCompletedAt
    ON LeaderboardSeries (GuildId, QueueChannelId, CompletedAt DESC);

CREATE TABLE IF NOT EXISTS LeaderboardSeriesPlayers (
    GuildId TEXT NOT NULL,
    QueueNumber INTEGER NOT NULL,
    QueueChannelId TEXT NOT NULL,
    XboxXuid TEXT NOT NULL,
    DiscordUserId TEXT,
    GamertagSnapshot TEXT NOT NULL,
    TeamId INTEGER NOT NULL,
    PresentAtBeginningCount INTEGER NOT NULL DEFAULT 0,
    SubstituteInCount INTEGER NOT NULL DEFAULT 0,
    SubstituteOutCount INTEGER NOT NULL DEFAULT 0,
    GamesPlayedCount INTEGER NOT NULL DEFAULT 0,
    SeriesWon INTEGER NOT NULL CHECK (SeriesWon IN (0, 1)),
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (GuildId, QueueNumber, XboxXuid),
    FOREIGN KEY (GuildId, QueueNumber) REFERENCES LeaderboardSeries(GuildId, QueueNumber) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IdxLeaderboardSeriesPlayersGuildQueueXuid
    ON LeaderboardSeriesPlayers (GuildId, QueueChannelId, XboxXuid);
CREATE INDEX IF NOT EXISTS IdxLeaderboardSeriesPlayersGuildQueueDiscord
    ON LeaderboardSeriesPlayers (GuildId, QueueChannelId, DiscordUserId);

CREATE TABLE IF NOT EXISTS LeaderboardGames (
    MatchId TEXT NOT NULL,
    GuildId TEXT NOT NULL,
    QueueNumber INTEGER NOT NULL,
    QueueChannelId TEXT NOT NULL,
    GameIndexInSeries INTEGER NOT NULL,
    GameVariantCategory INTEGER NOT NULL,
    ModeName TEXT NOT NULL,
    MapName TEXT NOT NULL,
    MapAssetId TEXT,
    MapVersionId TEXT,
    Team0Score INTEGER,
    Team1Score INTEGER,
    StartedAt INTEGER NOT NULL,
    EndedAt INTEGER NOT NULL,
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (GuildId, QueueNumber, MatchId),
    UNIQUE (GuildId, QueueNumber, GameIndexInSeries),
    FOREIGN KEY (GuildId, QueueNumber) REFERENCES LeaderboardSeries(GuildId, QueueNumber) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IdxLeaderboardGamesGuildQueueStartedAt
    ON LeaderboardGames (GuildId, QueueChannelId, StartedAt DESC);
CREATE INDEX IF NOT EXISTS IdxLeaderboardGamesMatchId
    ON LeaderboardGames (MatchId);

CREATE TABLE IF NOT EXISTS LeaderboardGamePlayers (
    MatchId TEXT NOT NULL,
    GuildId TEXT NOT NULL,
    QueueNumber INTEGER NOT NULL,
    QueueChannelId TEXT NOT NULL,
    XboxXuid TEXT NOT NULL,
    DiscordUserId TEXT,
    GamertagSnapshot TEXT NOT NULL,
    TeamId INTEGER NOT NULL,
    PresentAtBeginning INTEGER NOT NULL CHECK (PresentAtBeginning IN (0, 1)),
    GameWon INTEGER NOT NULL DEFAULT 0 CHECK (GameWon IN (0, 1)),
    RankInMatch INTEGER,
    PersonalScore INTEGER NOT NULL,
    Kills INTEGER NOT NULL,
    Deaths INTEGER NOT NULL,
    Assists INTEGER NOT NULL,
    HeadshotKills INTEGER NOT NULL,
    Kda REAL NOT NULL,
    Accuracy REAL NOT NULL,
    ShotsHit INTEGER NOT NULL,
    ShotsFired INTEGER NOT NULL,
    DamageDealt INTEGER NOT NULL,
    DamageTaken INTEGER NOT NULL,
    DamageRatio REAL NOT NULL,
    AvgLifeSeconds REAL NOT NULL,
    AvgDamagePerLife REAL NOT NULL,
    MedalCount INTEGER NOT NULL DEFAULT 0,
    MedalPoints INTEGER NOT NULL DEFAULT 0,
    MythicMedalCount INTEGER NOT NULL DEFAULT 0,
    ObjectiveTimeSeconds REAL,
    ObjectiveTeamContribution REAL,
    ObjectiveGameContribution REAL,
    ObjectiveStatsJson TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(ObjectiveStatsJson)),
    MedalsJson TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(MedalsJson)),
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (GuildId, QueueNumber, MatchId, XboxXuid),
    FOREIGN KEY (GuildId, QueueNumber, MatchId) REFERENCES LeaderboardGames(GuildId, QueueNumber, MatchId) ON DELETE CASCADE,
    FOREIGN KEY (GuildId, QueueNumber) REFERENCES LeaderboardSeries(GuildId, QueueNumber) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IdxLeaderboardGamePlayersGuildQueueXuid
    ON LeaderboardGamePlayers (GuildId, QueueChannelId, XboxXuid);
CREATE INDEX IF NOT EXISTS IdxLeaderboardGamePlayersGuildQueueDiscord
    ON LeaderboardGamePlayers (GuildId, QueueChannelId, DiscordUserId);

CREATE TABLE IF NOT EXISTS MatchKillMatrix (
    MatchId TEXT NOT NULL,
    KillerXuid TEXT NOT NULL,
    VictimXuid TEXT NOT NULL,
    Count INTEGER NOT NULL CHECK (Count >= 0),
    Perfects INTEGER NOT NULL DEFAULT 0 CHECK (Perfects >= 0),
    CreatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UpdatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (MatchId, KillerXuid, VictimXuid)
);

CREATE INDEX IF NOT EXISTS IdxMatchKillMatrixKillerXuid
    ON MatchKillMatrix (KillerXuid);
CREATE INDEX IF NOT EXISTS IdxMatchKillMatrixVictimXuid
    ON MatchKillMatrix (VictimXuid);
CREATE INDEX IF NOT EXISTS IdxMatchKillMatrixCreatedAt
    ON MatchKillMatrix (CreatedAt);